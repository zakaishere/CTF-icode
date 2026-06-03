package com.university.platform.ctf.service;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.command.InspectContainerResponse;
import com.github.dockerjava.api.command.PullImageResultCallback;
import com.github.dockerjava.api.model.*;
import com.university.platform.ctf.config.WorkerAgentConfig;
import com.university.platform.ctf.dto.CTFInstanceResponse;
import com.university.platform.ctf.dto.CTFInstanceWebSocketMessage;
import com.university.platform.ctf.entity.CTFChallenge;
import com.university.platform.ctf.entity.CTFDockerImage;
import com.university.platform.ctf.entity.CTFInstance;
import com.university.platform.ctf.exception.CTFCapacityException;
import com.university.platform.ctf.flag.CTFFlagGenerator;
import com.university.platform.ctf.repository.CTFChallengeRepository;
import com.university.platform.ctf.repository.CTFDockerImageRepository;
import com.university.platform.ctf.repository.CTFInstanceRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class CTFInstanceService {

    private static final int    MAX_RENEWALS = 3;
    private static final String HTTP         = "HTTP";
    private static final String TCP          = "TCP";

    // TODO (PHASE 6 — deferred): Replace with a Redis SET for multi-node safety.
    // On a single server this ConcurrentHashMap is correct. With two backend nodes,
    // each has its own USED_PORTS and can assign the same port to different instances.
    // Migration: use RedisTemplate.opsForSet() with SETNX for atomic port reservation.
    private static final Set<Integer> USED_PORTS = ConcurrentHashMap.newKeySet();

    private final CTFChallengeRepository    challengeRepo;
    private final CTFInstanceRepository     instanceRepo;
    private final CTFDockerImageRepository  dockerImageRepo;
    private final CTFResourceConfigService  configService;
    private final SimpMessagingTemplate     ws;
    private final TransactionTemplate       txTemplate;
    private final Executor                  exec;
    private final DockerClient              dockerClient; // null = mock mode
    private final CTFFlagGenerator          flagGenerator;
    private final WorkerAgentConfig         workerAgentConfig;
    private final WorkerAgentClient         workerAgentClient;

    @Value("${ctf.instance.host:localhost}")
    private String instanceHost;

    // Host used for internal health-check probes (waitForPort / waitForHttp).
    // When the backend runs inside Docker, challenge containers publish their ports
    // on the HOST, not on the backend container's loopback. Set to
    // "host.docker.internal" (mapped via docker-compose extra_hosts) so probes
    // reach the host's published ports instead of the container's own loopback.
    @Value("${ctf.instance.health-check-host:localhost}")
    private String healthCheckHost;

    @Value("${ctf.instance.port.min:32000}")
    private int portMin;

    @Value("${ctf.instance.port.max:33000}")
    private int portMax;

    @Value("${ctf.instance.network.prefix:ctf-net-}")
    private String networkPrefix;

    public CTFInstanceService(CTFChallengeRepository challengeRepo,
                              CTFInstanceRepository instanceRepo,
                              CTFDockerImageRepository dockerImageRepo,
                              CTFResourceConfigService configService,
                              SimpMessagingTemplate ws,
                              TransactionTemplate txTemplate,
                              @Qualifier("ctfInstanceExecutor") Executor exec,
                              @Nullable DockerClient dockerClient,
                              CTFFlagGenerator flagGenerator,
                              WorkerAgentConfig workerAgentConfig,
                              WorkerAgentClient workerAgentClient) {
        this.challengeRepo    = challengeRepo;
        this.instanceRepo     = instanceRepo;
        this.dockerImageRepo  = dockerImageRepo;
        this.configService    = configService;
        this.ws               = ws;
        this.txTemplate       = txTemplate;
        this.exec             = exec;
        this.dockerClient     = dockerClient;
        this.flagGenerator    = flagGenerator;
        this.workerAgentConfig = workerAgentConfig;
        this.workerAgentClient = workerAgentClient;
    }

    // ── Port sync at startup ──────────────────────────────────────────────────

    @jakarta.annotation.PostConstruct
    public void syncPortsFromDb() {
        // Any STARTING instance is stale after a restart — its spawn thread is gone,
        // so it would otherwise block the user forever (counts against their limit).
        List<CTFInstance> stale = instanceRepo.findByStatusIn(List.of("STARTING"));
        for (CTFInstance inst : stale) {
            inst.setStatus("FAILED");
            inst.setErrorMessage("Spawn interrupted by a server restart.");
            inst.setStoppedAt(LocalDateTime.now());
            instanceRepo.save(inst);
        }
        if (!stale.isEmpty()) {
            log.info("Reconciled {} stale STARTING instance(s) to FAILED on startup.", stale.size());
        }

        instanceRepo.findOccupiedPorts().forEach(USED_PORTS::add);
        log.info("Synced {} occupied ports from DB.", USED_PORTS.size());
        if (dockerClient != null) {
            exec.execute(this::prewarmAllImages);
            exec.execute(this::reclaimOrphans); // reclaim any leaked containers/networks at boot
        }
    }

    // ── Request instance (optimistic) ─────────────────────────────────────────

    public CTFInstanceResponse requestInstance(UUID challengeId, UUID userId,
                                               UUID teamId, UUID competitionId) {
        CTFChallenge challenge = challengeRepo.findById(challengeId)
                .orElseThrow(() -> new EntityNotFoundException("Challenge not found."));
        if (!Boolean.TRUE.equals(challenge.getRequiresInstance())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This challenge does not require an instance.");
        }
        // The container port is resolved at spawn time from the image's EXPOSE
        // instruction (falling back to the configured port), so a null configured
        // port is fine as long as the image declares EXPOSE.

        // Return existing active instance
        Optional<CTFInstance> existing;
        if (teamId != null) {
            existing = instanceRepo.findActiveByTeamAndChallenge(teamId, challengeId);
        } else {
            existing = instanceRepo.findFirstByChallengeIdAndUserIdAndStatusIn(
                    challengeId, userId, List.of("RUNNING", "STARTING"));
        }
        if (existing.isPresent()) {
            CTFInstance inst = existing.get();
            return toResponse(inst, challenge, "STARTING".equals(inst.getStatus()) ? "Spinning up..." : null);
        }

        if (!configService.isInstanceCapacityAvailable()) {
            throw new CTFCapacityException("Server at capacity. Try again soon.");
        }

        var config = configService.getConfig();

        long userActive = instanceRepo.findByUserIdAndStatusIn(userId,
                List.of("STARTING", "RUNNING")).stream()
                .filter(i -> i.getExpiresAt() == null || i.getExpiresAt().isAfter(LocalDateTime.now()))
                .count();
        if (userActive >= config.getMaxInstancesPerUser()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Instance limit reached (" + config.getMaxInstancesPerUser() + ").");
        }

        int port = reservePort();

        // STATIC challenges inject the teacher's exact flag; DYNAMIC challenges get
        // a per-team derived value so cross-team copy-paste can be detected.
        String flagValue;
        if (challenge.getFlagType() == CTFChallenge.FlagType.STATIC) {
            flagValue = challenge.getFlagValue(); // plaintext stored at challenge-creation time
        } else {
            flagValue = flagGenerator.plainFlag(
                    challenge.getFlagFormat(), competitionId, challengeId,
                    teamId != null ? teamId : userId);
        }

        CTFInstance instance = instanceRepo.save(CTFInstance.builder()
                .challengeId(challengeId)
                .userId(userId)
                .teamId(teamId)
                .competitionId(competitionId)
                .assignedPort(port)
                .flagValue(flagValue)
                .status("STARTING")
                .startedAt(LocalDateTime.now())
                .expiresAt(LocalDateTime.now().plusMinutes(config.getMaxInstanceDurationMinutes()))
                .renewalCount(0)
                .build());

        final UUID   instanceId = instance.getId();
        final String userDest   = userId.toString();

        exec.execute(() -> spawnDockerAsync(instanceId, challengeId, challenge, port, userDest));

        return toResponse(instance, challenge, "Spinning up...");
    }

    // ── Status ─────────────────────────────────────────────────────────────────

    public CTFInstanceResponse getInstanceStatus(UUID challengeId, UUID userId, UUID teamId) {
        Optional<CTFInstance> found;
        if (teamId != null) {
            found = instanceRepo.findActiveByTeamAndChallenge(teamId, challengeId);
        } else {
            found = instanceRepo.findFirstByChallengeIdAndUserIdAndStatusIn(
                    challengeId, userId, List.of("RUNNING", "STARTING"));
        }
        return found.map(inst -> {
            CTFChallenge challenge = challengeRepo.findById(challengeId).orElse(null);
            return toResponse(inst, challenge, "STARTING".equals(inst.getStatus()) ? "Spinning up..." : null);
        }).orElse(null);
    }

    // ── Renew ──────────────────────────────────────────────────────────────────

    public CTFInstanceResponse renewInstance(UUID instanceId, UUID userId) {
        CTFInstance instance = instanceRepo.findById(instanceId)
                .orElseThrow(() -> new EntityNotFoundException("Instance not found."));
        if (!instance.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your instance.");
        }
        if (!"RUNNING".equals(instance.getStatus())) {
            throw new ResponseStatusException(HttpStatus.GONE, "Instance is not running.");
        }
        if (instance.getRenewalCount() >= MAX_RENEWALS) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Maximum renewals reached (" + MAX_RENEWALS + ").");
        }
        int durationMinutes = configService.getConfig().getMaxInstanceDurationMinutes();
        if (workerAgentConfig.isEnabled() && instance.getContainerId() != null) {
            String newExpiry = workerAgentClient.extendInstance(
                    instance.getContainerId(), durationMinutes);
            instance.setExpiresAt(parseDateTime(newExpiry));
            instance.setRenewalCount(instance.getRenewalCount() + 1);
            instanceRepo.save(instance);
            CTFChallenge challenge = challengeRepo.findById(instance.getChallengeId()).orElse(null);
            return toResponse(instance, challenge, null);
        }
        instance.setExpiresAt(LocalDateTime.now().plusMinutes(durationMinutes));
        instance.setRenewalCount(instance.getRenewalCount() + 1);
        instanceRepo.save(instance);

        CTFChallenge challenge = challengeRepo.findById(instance.getChallengeId()).orElse(null);
        return toResponse(instance, challenge, null);
    }

    // ── Stop ───────────────────────────────────────────────────────────────────

    public void stopInstance(UUID instanceId, UUID userId) {
        CTFInstance instance = instanceRepo.findById(instanceId)
                .orElseThrow(() -> new EntityNotFoundException("Instance not found."));
        if (!instance.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your instance.");
        }
        if (workerAgentConfig.isEnabled() && instance.getContainerId() != null) {
            workerAgentClient.stopInstance(instance.getContainerId(), "user_stop");
            instance.setStatus("STOPPED");
            instance.setStoppedAt(LocalDateTime.now());
            instanceRepo.save(instance);
            return;
        }
        exec.execute(() -> teardownContainer(instance));
        instance.setStatus("STOPPED");
        instance.setStoppedAt(LocalDateTime.now());
        USED_PORTS.remove(instance.getAssignedPort());
        instanceRepo.save(instance);
    }

    // ── Cleanup scheduler ──────────────────────────────────────────────────────

    @Scheduled(fixedDelayString = "${ctf.instance.cleanup-interval-ms:60000}")
    public void cleanupExpiredInstances() {
        List<CTFInstance> expired = instanceRepo
                .findAllByExpiresAtBeforeAndStatus(LocalDateTime.now(), "RUNNING");
        for (CTFInstance inst : expired) {
            try {
                // Notify BEFORE stopping so frontend can react
                ws.convertAndSendToUser(inst.getUserId().toString(), "/queue/ctf/instance",
                        CTFInstanceWebSocketMessage.builder()
                                .instanceId(inst.getId())
                                .status("EXPIRED")
                                .build());

                exec.execute(() -> teardownContainer(inst));
                inst.setStatus("EXPIRED");
                inst.setStoppedAt(LocalDateTime.now());
                USED_PORTS.remove(inst.getAssignedPort());
                instanceRepo.save(inst);
            } catch (Exception e) {
                log.error("Error expiring instance {}: {}", inst.getId(), e.getMessage());
            }
        }
        if (!expired.isEmpty()) {
            log.info("Expired {} CTF instances.", expired.size());
        }
    }

    // ── Orphan janitor (self-healing) ──────────────────────────────────────────

    /**
     * Reclaims leaked Docker resources so the address pool / disk never fills up:
     *   - exited/dead {@code ctf-*} containers (a force-remove that failed mid-cleanup)
     *   - {@code ctf-net-*} networks with no attached containers
     * Resources referenced by a live (STARTING/RUNNING) DB instance are protected,
     * so an in-flight spawn is never reaped.
     *
     * Runs at startup (via {@link #syncPortsFromDb()}) and on a fixed schedule.
     * Idempotent and safe to run anytime.
     */
    @Scheduled(fixedDelayString = "${ctf.instance.janitor-interval-ms:300000}")
    public void scheduledJanitor() {
        reclaimOrphans();
    }

    private void reclaimOrphans() {
        if (dockerClient == null) return;

        List<CTFInstance> live = instanceRepo.findByStatusIn(List.of("STARTING", "RUNNING"));
        Set<String> protectedContainers = live.stream()
                .map(CTFInstance::getContainerId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<String> protectedNetworks = live.stream()
                .map(CTFInstance::getNetworkId).filter(Objects::nonNull).collect(Collectors.toSet());

        int reapedContainers = 0;
        int reapedNetworks   = 0;

        // 1. Exited/dead ctf-* containers
        try {
            List<Container> containers = dockerClient.listContainersCmd()
                    .withShowAll(true)
                    .withNameFilter(List.of("ctf-"))
                    .exec();
            for (Container ct : containers) {
                String state = ct.getState(); // "running", "exited", "created", "dead"
                boolean isCtf = ct.getNames() != null && Arrays.stream(ct.getNames())
                        .anyMatch(n -> n.startsWith("/ctf-") && !n.startsWith("/ctf-net"));
                if (isCtf
                        && !"running".equalsIgnoreCase(state)
                        && !"created".equalsIgnoreCase(state) // may be a spawn in-flight
                        && !protectedContainers.contains(ct.getId())) {
                    try {
                        dockerClient.removeContainerCmd(ct.getId()).withForce(true).exec();
                        reapedContainers++;
                    } catch (Exception e) {
                        log.warn("Janitor could not remove container {}: {}", ct.getId(), e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Janitor container scan failed: {}", e.getMessage());
        }

        // 2. ctf-net-* networks with no attached containers
        try {
            List<Network> networks = dockerClient.listNetworksCmd().exec();
            for (Network net : networks) {
                if (net.getName() == null || !net.getName().startsWith(networkPrefix)) continue;
                if (protectedNetworks.contains(net.getId())) continue;
                try {
                    Network detail = dockerClient.inspectNetworkCmd().withNetworkId(net.getId()).exec();
                    if (detail.getContainers() == null || detail.getContainers().isEmpty()) {
                        dockerClient.removeNetworkCmd(net.getId()).exec();
                        reapedNetworks++;
                    }
                } catch (Exception e) {
                    log.warn("Janitor could not remove network {}: {}", net.getName(), e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("Janitor network scan failed: {}", e.getMessage());
        }

        if (reapedContainers > 0 || reapedNetworks > 0) {
            log.info("Janitor reclaimed {} orphan container(s) and {} orphan network(s).",
                    reapedContainers, reapedNetworks);
        }
    }

    // ── Admin operations ───────────────────────────────────────────────────────

    public List<CTFInstance> getAllActiveInstances() {
        return instanceRepo.findByStatusIn(List.of("STARTING", "RUNNING"));
    }

    public void adminStopInstance(UUID instanceId) {
        CTFInstance instance = instanceRepo.findById(instanceId)
                .orElseThrow(() -> new EntityNotFoundException("Instance not found."));
        exec.execute(() -> teardownContainer(instance));
        instance.setStatus("STOPPED");
        instance.setStoppedAt(LocalDateTime.now());
        USED_PORTS.remove(instance.getAssignedPort());
        instanceRepo.save(instance);
    }

    /**
     * Stops and destroys the active Docker instance for the given team + challenge,
     * if one exists. Called after a correct flag submission so the container is
     * reclaimed immediately. Never throws — teardown failures are logged only and
     * must never block the solve being recorded.
     *
     * @return true if an instance was found and stopped, false if none existed
     */
    public boolean stopInstanceOnSolve(UUID challengeId, UUID teamId) {
        try {
            Optional<CTFInstance> found = instanceRepo.findActiveByTeamAndChallenge(teamId, challengeId);
            if (found.isEmpty()) return false;
            CTFInstance instance = found.get();
            instance.setStatus("STOPPED");
            instance.setStoppedAt(LocalDateTime.now());
            USED_PORTS.remove(instance.getAssignedPort());
            instanceRepo.save(instance);
            exec.execute(() -> teardownContainer(instance));
            log.info("Stopped instance {} for team {} after correct solve of challenge {}",
                    instance.getId(), teamId, challengeId);
            return true;
        } catch (Exception e) {
            log.error("Failed to stop instance for team {} challenge {} on solve: {}",
                    teamId, challengeId, e.getMessage());
            return false;
        }
    }

    public List<CTFDockerImage> getAllImages() {
        return dockerImageRepo.findAll();
    }

    public void prewarmImages(List<String> imageRefs) {
        for (String ref : imageRefs) {
            exec.execute(() -> pullAndTrackImage(ref));
        }
    }

    // ── Docker async spawn ─────────────────────────────────────────────────────

    private void spawnDockerAsync(UUID instanceId, UUID challengeId,
                                   CTFChallenge challenge, int port, String userDest) {
        if (workerAgentConfig.isEnabled()) {
            try {
                CTFInstance inst = instanceRepo.findById(instanceId)
                        .orElseThrow(() -> new jakarta.persistence.EntityNotFoundException("Instance not found"));
                String imageName = challenge.getDockerImage();
                int durationMinutes = configService.getConfig().getMaxInstanceDurationMinutes();
                String protocol = connectionType(challenge);

                var started = workerAgentClient.startInstance(
                        imageName,
                        inst.getTeamId() != null ? inst.getTeamId().toString() : null,
                        challengeId.toString(),
                        durationMinutes, protocol);
                var ready = workerAgentClient.waitForReady(started.instanceId());

                String connStr = TCP.equals(protocol)
                        ? ready.host() + ":" + ready.port()
                        : "http://" + ready.host() + ":" + ready.port();
                LocalDateTime expiresAt = parseDateTime(ready.expiresAt());
                final String finalConnStr = connStr;
                final LocalDateTime finalExpiresAt = expiresAt;
                final String agentInstanceId = started.instanceId();
                final int agentPort = ready.port();

                USED_PORTS.remove(port); // release the locally reserved port; agent manages its own

                txTemplate.executeWithoutResult(s ->
                        instanceRepo.findById(instanceId).ifPresent(i -> {
                            i.setStatus("RUNNING");
                            i.setContainerId(agentInstanceId);
                            i.setConnectionString(finalConnStr);
                            i.setExpiresAt(finalExpiresAt);
                            i.setAssignedPort(agentPort);
                            instanceRepo.save(i);
                        }));

                ws.convertAndSendToUser(userDest, "/queue/ctf/instance",
                        CTFInstanceWebSocketMessage.builder()
                                .instanceId(instanceId)
                                .status("RUNNING")
                                .connectionType(protocol)
                                .connectionString(connStr)
                                .accessUrl(HTTP.equals(protocol) ? connStr : null)
                                .expiresAt(expiresAt)
                                .renewalCount(0)
                                .build());

                log.info("CTF instance {} RUNNING via agent: host={} port={}",
                        instanceId, ready.host(), ready.port());
            } catch (Exception e) {
                log.error("CTF instance {} failed via agent: {}", instanceId, e.getMessage());
                txTemplate.executeWithoutResult(s ->
                        instanceRepo.findById(instanceId).ifPresent(i -> {
                            i.setStatus("FAILED");
                            i.setErrorMessage(e.getMessage());
                            USED_PORTS.remove(i.getAssignedPort());
                            instanceRepo.save(i);
                        }));
                ws.convertAndSendToUser(userDest, "/queue/ctf/instance",
                        CTFInstanceWebSocketMessage.builder()
                                .instanceId(instanceId)
                                .status("FAILED")
                                .error("Failed to start environment via agent. Please try again.")
                                .build());
            }
            return;
        }

        String containerId  = null;
        String networkId    = null;
        String networkName  = null;

        try {
            if (dockerClient != null && challenge.getDockerImage() != null) {
                // 1. Ensure image is available
                pullImageIfNeeded(challenge.getDockerImage());

                // Resolve the container port from the image's EXPOSE instruction.
                // This is the source of truth — it works for challenges built before
                // the build-time auto-detect existed, with no rebuild and no manual
                // port setting required.
                final int resolvedPort = resolveContainerPort(challenge);

                // 2. Create per-instance isolated network.
                // NOTE: must NOT be internal — an internal network blocks the host
                // from reaching published ports (the player could never connect).
                // The per-instance network still isolates this container from every
                // other instance's container; combined with capability drops, PID
                // and memory/CPU limits, that's our containment boundary.
                networkName = networkPrefix + instanceId.toString().replace("-", "").substring(0, 12);
                networkId = dockerClient.createNetworkCmd()
                        .withName(networkName)
                        .withDriver("bridge")
                        .exec()
                        .getId();

                // Persist networkId immediately so the orphan janitor never reaps a
                // network that belongs to an in-flight (STARTING) spawn.
                final String earlyNid = networkId;
                txTemplate.executeWithoutResult(s ->
                    instanceRepo.findById(instanceId).ifPresent(inst -> {
                        inst.setNetworkId(earlyNid);
                        instanceRepo.save(inst);
                    }));

                // 3. Build env list — inject FLAG, exclude any teacher "FLAG" key
                List<String> env = buildEnvList(challenge, instanceId);

                // 4. Capability constraints
                var caps = new Capability[]{Capability.NET_ADMIN, Capability.SYS_ADMIN};

                var config = configService.getConfig();
                int memMb    = effectiveMemMb(challenge, config);
                int cpuPct   = effectiveCpuPct(challenge, config);
                int pidsLimit = challenge.getDockerPidsLimit() != null ? challenge.getDockerPidsLimit() : 200;

                // Explicit Ports.bind() avoids the PortBinding constructor's argument-order ambiguity.
                // This is equivalent to: docker run -p {port}:{resolvedPort}
                ExposedPort containerPort = ExposedPort.tcp(resolvedPort);
                Ports portBindings = new Ports();
                portBindings.bind(containerPort, Ports.Binding.bindPort(port));

                HostConfig hostConfig = HostConfig.newHostConfig()
                        .withPortBindings(portBindings)
                        .withMemory((long) memMb * 1024 * 1024)
                        .withCpuPeriod(100_000L)
                        .withCpuQuota((long) cpuPct * 1000L)
                        .withPidsLimit((long) pidsLimit)
                        .withCapDrop(caps)
                        .withNetworkMode(networkName)
                        .withReadonlyRootfs(false)
                        // tini as PID 1: propagates SIGTERM/SIGKILL to xinetd/socat children
                        // and reaps zombie processes — critical for PWN challenges that fork.
                        .withInit(true);

                String containerName = "ctf-" + instanceId.toString().replace("-", "").substring(0, 16);

                var createRes = dockerClient.createContainerCmd(challenge.getDockerImage())
                        .withName(containerName)
                        .withHostConfig(hostConfig)
                        .withExposedPorts(containerPort)
                        .withEnv(env)
                        .exec();
                containerId = createRes.getId();

                // Persist containerId before starting so the janitor protects it.
                final String earlyCid = containerId;
                txTemplate.executeWithoutResult(s ->
                    instanceRepo.findById(instanceId).ifPresent(inst -> {
                        inst.setContainerId(earlyCid);
                        instanceRepo.save(inst);
                    }));

                dockerClient.startContainerCmd(containerId).exec();

                // Give the container a moment to boot before the first probe — on a
                // loaded/slow host the app needs time before it binds its port.
                try { Thread.sleep(2000); } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                }

                // Wait until the published port actually accepts TCP connections.
                // This gives the in-container process time to start, and surfaces
                // "port not reachable" errors (wrong app port, app binds 127.0.0.1, etc.)
                // before we tell the frontend the instance is RUNNING.
                // 40 attempts × 1000ms = up to 40 s — generous for slow servers.
                boolean healthy = waitForPort(port, 40, 1000);
                if (!healthy) {
                    throw new IllegalStateException(
                        "Container started but port " + port + " is not accepting connections " +
                        "after 40 s. Check that the challenge app listens on 0.0.0.0:" +
                        resolvedPort + " inside the container.");
                }

                // For TCP (PWN) challenges the health-check above opens a real connection,
                // which causes xinetd/socat to fork a child for that connection. If the
                // Dockerfile uses single-shot socat (no 'fork') or bare 'nc -l', it handles
                // exactly one connection — the health check — and then stops accepting.
                // Detect this by waiting for the forked child to finish and then verifying
                // the port is STILL reachable. A second successful connection proves the
                // wrapper is in multi-connection mode; failure means the instance would be
                // dead on arrival for every student that follows.
                if (TCP.equals(connectionType(challenge))) {
                    try { Thread.sleep(1500); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    if (!waitForPort(port, 4, 500)) {
                        throw new IllegalStateException(
                            "TCP port " + port + " stopped accepting connections after the " +
                            "health-check. The challenge wrapper handles only one connection. " +
                            "Fix the Dockerfile: use 'socat TCP-LISTEN:" + resolvedPort +
                            ",reuseaddr,fork EXEC:./challenge' or 'xinetd' so multiple " +
                            "players can connect simultaneously.");
                    }
                }

                // Verify the container process is still alive — waitForPort only checks TCP,
                // not whether the app crashed immediately after the port became reachable.
                InspectContainerResponse inspect =
                        dockerClient.inspectContainerCmd(containerId).exec();
                if (!Boolean.TRUE.equals(inspect.getState().getRunning())) {
                    StringBuilder containerLogs = new StringBuilder();
                    try {
                        dockerClient.logContainerCmd(containerId)
                                .withStdOut(true)
                                .withStdErr(true)
                                .withTail(30)
                                .exec(new ResultCallback.Adapter<Frame>() {
                                    @Override
                                    public void onNext(Frame frame) {
                                        containerLogs.append(new String(frame.getPayload()));
                                    }
                                })
                                .awaitCompletion(5, TimeUnit.SECONDS);
                    } catch (Exception ignored) {}
                    throw new IllegalStateException(
                            "Container exited immediately after port was reachable.\nLast logs:\n"
                            + containerLogs);
                }

                // For HTTP challenges a bound host port is NOT enough: docker-proxy answers the
                // TCP handshake even when the container's backend port is dead — which happens
                // when the configured container port differs from the port the app actually
                // listens on inside the container. Verify the app answers a real HTTP request
                // (any status code, even 404, proves reachability).
                if (HTTP.equals(connectionType(challenge)) && !waitForHttp(port, 30, 2000)) {
                    throw new IllegalStateException(
                        "Port " + port + " (container port " + resolvedPort + ") is published but " +
                        "the app never answered an HTTP request. Make sure the app listens on " +
                        "0.0.0.0:" + resolvedPort + " (not 127.0.0.1) inside the container.");
                }
                log.info("Container health verified: running=true, port={}", port);

                final String cid     = containerId;
                final String nid     = networkId;
                final String cname   = containerName;
                final String connStr = buildConnectionString(challenge, port);

                txTemplate.executeWithoutResult(status ->
                    instanceRepo.findById(instanceId).ifPresent(inst -> {
                        inst.setStatus("RUNNING");
                        // Start the expiry clock NOW that the instance is actually usable —
                        // not when the DB record was created. Docker pull/build/start time
                        // must not eat into the player's session.
                        inst.setExpiresAt(LocalDateTime.now()
                                .plusMinutes(configService.getConfig().getMaxInstanceDurationMinutes()));
                        inst.setContainerId(cid);
                        inst.setNetworkId(nid);
                        inst.setContainerName(cname);
                        inst.setConnectionString(connStr);
                        instanceRepo.save(inst);
                    })
                );

                CTFInstance updated = instanceRepo.findById(instanceId).orElse(null);
                String connType = connectionType(challenge);
                ws.convertAndSendToUser(userDest, "/queue/ctf/instance",
                        CTFInstanceWebSocketMessage.builder()
                                .instanceId(instanceId)
                                .status("RUNNING")
                                .connectionType(connType)
                                .connectionString(connStr)
                                .accessUrl(HTTP.equals(connType) ? connStr : null)
                                .expiresAt(updated != null ? updated.getExpiresAt() : null)
                                .renewalCount(0)
                                .build());

                log.info("CTF instance {} RUNNING port={} network={} expires={}",
                        instanceId, port, networkName,
                        updated != null ? updated.getExpiresAt() : null);

            } else {
                // Mock mode
                Thread.sleep(2000);
                String connStr = buildConnectionString(challenge, port);
                String connType = connectionType(challenge);
                txTemplate.executeWithoutResult(s ->
                    instanceRepo.findById(instanceId).ifPresent(inst -> {
                        inst.setStatus("RUNNING");
                        inst.setExpiresAt(LocalDateTime.now()
                                .plusMinutes(configService.getConfig().getMaxInstanceDurationMinutes()));
                        inst.setConnectionString(connStr);
                        instanceRepo.save(inst);
                    })
                );
                ws.convertAndSendToUser(userDest, "/queue/ctf/instance",
                        CTFInstanceWebSocketMessage.builder()
                                .instanceId(instanceId)
                                .status("RUNNING")
                                .connectionType(connType)
                                .connectionString(connStr)
                                .accessUrl(HTTP.equals(connType) ? connStr : null)
                                .expiresAt(instanceRepo.findById(instanceId)
                                        .map(CTFInstance::getExpiresAt).orElse(null))
                                .renewalCount(0)
                                .build());
            }

        } catch (Exception e) {
            log.error("CTF instance {} failed: {}", instanceId, e.getMessage());

            final String networkToClean = networkId;
            final String containerToClean = containerId;
            txTemplate.executeWithoutResult(s ->
                instanceRepo.findById(instanceId).ifPresent(inst -> {
                    inst.setStatus("FAILED");
                    inst.setErrorMessage(e.getMessage());
                    USED_PORTS.remove(inst.getAssignedPort());
                    instanceRepo.save(inst);
                })
            );

            if (dockerClient != null) {
                if (containerToClean != null) {
                    try { dockerClient.removeContainerCmd(containerToClean).withForce(true).exec(); }
                    catch (Exception ex) { log.warn("Cleanup container failed: {}", ex.getMessage()); }
                }
                // Retry network removal — the container was just force-removed and
                // Docker needs a moment to detach the endpoint, otherwise the network leaks.
                removeNetworkWithRetry(networkToClean);
            }

            ws.convertAndSendToUser(userDest, "/queue/ctf/instance",
                    CTFInstanceWebSocketMessage.builder()
                            .instanceId(instanceId)
                            .status("FAILED")
                            .error("Failed to start environment. Please try again.")
                            .build());
        }
    }

    // ── Container teardown ─────────────────────────────────────────────────────

    private void teardownContainer(CTFInstance instance) {
        if (dockerClient == null) return;
        String containerId = instance.getContainerId();
        String networkId   = instance.getNetworkId();

        if (containerId != null) {
            // Graceful stop — separate try so a "permission denied" here does not
            // prevent the force-remove below from running.
            try {
                dockerClient.stopContainerCmd(containerId).withTimeout(10).exec();
            } catch (Exception e) {
                log.warn("Could not stop container {} (will force-remove anyway): {}",
                        containerId, e.getMessage());
            }
            // Force-remove always runs regardless of whether stop succeeded.
            try {
                dockerClient.removeContainerCmd(containerId)
                        .withForce(true)
                        .withRemoveVolumes(true)
                        .exec();
                log.info("Container removed: {}", containerId);
            } catch (Exception e) {
                log.warn("Could not remove container {}: {}", containerId, e.getMessage());
                // PWN containers running xinetd/socat with setuid binaries can be
                // unkillable via Docker API (AppArmor/userns EPERM on SIGKILL).
                // Force-disconnect from the per-instance network so the subnet is
                // freed and reusable even if the container itself stays alive.
                if (networkId != null) {
                    try {
                        dockerClient.disconnectFromNetworkCmd()
                                .withNetworkId(networkId)
                                .withContainerId(containerId)
                                .withForce(true)
                                .exec();
                        log.info("Force-disconnected stuck container {} from network {}",
                                containerId, networkId);
                    } catch (Exception de) {
                        log.warn("Could not disconnect container {} from network {}: {}",
                                containerId, networkId, de.getMessage());
                    }
                }
            }
        }
        // Remove the per-instance bridge network after the container has been removed.
        if (networkId != null) {
            removeNetworkWithRetry(networkId);
        }
    }

    /**
     * Removes a Docker network, retrying with backoff. Docker often reports
     * "network has active endpoints" for a short window after the container is
     * removed because the endpoint isn't fully detached yet — a single attempt
     * leaks the network, and leaked networks exhaust Docker's address pool
     * (~31 bridge networks), after which no new instance can be created.
     */
    private void removeNetworkWithRetry(String networkId) {
        if (dockerClient == null || networkId == null) return;
        for (int attempt = 1; attempt <= 4; attempt++) {
            try {
                dockerClient.removeNetworkCmd(networkId).exec();
                log.info("Network removed: {}", networkId);
                return;
            } catch (Exception e) {
                log.warn("Network removal attempt {}/4 failed for {}: {}",
                        attempt, networkId, e.getMessage());
                // Before sleeping, force-disconnect any endpoints still attached.
                // This handles the case where a container could not be killed
                // (permission denied) but can still be detached from the network.
                try {
                    Network detail = dockerClient.inspectNetworkCmd().withNetworkId(networkId).exec();
                    if (detail.getContainers() != null) {
                        for (String cid : detail.getContainers().keySet()) {
                            try {
                                dockerClient.disconnectFromNetworkCmd()
                                        .withNetworkId(networkId)
                                        .withContainerId(cid)
                                        .withForce(true)
                                        .exec();
                                log.info("Disconnected endpoint {} from network {} (retry cleanup)",
                                        cid.substring(0, Math.min(12, cid.length())), networkId);
                            } catch (Exception de) { /* ignore per-endpoint errors */ }
                        }
                    }
                } catch (Exception ie) { /* network may already be gone */ }
                try { Thread.sleep(1000L * attempt); }
                catch (InterruptedException ie) { Thread.currentThread().interrupt(); return; }
            }
        }
        log.error("Gave up removing network {} after 4 attempts — janitor will reclaim it.", networkId);
    }

    // ── Image pre-warming ──────────────────────────────────────────────────────

    private void prewarmAllImages() {
        List<String> images = challengeRepo.findDistinctDockerImages();
        for (String image : images) {
            pullAndTrackImage(image);
        }
    }

    private void pullAndTrackImage(String imageRef) {
        CTFDockerImage record = dockerImageRepo.findByImageRef(imageRef)
                .orElseGet(() -> dockerImageRepo.save(
                        CTFDockerImage.builder().imageRef(imageRef).status("PULLING").build()));

        // Locally-built images (e.g. psp-ctf/*) only exist on this host — mark
        // READY without attempting a registry pull that would always 404.
        if (imageExistsLocally(imageRef)) {
            record.setStatus("READY");
            record.setPulledAt(LocalDateTime.now());
            record.setError(null);
            dockerImageRepo.save(record);
            log.info("Image present locally, skipping pull: {}", imageRef);
            return;
        }

        // psp-ctf/* images are built from teacher ZIPs — they never exist on any registry.
        // If the local check above missed it the image was never built (or was pruned).
        if (imageRef.startsWith("psp-ctf/")) {
            record.setStatus("FAILED");
            record.setError("Locally-built image not found. Re-upload the challenge ZIP to rebuild.");
            dockerImageRepo.save(record);
            log.warn("Local build image not found: {}. Re-upload the challenge ZIP to rebuild.", imageRef);
            return;
        }

        record.setStatus("PULLING");
        record.setPulledAt(null);
        dockerImageRepo.save(record);

        try {
            log.info("Pulling CTF image: {}", imageRef);
            dockerClient.pullImageCmd(imageRef)
                    .exec(new PullImageResultCallback())
                    .awaitCompletion(5, TimeUnit.MINUTES);
            record.setStatus("READY");
            record.setPulledAt(LocalDateTime.now());
            record.setError(null);
            dockerImageRepo.save(record);
            log.info("Image ready: {}", imageRef);
        } catch (Exception e) {
            record.setStatus("FAILED");
            record.setError(e.getMessage());
            dockerImageRepo.save(record);
            log.warn("Pre-warm failed for {}: {}", imageRef, e.getMessage());
        }
    }

    private void pullImageIfNeeded(String imageRef) throws InterruptedException {
        // Already present locally (built from a teacher ZIP, or previously pulled) — use as-is.
        if (imageExistsLocally(imageRef)) return;
        // psp-ctf/* images are local builds — they cannot be pulled from any registry.
        // If not found locally the teacher must re-upload the ZIP to trigger a rebuild.
        if (imageRef.startsWith("psp-ctf/")) {
            throw new IllegalStateException(
                    "Challenge image not found locally: " + imageRef +
                    ". Please re-upload the challenge ZIP to rebuild the image.");
        }
        dockerClient.pullImageCmd(imageRef)
                .exec(new PullImageResultCallback())
                .awaitCompletion(3, TimeUnit.MINUTES);
    }

    private boolean imageExistsLocally(String imageRef) {
        try {
            dockerClient.inspectImageCmd(imageRef).exec();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ── Container port resolution ──────────────────────────────────────────────

    /**
     * Determines which port inside the container to publish, in priority order:
     *   1. If the image's EXPOSE list contains the teacher-configured port, honour it.
     *   2. Otherwise use the first TCP port the image EXPOSEs (the source of truth —
     *      what the app actually listens on) and persist it back to the challenge so
     *      the UI and future spawns stay consistent.
     *   3. If the image has no EXPOSE, fall back to the configured port.
     *   4. If neither exists, fail with a clear, actionable message.
     */
    private int resolveContainerPort(CTFChallenge challenge) {
        Integer configured = challenge.getDockerExposedPort();
        List<Integer> exposed = imageExposedPorts(challenge.getDockerImage());

        if (!exposed.isEmpty()) {
            if (configured != null && exposed.contains(configured)) {
                return configured;
            }
            int detected = exposed.get(0);
            if (configured == null || !configured.equals(detected)) {
                txTemplate.executeWithoutResult(s ->
                    challengeRepo.findById(challenge.getId()).ifPresent(ch -> {
                        ch.setDockerExposedPort(detected);
                        challengeRepo.save(ch);
                    }));
                log.info("Resolved container port for challenge {} to {} from image EXPOSE (was {})",
                        challenge.getId(), detected, configured);
            }
            return detected;
        }

        if (configured != null) return configured;

        throw new IllegalStateException(
                "Cannot determine the container port: image " + challenge.getDockerImage() +
                " declares no EXPOSE instruction and no port is configured. Add 'EXPOSE <port>' " +
                "to the Dockerfile (matching the port your app listens on) and rebuild, or set the " +
                "exposed port in the challenge settings.");
    }

    /** Returns the TCP ports the image declares via EXPOSE, in declaration order. */
    private List<Integer> imageExposedPorts(String imageRef) {
        if (dockerClient == null || imageRef == null) return List.of();
        try {
            var info = dockerClient.inspectImageCmd(imageRef).exec();
            ExposedPort[] ports = info.getConfig() != null ? info.getConfig().getExposedPorts() : null;
            if (ports == null) return List.of();
            List<Integer> result = new ArrayList<>();
            for (ExposedPort ep : ports) {
                if (InternetProtocol.TCP.equals(ep.getProtocol())) result.add(ep.getPort());
            }
            return result;
        } catch (Exception e) {
            log.warn("Could not inspect image {} for EXPOSE ports: {}", imageRef, e.getMessage());
            return List.of();
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Atomically picks a free port and marks it used.
     * synchronized prevents two concurrent requestInstance() calls from picking
     * the same port before either completes the DB write.
     */
    private synchronized int reservePort() {
        int port = findFreePort();
        USED_PORTS.add(port);
        return port;
    }

    private int findFreePort() {
        int range = portMax - portMin + 1;
        for (int attempt = 0; attempt < range; attempt++) {
            int port = portMin + ThreadLocalRandom.current().nextInt(range);
            if (!USED_PORTS.contains(port) && isPortAvailable(port)) {
                return port;
            }
        }
        throw new CTFCapacityException("No available ports. Server at capacity.");
    }

    private boolean isPortAvailable(int port) {
        try (ServerSocket s = new ServerSocket(port)) {
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * Polls {@code localhost:hostPort} until a TCP connection succeeds or
     * {@code maxAttempts} × {@code delayMs} ms elapse.
     */
    private boolean waitForPort(int hostPort, int maxAttempts, long delayMs) {
        for (int i = 0; i < maxAttempts; i++) {
            try (java.net.Socket s = new java.net.Socket(healthCheckHost, hostPort)) {
                return true;
            } catch (IOException ignored) {
                // port not ready yet
            }
            try { Thread.sleep(delayMs); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); return false; }
        }
        return false;
    }

    /**
     * Probes {@code http://localhost:hostPort/} until the app returns any HTTP status
     * (a dead backend port makes docker-proxy close the connection → IOException → retry).
     * Catches the "configured container port ≠ app's real port" misconfiguration that a
     * plain TCP check cannot, because docker-proxy answers the handshake regardless.
     */
    private boolean waitForHttp(int hostPort, int maxAttempts, long delayMs) {
        for (int i = 0; i < maxAttempts; i++) {
            try {
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection)
                        URI.create("http://" + healthCheckHost + ":" + hostPort + "/").toURL().openConnection();
                conn.setConnectTimeout(2000);
                conn.setReadTimeout(2000);
                conn.setRequestMethod("GET");
                conn.setInstanceFollowRedirects(false);
                int code = conn.getResponseCode(); // any status means the app is reachable
                conn.disconnect();
                if (code > 0) return true;
            } catch (IOException ignored) {
                // app not answering yet, or the backend port is dead
            }
            try { Thread.sleep(delayMs); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); return false; }
        }
        return false;
    }

    private List<String> buildEnvList(CTFChallenge challenge, UUID instanceId) {
        List<String> env = new ArrayList<>();

        // Inject from docker_env_vars (teacher-supplied), skip any FLAG key
        if (challenge.getDockerEnvVars() != null) {
            challenge.getDockerEnvVars().forEach((k, v) -> {
                String flagEnvName = challenge.getDockerFlagEnv() != null
                        ? challenge.getDockerFlagEnv().toUpperCase()
                        : "FLAG";
                if (!k.equalsIgnoreCase(flagEnvName) && !k.equalsIgnoreCase("FLAG")) {
                    env.add(k + "=" + v);
                }
            });
        }

        // Inject FLAG value
        CTFInstance inst = instanceRepo.findById(instanceId).orElse(null);
        if (inst != null && inst.getFlagValue() != null) {
            String flagEnv = challenge.getDockerFlagEnv() != null ? challenge.getDockerFlagEnv() : "FLAG";
            env.add(flagEnv + "=" + inst.getFlagValue());
        }

        return env;
    }

    private String connectionType(CTFChallenge challenge) {
        return TCP.equals(challenge.getConnectionType()) ? TCP : HTTP;
    }

    private String buildConnectionString(CTFChallenge challenge, int port) {
        if (TCP.equals(challenge.getConnectionType())) {
            return instanceHost + ":" + port;
        }
        return "http://" + instanceHost + ":" + port;
    }

    private int effectiveMemMb(CTFChallenge challenge, com.university.platform.ctf.entity.CTFResourceConfig config) {
        return challenge.getDockerMemoryMb() != null ? challenge.getDockerMemoryMb()
                : config.getContainerMemoryLimitMb();
    }

    private int effectiveCpuPct(CTFChallenge challenge, com.university.platform.ctf.entity.CTFResourceConfig config) {
        return challenge.getDockerCpuPercent() != null ? challenge.getDockerCpuPercent()
                : config.getContainerCpuPercent();
    }

    private LocalDateTime parseDateTime(String dateTime) {
        if (dateTime == null) {
            return LocalDateTime.now().plusMinutes(
                    configService.getConfig().getMaxInstanceDurationMinutes());
        }
        try {
            return OffsetDateTime.parse(dateTime).toLocalDateTime();
        } catch (Exception e) {
            try {
                return LocalDateTime.parse(dateTime);
            } catch (Exception e2) {
                log.warn("Could not parse datetime '{}', using default expiry", dateTime);
                return LocalDateTime.now().plusMinutes(
                        configService.getConfig().getMaxInstanceDurationMinutes());
            }
        }
    }

    private CTFInstanceResponse toResponse(CTFInstance inst, CTFChallenge challenge, String message) {
        String connType = (challenge != null && TCP.equals(challenge.getConnectionType())) ? TCP : HTTP;
        String connStr  = inst.getConnectionString();
        return CTFInstanceResponse.builder()
                .instanceId(inst.getId())
                .connectionType(connType)
                .connectionString("RUNNING".equals(inst.getStatus()) ? connStr : null)
                .accessUrl("RUNNING".equals(inst.getStatus()) && HTTP.equals(connType) ? connStr : null)
                .expiresAt(inst.getExpiresAt())
                .status(inst.getStatus())
                .message(message)
                .renewalCount(inst.getRenewalCount() != null ? inst.getRenewalCount() : 0)
                .build();
    }
}
