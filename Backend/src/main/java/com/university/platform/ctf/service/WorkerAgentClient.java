package com.university.platform.ctf.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.university.platform.ctf.config.WorkerAgentConfig;
import com.university.platform.ctf.exception.WorkerAgentException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
public class WorkerAgentClient {

    public record StartedInstance(String instanceId, String status) {}
    public record ReadyInstance(String instanceId, String host, int port, String expiresAt) {}

    private final WorkerAgentConfig config;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public WorkerAgentClient(WorkerAgentConfig config) {
        this.config = config;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                .build();
        this.objectMapper = new ObjectMapper();
    }

    public StartedInstance startInstance(String image, UUID teamId, UUID challengeId,
                                          int durationMinutes, String protocol) {
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "image", image != null ? image : "",
                    "team_id", teamId != null ? teamId.toString() : "",
                    "challenge_id", challengeId.toString(),
                    "duration_minutes", durationMinutes,
                    "protocol", protocol
            ));
            String resp = post("/instances/start", body);
            Map<String, Object> json = objectMapper.readValue(resp, new TypeReference<>() {});
            return new StartedInstance((String) json.get("instance_id"), (String) json.get("status"));
        } catch (WorkerAgentException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkerAgentException("Failed to start agent instance: " + e.getMessage(), e);
        }
    }

    public ReadyInstance waitForInstanceReady(String instanceId) throws InterruptedException {
        for (int i = 0; i < config.getPollMaxAttempts(); i++) {
            try {
                String resp = get("/instances/" + instanceId + "/status");
                Map<String, Object> json = objectMapper.readValue(resp, new TypeReference<>() {});
                String status = (String) json.get("status");
                if ("RUNNING".equals(status)) {
                    return new ReadyInstance(
                            (String) json.get("instance_id"),
                            (String) json.get("host"),
                            ((Number) json.get("port")).intValue(),
                            (String) json.get("expires_at")
                    );
                }
                if ("FAILED".equals(status)) {
                    throw new WorkerAgentException("Agent instance " + instanceId
                            + " failed: " + json.get("error"));
                }
            } catch (WorkerAgentException e) {
                throw e;
            } catch (InterruptedException e) {
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
            String body = objectMapper.writeValueAsString(
                    Map.of("reason", reason != null ? reason : "stopped"));
            post("/instances/" + instanceId + "/stop", body);
        } catch (Exception e) {
            log.warn("Failed to stop agent instance {}: {}", instanceId, e.getMessage());
        }
    }

    public String extendInstance(String instanceId, int extendMinutes) {
        try {
            String body = objectMapper.writeValueAsString(Map.of("extend_minutes", extendMinutes));
            String resp = post("/instances/" + instanceId + "/extend", body);
            Map<String, Object> json = objectMapper.readValue(resp, new TypeReference<>() {});
            return (String) json.get("new_expires_at");
        } catch (WorkerAgentException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkerAgentException("Failed to extend agent instance: " + e.getMessage(), e);
        }
    }

    public String buildImage(UUID challengeId, String zipUrl) {
        try {
            String body = objectMapper.writeValueAsString(Map.of(
                    "challenge_id", challengeId.toString(),
                    "zip_url", zipUrl
            ));
            String resp = post("/images/build", body);
            Map<String, Object> json = objectMapper.readValue(resp, new TypeReference<>() {});
            return (String) json.get("build_id");
        } catch (WorkerAgentException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkerAgentException("Failed to start remote build: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> getBuildStatus(String buildId) {
        try {
            String resp = get("/images/build/" + buildId + "/status");
            return objectMapper.readValue(resp, new TypeReference<>() {});
        } catch (WorkerAgentException e) {
            throw e;
        } catch (Exception e) {
            throw new WorkerAgentException("Failed to get build status: " + e.getMessage(), e);
        }
    }

    private String post(String path, String body) throws Exception {
        long timestamp = Instant.now().getEpochSecond();
        byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
        String bodyHash = sha256Hex(bodyBytes);
        String canonical = "POST\n" + path + "\n" + timestamp + "\n" + bodyHash;
        String signature = hmacSha256Hex(config.getSecret(), canonical);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(config.getUrl() + path))
                .header("Content-Type", "application/json")
                .header("X-Agent-Key", config.getKeyId())
                .header("X-Timestamp", String.valueOf(timestamp))
                .header("X-Signature", signature)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new WorkerAgentException("Agent returned HTTP " + response.statusCode()
                    + " for POST " + path + ": " + response.body());
        }
        return response.body();
    }

    private String get(String path) throws Exception {
        long timestamp = Instant.now().getEpochSecond();
        String bodyHash = sha256Hex(new byte[0]);
        String canonical = "GET\n" + path + "\n" + timestamp + "\n" + bodyHash;
        String signature = hmacSha256Hex(config.getSecret(), canonical);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(config.getUrl() + path))
                .header("Content-Type", "application/json")
                .header("X-Agent-Key", config.getKeyId())
                .header("X-Timestamp", String.valueOf(timestamp))
                .header("X-Signature", signature)
                .GET()
                .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new WorkerAgentException("Agent returned HTTP " + response.statusCode()
                    + " for GET " + path + ": " + response.body());
        }
        return response.body();
    }

    private String sha256Hex(byte[] data) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(data);
            return bytesToHex(hash);
        } catch (Exception e) {
            throw new WorkerAgentException("SHA-256 failed: " + e.getMessage(), e);
        }
    }

    private String hmacSha256Hex(String secret, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return bytesToHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new WorkerAgentException("HMAC-SHA256 failed: " + e.getMessage(), e);
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
