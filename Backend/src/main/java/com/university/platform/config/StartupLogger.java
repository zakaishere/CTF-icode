package com.university.platform.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Validates required secrets at startup (fail-fast) and prints a concise
 * startup banner once the Spring context is fully ready.
 *
 * Fail-fast rules (enforced in @PostConstruct, before any request is served):
 *   - JWT_SECRET must be set and must not be a placeholder.
 *   - CTF_FLAG_SECRET must be set and must not be a placeholder.
 * If either check fails the application refuses to start with a clear message.
 */
@Component
@Slf4j
public class StartupLogger {

    @Value("${spring.profiles.active:production}")
    private String activeProfile;

    @Value("${ctf.instance.host}")
    private String ctfInstanceHost;

    @Value("${docker.host}")
    private String dockerHost;

    @Value("${ctf.flag-secret}")
    private String flagSecret;

    @Value("${jwt.secret}")
    private String jwtSecret;

    /**
     * Runs before the application accepts any traffic.
     * Throws immediately if either required secret is missing or is a placeholder,
     * preventing a deployment with known-insecure defaults from ever going live.
     */
    @PostConstruct
    public void validateSecrets() {
        StringBuilder errors = new StringBuilder();

        if (jwtSecret == null || jwtSecret.isBlank() || jwtSecret.startsWith("CHANGE_ME")) {
            errors.append("\n  - JWT_SECRET is not set or is a placeholder.")
                  .append("\n    Generate a real secret: openssl rand -base64 32")
                  .append("\n    Then set the environment variable: JWT_SECRET=<generated value>");
        }

        if (flagSecret == null || flagSecret.isBlank() || flagSecret.startsWith("CHANGE_ME")) {
            errors.append("\n  - CTF_FLAG_SECRET is not set or is a placeholder.")
                  .append("\n    Generate a real secret: openssl rand -base64 32")
                  .append("\n    Then set the environment variable: CTF_FLAG_SECRET=<generated value>");
        }

        if (!errors.isEmpty()) {
            throw new IllegalStateException(
                "\n\n╔══════════════════════════════════════════════════════════╗" +
                "\n║  FATAL: Required secrets are missing. Cannot start.      ║" +
                "\n╚══════════════════════════════════════════════════════════╝" +
                errors +
                "\n\nFix all issues above before starting the application.\n"
            );
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        log.info("╔══════════════════════════════════════╗");
        log.info("║       icode-ctf Platform Started     ║");
        log.info("╠══════════════════════════════════════╣");
        log.info("║ Profile:    {}", pad(activeProfile, 24) + "║");
        log.info("║ CTF Host:   {}", pad(ctfInstanceHost, 24) + "║");
        log.info("║ Docker:     {}", pad(maskDockerHost(dockerHost), 24) + "║");
        log.info("║ JWT Secret: {}", pad("✓ configured", 24) + "║");
        log.info("║ Flag Secret:{}", pad("✓ configured", 24) + "║");
        log.info("╚══════════════════════════════════════╝");
    }

    private String pad(String s, int len) {
        if (s == null) s = "not set";
        if (s.length() > len) s = s.substring(0, len - 3) + "...";
        return String.format("%-" + len + "s", s);
    }

    private String maskDockerHost(String host) {
        if (host.startsWith("unix://")) return "local socket";
        return host.replaceAll("(\\d+\\.\\d+)\\.\\d+\\.\\d+", "$1.*.*");
    }
}
