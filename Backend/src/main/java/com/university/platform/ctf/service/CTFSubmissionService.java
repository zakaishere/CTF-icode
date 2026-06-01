package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.CTFSubmitResponse;
import com.university.platform.ctf.entity.CTFChallenge;
import com.university.platform.ctf.entity.CTFFlag;
import com.university.platform.ctf.entity.CTFSubmission;
import com.university.platform.ctf.entity.CTFSolve;
import com.university.platform.ctf.exception.CTFAlreadySolvedException;
import com.university.platform.ctf.exception.CTFCooldownException;
import com.university.platform.ctf.exception.CTFMaxAttemptsException;
import com.university.platform.ctf.flag.FlagVerifierRegistry;
import com.university.platform.ctf.repository.CTFChallengeRepository;
import com.university.platform.ctf.repository.CTFFlagRepository;
import com.university.platform.ctf.repository.CTFSubmissionRepository;
import com.university.platform.ctf.repository.CTFSolveRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * CHANGE 1 (Section 3, 14): Practice-mode flag submission.
 * Uses FlagVerifierRegistry (MessageDigest.isEqual) + ctf_flags table.
 * Falls back to challenge.flagHash for challenges without ctf_flags rows
 * (backwards compat for challenges created before migration_v4_ctf.sql).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CTFSubmissionService {

    private final CTFChallengeRepository challengeRepository;
    private final CTFFlagRepository      flagRepository;
    private final CTFSubmissionRepository submissionRepository;
    private final CTFSolveRepository     solveRepository;
    private final FlagVerifierRegistry   flagVerifierRegistry;

    private static final int COOLDOWN_SECONDS = 30;
    private final Map<String, Instant> lastSubmissionTime = new ConcurrentHashMap<>();

    @Transactional
    public CTFSubmitResponse submitFlag(UUID challengeId, String submittedValue,
                                        UUID userId, HttpServletRequest request) {
        CTFChallenge challenge = challengeRepository.findById(challengeId)
                .orElseThrow(() -> new EntityNotFoundException("Challenge not found: " + challengeId));
        if (!Boolean.TRUE.equals(challenge.getIsActive())) {
            throw new IllegalStateException("This challenge is not active.");
        }

        if (solveRepository.findByChallengeIdAndUserId(challengeId, userId).isPresent()) {
            throw new CTFAlreadySolvedException("You have already solved this challenge!");
        }

        long attempts = submissionRepository.countByChallengeIdAndUserId(challengeId, userId);
        if (attempts >= challenge.getMaxAttempts()) {
            throw new CTFMaxAttemptsException("Maximum attempts reached for this challenge.");
        }

        String rateKey = userId + ":" + challengeId;
        Instant last = lastSubmissionTime.get(rateKey);
        if (last != null) {
            long elapsed = Instant.now().getEpochSecond() - last.getEpochSecond();
            if (elapsed < COOLDOWN_SECONDS) {
                throw new CTFCooldownException(COOLDOWN_SECONDS - elapsed);
            }
        }
        lastSubmissionTime.put(rateKey, Instant.now());

        // CHANGE 1: verify against ctf_flags table using timing-safe comparators.
        // Fall back to SHA-256 flagHash for legacy challenges with no flag rows.
        boolean correct = checkFlag(challenge, submittedValue);

        CTFSubmission submission = CTFSubmission.builder()
                .challengeId(challengeId)
                .userId(userId)
                .submittedValue(submittedValue)
                .isCorrect(correct)
                .attemptNumber((int) attempts + 1)
                .submittedAt(LocalDateTime.now())
                .ipAddress(extractIp(request))
                .userAgent(request.getHeader("User-Agent"))
                .build();
        submissionRepository.save(submission);

        if (correct) {
            CTFSolve solve = CTFSolve.builder()
                    .challengeId(challengeId)
                    .userId(userId)
                    .solvedAt(LocalDateTime.now())
                    .pointsAwarded(challenge.getBasePoints())
                    .build();
            solveRepository.save(solve);



            log.info("CTF solve: user={} challenge={} points={}", userId, challengeId, challenge.getBasePoints());
            return CTFSubmitResponse.builder()
                    .correct(true)
                    .message("Correct! You earned " + challenge.getBasePoints() + " points.")
                    .pointsAwarded(challenge.getBasePoints())
                    .attemptsUsed((int) attempts + 1)
                    .maxAttempts(challenge.getMaxAttempts())
                    .build();
        }

        return CTFSubmitResponse.builder()
                .correct(false)
                .message("Incorrect flag. Try again.")
                .attemptsUsed((int) attempts + 1)
                .maxAttempts(challenge.getMaxAttempts())
                .build();
    }

    public List<CTFSubmission> getMySubmissions(UUID challengeId, UUID userId) {
        return submissionRepository.findByChallengeIdAndUserIdOrderBySubmittedAtDesc(
                challengeId, userId, PageRequest.of(0, 10));
    }

    // ── Flag verification ──────────────────────────────────────────────────────

    private boolean checkFlag(CTFChallenge challenge, String submission) {
        List<CTFFlag> flags = flagRepository.findByChallengeId(challenge.getId());

        if (!flags.isEmpty()) {
            // New path: use FlagVerifierRegistry (timing-safe, supports STATIC + REGEX)
            return flagVerifierRegistry.verifyAny(flags, submission);
        }

        // Legacy path: compare SHA-256 digests for challenges pre-dating migration_v4.
        // MessageDigest.isEqual on digest bytes prevents timing attacks on hex strings.
        String submittedHash = sha256(submission.trim());
        String expectedHash  = challenge.getFlagHash();
        if (submittedHash == null || expectedHash == null) return false;
        return MessageDigest.isEqual(
                submittedHash.getBytes(StandardCharsets.UTF_8),
                expectedHash.getBytes(StandardCharsets.UTF_8));
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 unavailable", e);
        }
    }

    private String extractIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }
}
