package com.university.platform.ctf.config;

import com.github.dockerjava.api.DockerClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;

/**
 * Fires once at startup and warns loudly about misconfigured secrets and Docker
 * settings that degrade build performance or break pwn challenge instances.
 */
@Slf4j
@Component
public class CTFSecurityStartupCheck {

    @Value("${ctf.flag-secret:CHANGE_ME}")
    private String flagSecret;

    private final DockerClient dockerClient;

    public CTFSecurityStartupCheck(@Nullable DockerClient dockerClient) {
        this.dockerClient = dockerClient;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void checkSecrets() {
        if ("CHANGE_ME".equals(flagSecret) || flagSecret.length() < 16) {
            log.warn("═══════════════════════════════════════════════════════");
            log.warn("  CTF FLAG SECRET is weak or still set to the default!");
            log.warn("  Set the CTF_FLAG_SECRET environment variable before");
            log.warn("  running any real competition. Generate with:");
            log.warn("    openssl rand -hex 32");
            log.warn("  All per-team HMAC flags are predictable without this.");
            log.warn("═══════════════════════════════════════════════════════");
        }
        checkBuildKit();
    }

    /**
     * Detects whether the Docker daemon has BuildKit enabled and warns if not.
     * BuildKit dramatically speeds up pwn challenge builds by parallelising
     * stages and using a content-addressable cache that survives daemon restarts.
     *
     * Enable it once on the host and never think about it again:
     *   echo '{"features":{"buildkit":true}}' | sudo tee /etc/docker/daemon.json
     *   sudo systemctl restart docker
     *
     * Docker Engine 23.0+ has BuildKit on by default; older versions do not.
     */
    private void checkBuildKit() {
        if (dockerClient == null) return;
        try {
            var info    = dockerClient.infoCmd().exec();
            var version = dockerClient.versionCmd().exec();
            String apiVersion = version.getApiVersion();

            // Docker API 1.43 == Engine 23.0 (first release with BuildKit default-on)
            boolean likelyEnabled = apiVersion != null
                    && compareApiVersions(apiVersion, "1.43") >= 0;

            if (!likelyEnabled) {
                log.warn("╔══════════════════════════════════════════════════════════╗");
                log.warn("║  DOCKER BUILDKIT IS LIKELY DISABLED (API v{}){}║",
                        apiVersion, " ".repeat(Math.max(0, 20 - String.valueOf(apiVersion).length())));
                log.warn("║  Pwn challenge builds will be slow without it.           ║");
                log.warn("║  Enable BuildKit on the host:                            ║");
                log.warn("║    echo '{\"features\":{\"buildkit\":true}}' \\             ║");
                log.warn("║      | sudo tee /etc/docker/daemon.json                 ║");
                log.warn("║    sudo systemctl restart docker                         ║");
                log.warn("╚══════════════════════════════════════════════════════════╝");
            } else {
                log.info("Docker BuildKit: enabled (API v{})", apiVersion);
            }
        } catch (Exception e) {
            log.debug("Could not check BuildKit status: {}", e.getMessage());
        }
    }

    /** Returns negative/zero/positive like String.compareTo but for "1.43" style versions. */
    private int compareApiVersions(String a, String b) {
        String[] pa = a.split("\\.");
        String[] pb = b.split("\\.");
        for (int i = 0; i < Math.max(pa.length, pb.length); i++) {
            int va = i < pa.length ? Integer.parseInt(pa[i]) : 0;
            int vb = i < pb.length ? Integer.parseInt(pb[i]) : 0;
            if (va != vb) return Integer.compare(va, vb);
        }
        return 0;
    }
}
