package com.university.platform.ctf.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.university.platform.ctf.config.WorkerAgentConfig;
import com.university.platform.ctf.exception.WorkerAgentException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

@Slf4j
@Service
public class WorkerAgentClient {

    public record StartResult(String instanceId, String status) {}

    public record InstanceStatus(String instanceId, String status, String host,
                                  Integer port, String expiresAt, String connectionString) {}

    private final WorkerAgentConfig    config;
    private final WorkerAgentHmacSigner signer;
    private final HttpClient           httpClient;
    private final ObjectMapper         objectMapper;

    public WorkerAgentClient(WorkerAgentConfig config, WorkerAgentHmacSigner signer) {
        this.config     = config;
        this.signer     = signer;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                .build();
        this.objectMapper = new ObjectMapper();
    }

    // ── Instance operations ────────────────────────────────────────────────────

    public StartResult startInstance(String image, String teamId, String challengeId,
                                     int durationMinutes, String protocol) {
        try {
            byte[] body = objectMapper.writeValueAsBytes(Map.of(
                    "image",            image != null ? image : "",
                    "team_id",          teamId != null ? teamId : "",
                    "challenge_id",     challengeId,
                    "duration_minutes", durationMinutes,
                    "protocol",         protocol != null ? protocol.toLowerCase() : "tcp"
            ));
            Map<String, Object> resp = post("/instances/start", body);
            return new StartResult((String) resp.get("instance_id"), (String) resp.get("status"));
        } catch (WorkerAgentException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkerAgentException("Failed to start agent instance: " + e.getMessage(), e);
        }
    }

    public InstanceStatus getInstanceStatus(String instanceId) {
        try {
            Map<String, Object> resp = get("/instances/" + instanceId + "/status");
            Integer port = resp.get("port") != null ? ((Number) resp.get("port")).intValue() : null;
            return new InstanceStatus(
                    (String) resp.get("instance_id"),
                    (String) resp.get("status"),
                    (String) resp.get("host"),
                    port,
                    (String) resp.get("expires_at"),
                    (String) resp.get("connection_string")
            );
        } catch (WorkerAgentException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkerAgentException("Failed to get instance status: " + e.getMessage(), e);
        }
    }

    public InstanceStatus waitForReady(String instanceId) throws InterruptedException {
        for (int i = 0; i < config.getPollMaxAttempts(); i++) {
            try {
                InstanceStatus status = getInstanceStatus(instanceId);
                if ("RUNNING".equals(status.status())) {
                    return status;
                }
                if ("FAILED".equals(status.status())) {
                    throw new WorkerAgentException(
                            "Agent instance " + instanceId + " failed to start");
                }
            } catch (WorkerAgentException e) {
                throw e;
            } catch (Exception e) {
                log.warn("Poll error for instance {}: {}", instanceId, e.getMessage());
            }
            Thread.sleep(config.getPollIntervalMs());
        }
        throw new WorkerAgentException("Instance " + instanceId + " not RUNNING after "
                + config.getPollMaxAttempts() + " attempts");
    }

    public void stopInstance(String instanceId, String reason) {
        try {
            byte[] body = objectMapper.writeValueAsBytes(
                    Map.of("reason", reason != null ? reason : "MANUAL"));
            post("/instances/" + instanceId + "/stop", body);
        } catch (Exception e) {
            log.warn("Failed to stop agent instance {}: {}", instanceId, e.getMessage());
        }
    }

    public String extendInstance(String instanceId, int extendMinutes) {
        try {
            byte[] body = objectMapper.writeValueAsBytes(
                    Map.of("extend_minutes", extendMinutes));
            Map<String, Object> resp = post("/instances/" + instanceId + "/extend", body);
            return (String) resp.get("new_expires_at");
        } catch (WorkerAgentException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkerAgentException("Failed to extend agent instance: " + e.getMessage(), e);
        }
    }

    // ── Build operations ───────────────────────────────────────────────────────

    public String buildImage(String challengeId, String zipUrl) {
        try {
            byte[] body = objectMapper.writeValueAsBytes(Map.of(
                    "challenge_id", challengeId,
                    "zip_url",      zipUrl
            ));
            Map<String, Object> resp = post("/images/build", body);
            return (String) resp.get("build_id");
        } catch (WorkerAgentException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkerAgentException("Failed to start remote build: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> getBuildStatus(String buildId) {
        try {
            return get("/images/build/" + buildId + "/status");
        } catch (WorkerAgentException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkerAgentException("Failed to get build status: " + e.getMessage(), e);
        }
    }

    // ── HTTP helpers ───────────────────────────────────────────────────────────

    private Map<String, Object> post(String path, byte[] body) throws Exception {
        String fullUrl = config.getUrl() + path;
        Map<String, String> sigHeaders = signer.sign("POST", fullUrl, body);

        HttpRequest.Builder req = HttpRequest.newBuilder()
                .uri(URI.create(fullUrl))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .timeout(Duration.ofSeconds(config.getTimeoutSeconds()));
        sigHeaders.forEach(req::header);

        HttpResponse<String> response = httpClient.send(req.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new WorkerAgentException("Agent HTTP " + response.statusCode()
                    + " for POST " + path + ": " + response.body());
        }
        return objectMapper.readValue(response.body(), new TypeReference<>() {});
    }

    private Map<String, Object> get(String path) throws Exception {
        String fullUrl = config.getUrl() + path;
        Map<String, String> sigHeaders = signer.sign("GET", fullUrl, new byte[0]);

        HttpRequest.Builder req = HttpRequest.newBuilder()
                .uri(URI.create(fullUrl))
                .GET()
                .timeout(Duration.ofSeconds(config.getTimeoutSeconds()));
        sigHeaders.forEach(req::header);

        HttpResponse<String> response = httpClient.send(req.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new WorkerAgentException("Agent HTTP " + response.statusCode()
                    + " for GET " + path + ": " + response.body());
        }
        return objectMapper.readValue(response.body(), new TypeReference<>() {});
    }
}
