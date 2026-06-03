package com.university.platform.ctf.service;

import com.university.platform.ctf.config.WorkerAgentConfig;
import com.university.platform.ctf.exception.WorkerAgentException;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;

@Component
public class WorkerAgentHmacSigner {

    private final WorkerAgentConfig config;

    public WorkerAgentHmacSigner(WorkerAgentConfig config) {
        this.config = config;
    }

    /**
     * Signs a request per the agent HMAC spec.
     * PATH is extracted from fullUrl so host/port are never included in the canonical string.
     */
    public Map<String, String> sign(String method, String fullUrl, byte[] body) {
        try {
            String ts       = String.valueOf(Instant.now().getEpochSecond());
            String path     = URI.create(fullUrl).getPath();
            String bodyHash = HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(body));
            String canonical = method.toUpperCase() + "\n" + path + "\n" + ts + "\n" + bodyHash;

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    config.getSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String signature = HexFormat.of().formatHex(
                    mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));

            return Map.of(
                    "X-Agent-Key", config.getKeyId(),
                    "X-Timestamp", ts,
                    "X-Signature", signature
            );
        } catch (Exception e) {
            throw new WorkerAgentException("HMAC signing failed: " + e.getMessage(), e);
        }
    }
}
