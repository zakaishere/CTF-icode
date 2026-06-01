package com.university.platform.ctf.service;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.command.BuildImageResultCallback;
import com.github.dockerjava.api.command.PullImageResultCallback;
import com.github.dockerjava.api.model.BuildResponseItem;
import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.InternetProtocol;
import com.university.platform.ctf.dto.CTFBuildWebSocketMessage;
import com.university.platform.ctf.entity.CTFChallengeBuild;
import com.university.platform.ctf.repository.CTFChallengeBuildRepository;
import com.university.platform.ctf.repository.CTFChallengeRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.Nullable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
@Service
public class CTFBuildService {

    private final DockerClient               dockerClient;
    private final CTFStorageService          storageService;
    private final CTFChallengeBuildRepository buildRepo;
    private final CTFChallengeRepository     challengeRepo;
    private final SimpMessagingTemplate      ws;
    private final String                     imagePrefix;
    private final int                        buildTimeoutSeconds;

    @Value("${ctf.build.max-zip-size-mb:100}")
    private int maxZipSizeMb;

    public CTFBuildService(
            @Nullable DockerClient dockerClient,
            CTFStorageService storageService,
            CTFChallengeBuildRepository buildRepo,
            CTFChallengeRepository challengeRepo,
            SimpMessagingTemplate ws,
            @Value("${ctf.images.prefix:psp-ctf}") String imagePrefix,
            @Value("${ctf.build.timeout-seconds:300}") int buildTimeoutSeconds) {
        this.dockerClient        = dockerClient;
        this.storageService      = storageService;
        this.buildRepo           = buildRepo;
        this.challengeRepo       = challengeRepo;
        this.ws                  = ws;
        this.imagePrefix         = imagePrefix;
        this.buildTimeoutSeconds = buildTimeoutSeconds;
    }

    /**
     * Asynchronously builds a Docker image from a ZIP containing a Dockerfile.
     */
    @Async("ctfBuildExecutor")
    public void buildFromZip(CTFChallengeBuild build, Path zipPath) {
        doBuildFromZip(build, zipPath, null);
    }

    /**
     * Asynchronously pulls an image from a registry URL.
     */
    @Async("ctfBuildExecutor")
    public void pullFromRegistry(CTFChallengeBuild build, String registryUrl) {
        try {
            // Mark as PULLING
            build.setBuildStatus("PULLING");
            build.setBuildStartedAt(LocalDateTime.now());
            buildRepo.save(build);
            notifyBuild(build, null);

            if (dockerClient == null) {
                // Mock mode
                log.info("Mock mode: simulating Docker pull for {}", registryUrl);
                Thread.sleep(1000);
                build.setBuildStatus("READY");
                build.setBuiltImageTag(registryUrl);
                build.setBuildFinishedAt(LocalDateTime.now());
                build.setImageSizeMb(0);
            } else {
                dockerClient.pullImageCmd(registryUrl)
                        .exec(new PullImageResultCallback())
                        .awaitCompletion(buildTimeoutSeconds, TimeUnit.SECONDS);

                build.setBuildStatus("READY");
                build.setBuiltImageTag(registryUrl);
                build.setBuildFinishedAt(LocalDateTime.now());
                build.setImageSizeMb(getImageSizeMb(registryUrl));
            }

            buildRepo.save(build);

            // Update challenge.dockerImage
            challengeRepo.findById(build.getChallengeId()).ifPresent(c -> {
                c.setDockerImage(registryUrl);
                challengeRepo.save(c);
            });

            Integer detectedPort = autoDetectContainerPort(build.getChallengeId(), registryUrl);

            log.info("Pull READY for challenge {}: {} (EXPOSE port={})",
                    build.getChallengeId(), registryUrl, detectedPort);
            notifyBuild(build, null, detectedPort);

        } catch (Exception e) {
            log.error("Pull FAILED for challenge {}: {}", build.getChallengeId(), e.getMessage());
            build.setBuildStatus("FAILED");
            build.setBuildFinishedAt(LocalDateTime.now());
            build.setErrorMessage(e.getMessage());
            buildRepo.save(build);
            notifyBuild(build, e.getMessage());
        }
    }

    /**
     * Asynchronously rebuilds from a new ZIP, replacing the previous image.
     * Increments the version and then runs the full build pipeline.
     */
    @Async("ctfBuildExecutor")
    public void rebuild(CTFChallengeBuild build, Path newZipPath) {
        // Keep the old tag so we can delete it AFTER the new build succeeds.
        // Deleting it upfront would cause every instance spawn during the build
        // to fail with "image not found locally" because the challenge still
        // references the old tag until the new build finishes.
        String oldImageTag = build.getBuiltImageTag();

        // Increment version, reset status
        build.setVersion(build.getVersion() != null ? build.getVersion() + 1 : 2);
        build.setBuildStatus("PENDING");
        build.setBuildLog(null);
        build.setErrorMessage(null);
        build.setBuiltImageTag(null);
        buildRepo.save(build);

        // Run the build pipeline directly (already on ctfBuildExecutor thread).
        // Pass the old image tag so Docker can reuse unchanged layers (e.g. the
        // apt-get layer) instead of re-downloading packages from scratch.
        doBuildFromZip(build, newZipPath, oldImageTag);

        // Only remove the old image after the new one is confirmed READY so that
        // in-flight spawns keep working throughout the rebuild window.
        if ("READY".equals(build.getBuildStatus()) && dockerClient != null && oldImageTag != null) {
            try {
                dockerClient.removeImageCmd(oldImageTag).withForce(true).exec();
                log.info("Removed old image after successful rebuild: {}", oldImageTag);
            } catch (Exception e) {
                log.warn("Could not remove old image {}: {}", oldImageTag, e.getMessage());
            }
        }
    }

