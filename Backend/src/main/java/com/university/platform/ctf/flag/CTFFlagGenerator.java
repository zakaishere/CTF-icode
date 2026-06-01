package com.university.platform.ctf.flag;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Single source of truth for dynamic per-team CTF flags.
 *
 * <p>The flag value is derived from the challenge's flag format (a template the
 * teacher controls) by replacing the {@link #PLACEHOLDER} token with a per-team
 * string. The per-team string is the first 20 hex chars of
 * {@code HMAC-SHA256(secret, competition:challenge:team)} — deterministic, so the
 * value injected into the container and the value validated on submit always match.
 *
 * <p>Examples (token = {@code bbfaae63ea8785ad6da3}):
 * <ul>
 *   <li>format {@code FLAG{?}}        → {@code FLAG{bbfaae63ea8785ad6da3}}</li>
 *   <li>format {@code HTB{web_?}}    → {@code HTB{web_bbfaae63ea8785ad6da3}}</li>
 *   <li>format with no placeholder    → {@code FLAG{bbfaae63ea8785ad6da3}} (default wrapper)</li>
 * </ul>
 *
 * Both {@code CTFInstanceService} (injection) and {@code CTFTeamService}
 * (validation hashing) call this class so the two never drift apart.
 */
@Component
public class CTFFlagGenerator {

    /** Substring in a challenge's flag format that is replaced with the per-team token. */
    public static final String PLACEHOLDER = "?";

    /** Number of hex chars of the HMAC used as the per-team token. */
    private static final int TOKEN_HEX_LEN = 20;

    @Value("${ctf.flag-secret:CHANGE_ME}")
    private String flagSecret;

    /** Deterministic per-subject token (subject is usually the team id). */
    public String token(UUID competitionId, UUID challengeId, UUID subjectId) {
        String data = (competitionId != null ? competitionId.toString() : "practice")
                + ":" + challengeId + ":" + subjectId;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(flagSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hmac = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hmac).substring(0, TOKEN_HEX_LEN);
        } catch (Exception e) {
            throw new IllegalStateException("Flag generation failed", e);
        }
    }

    /**
     * The plaintext per-subject flag: the format with {@link #PLACEHOLDER} replaced
     * by the token. If the format is blank or has no placeholder, the token is
     * wrapped in the default {@code FLAG{...}} so a flag is always produced.
     */
    public String plainFlag(String flagFormat, UUID competitionId, UUID challengeId, UUID subjectId) {
        String tok = token(competitionId, challengeId, subjectId);
        if (flagFormat != null && flagFormat.contains(PLACEHOLDER)) {
            return flagFormat.replace(PLACEHOLDER, tok);
        }
        return "FLAG{" + tok + "}";
    }

    /** SHA-256 hex of the plaintext per-subject flag — the value stored and compared. */
    public String hash(String flagFormat, UUID competitionId, UUID challengeId, UUID subjectId) {
        return sha256(plainFlag(flagFormat, competitionId, challengeId, subjectId));
    }

    private String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