    /**
     * Internal synchronous build logic — shared by buildFromZip and rebuild.
     *
     * @param cacheFromTag optional image tag to use as a layer-cache source
     *                     (pass the previous image on rebuilds to skip unchanged
     *                     apt-get layers; pass null for first-time builds)
     */
    private void doBuildFromZip(CTFChallengeBuild build, Path zipPath,
                                @org.springframework.lang.Nullable String cacheFromTag) {
        Path extractedDir = null;
        try {
            build.setBuildStatus("BUILDING");
            build.setBuildStartedAt(LocalDateTime.now());
            buildRepo.save(build);
            notifyBuild(build, null);

            extractedDir = storageService.extractZip(zipPath, build.getId());

            Path dockerContext = storageService.findDockerContext(extractedDir);
            if (dockerContext == null) {
                throw new IllegalArgumentException(
                        "ZIP does not contain a Dockerfile. " +
                        "Zip the folder's contents (not the folder itself) so Dockerfile is at the ZIP root.");
            }

            // Parse EXPOSE from the Dockerfile text immediately so the DB has a port
            // value even before the image finishes building. This is an early estimate
            // — the post-build image inspection (autoDetectContainerPort) is the
            // authoritative value and will overwrite this if they differ.
            Integer earlyPort = storageService.parseDockerfileExposePort(dockerContext);
            if (earlyPort != null) {
                log.info("Dockerfile EXPOSE {} detected for challenge {} (early, pre-build)",
                        earlyPort, build.getChallengeId());
            } else {
                // Default to 1337 so the challenge is spawnable even if the author
                // forgot EXPOSE. The post-build image inspection will correct it.
                earlyPort = 1337;
                log.warn("No EXPOSE instruction found in Dockerfile for challenge {} — " +
                         "defaulting container port to 1337. Add EXPOSE <port> to your Dockerfile.",
                        build.getChallengeId());
            }
            final int resolvedEarlyPort = earlyPort;
            challengeRepo.findById(build.getChallengeId()).ifPresent(c -> {
                if (c.getDockerExposedPort() == null) {
                    c.setDockerExposedPort(resolvedEarlyPort);
                    challengeRepo.save(c);
                }
            });

            String imageTag = buildImageTag(build.getChallengeId(), build.getVersion());
            build.setBuiltImageTag(imageTag);

            if (dockerClient == null) {
                log.info("Mock mode: simulating Docker build for challenge {}", build.getChallengeId());
                Thread.sleep(2000);
                build.setBuildStatus("READY");
                build.setBuildFinishedAt(LocalDateTime.now());
                build.setBuildLog("Mock build completed successfully.\nImage: " + imageTag);
                build.setImageSizeMb(0);
            } else {
                File contextDir = dockerContext.toFile();
                AtomicReference<StringBuilder> logBuilder = new AtomicReference<>(new StringBuilder());

                var buildCmd = dockerClient.buildImageCmd(contextDir)
                        .withTags(Set.of(imageTag))
                        // Tell BuildKit (when enabled on the daemon) to embed its layer
                        // manifest into the image so future builds can use it as cache.
                        // Harmless when BuildKit is not enabled — the daemon ignores it.
                        // To enable BuildKit globally: add {"features":{"buildkit":true}}
                        // to /etc/docker/daemon.json and restart Docker.
                        .withBuildArg("BUILDKIT_INLINE_CACHE", "1");

                // Reuse the previous image's layers as a cache source so unchanged
                // layers (especially the apt-get install layer in pwn Dockerfiles) are
                // not re-run on rebuilds. This is the primary build-speed win.
                if (cacheFromTag != null && !cacheFromTag.isBlank()) {
                    try {
                        dockerClient.inspectImageCmd(cacheFromTag).exec();
                        buildCmd = buildCmd.withCacheFrom(Set.of(cacheFromTag));
                        log.info("Build will use cache-from: {}", cacheFromTag);
                    } catch (Exception e) {
                        log.debug("Cache-from image {} not available locally, building without cache: {}",
                                cacheFromTag, e.getMessage());
                    }
                }

                boolean completed = buildCmd
                        .exec(new BuildImageResultCallback() {
                            @Override
                            public void onNext(BuildResponseItem item) {
                                super.onNext(item);
                                if (item.getStream() != null) {
                                    logBuilder.get().append(item.getStream());
                                }
                            }
                        })
                        .awaitCompletion(buildTimeoutSeconds, TimeUnit.SECONDS);

                if (!completed) {
                    throw new IllegalStateException(
                            "Docker build timed out after " + buildTimeoutSeconds + "s. " +
                            "Increase ctf.build.timeout-seconds or simplify the Dockerfile.");
                }

                build.setBuildStatus("READY");
                build.setBuildFinishedAt(LocalDateTime.now());
                build.setBuildLog(logBuilder.get().toString());
                build.setImageSizeMb(getImageSizeMb(imageTag));
            }

            buildRepo.save(build);

            challengeRepo.findById(build.getChallengeId()).ifPresent(c -> {
                c.setDockerImage(imageTag);
                challengeRepo.save(c);
            });

            Integer detectedPort = autoDetectContainerPort(build.getChallengeId(), imageTag);

            log.info("Build READY for challenge {}: {} (EXPOSE port={})",
                    build.getChallengeId(), imageTag, detectedPort);
            notifyBuild(build, null, detectedPort);

        } catch (Exception e) {
            log.error("Build FAILED for challenge {}: {}", build.getChallengeId(), e.getMessage());
            build.setBuildStatus("FAILED");
            build.setBuildFinishedAt(LocalDateTime.now());
            build.setErrorMessage(e.getMessage());
            buildRepo.save(build);
            notifyBuild(build, e.getMessage());
        } finally {
            if (extractedDir != null) {
                storageService.cleanup(extractedDir);
            }
        }
    }

    // ── Auto port detection ───────────────────────────────────────────────────

    /**
     * Inspects the built/pulled image's EXPOSE instructions and updates
     * challenge.dockerExposedPort to the first TCP port found.
     * This is the source of truth — it overrides whatever the teacher typed
     * so the port mismatch error can never happen again.
     *
     * @return the detected port, or null if none found
     */
    private Integer autoDetectContainerPort(UUID challengeId, String imageTag) {
        if (dockerClient == null) return null;
        try {
            var info = dockerClient.inspectImageCmd(imageTag).exec();
            var exposedPorts = info.getConfig().getExposedPorts();
            if (exposedPorts == null || exposedPorts.length == 0) {
                log.warn("No EXPOSE instruction found in image {} for challenge {}", imageTag, challengeId);
                return null;
            }
            // Pick the first TCP port; warn if multiple are exposed
            Integer detected = null;
            for (ExposedPort ep : exposedPorts) {
                if (InternetProtocol.TCP.equals(ep.getProtocol())) {
                    detected = ep.getPort();
                    break;
                }
            }
            if (detected == null) return null;

            final int port = detected;
            challengeRepo.findById(challengeId).ifPresent(c -> {
                Integer current = c.getDockerExposedPort();
                c.setDockerExposedPort(port);
                challengeRepo.save(c);
                if (current == null || current != port) {
                    log.info("Auto-detected EXPOSE port {} for challenge {} (was: {})",
                            port, challengeId, current);
                } else {
                    log.debug("EXPOSE port {} confirmed for challenge {}", port, challengeId);
                }
            });
            return port;
        } catch (Exception e) {
            log.warn("Could not auto-detect EXPOSE port for image {}: {}", imageTag, e.getMessage());
            return null;
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private String buildImageTag(UUID challengeId, int version) {
        return imagePrefix + "/challenge-" + challengeId.toString().substring(0, 8) + ":v" + version;
    }

    private int getImageSizeMb(String imageTag) {
        if (dockerClient == null) return 0;
        try {
            var images = dockerClient.listImagesCmd()
                    .withImageNameFilter(imageTag)
                    .exec();
            if (!images.isEmpty() && images.get(0).getSize() != null) {
                return (int) (images.get(0).getSize() / (1024 * 1024));
            }
        } catch (Exception e) {
            log.warn("Could not get image size for {}: {}", imageTag, e.getMessage());
        }
        return 0;
    }

    private void notifyBuild(CTFChallengeBuild build, String error) {
        notifyBuild(build, error, null);
    }

    private void notifyBuild(CTFChallengeBuild build, String error, Integer detectedPort) {
        try {
            CTFBuildWebSocketMessage msg = CTFBuildWebSocketMessage.builder()
                    .buildId(build.getId())
                    .challengeId(build.getChallengeId())
                    .status(build.getBuildStatus())
                    .imageTag(build.getBuiltImageTag())
                    .imageSizeMb(build.getImageSizeMb())
                    .error(error)
                    .detectedPort(detectedPort)
                    .build();
            if (build.getBuiltBy() != null) {
                ws.convertAndSendToUser(build.getBuiltBy().toString(), "/queue/ctf/build", msg);
            }
        } catch (Exception e) {
            log.warn("Failed to send build WebSocket notification: {}", e.getMessage());
        }
    }
}
