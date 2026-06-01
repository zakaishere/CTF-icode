package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.*;
import com.university.platform.ctf.entity.CTFChallenge;
import com.university.platform.ctf.entity.CTFFlag;
import com.university.platform.ctf.entity.CTFSolve;
import com.university.platform.ctf.entity.CTFSubmission;
import com.university.platform.ctf.repository.*;
import com.university.platform.identity.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CTFTeacherService {

    private static final Pattern FLAG_PATTERN =
            Pattern.compile("^\\S{3,}$");

    private final CTFChallengeRepository  challengeRepository;
    private final CTFFlagRepository       flagRepository;
    private final CTFSolveRepository      solveRepository;
    private final CTFSubmissionRepository submissionRepository;
    private final UserRepository          userRepository;

    // ── My challenges ────────────────────────────────────────────────────────

    public List<CTFChallengeResponse> getMyChallenges(UUID authorId,
                                                      String category,
                                                      String difficulty,
                                                      String status) {
        List<CTFChallenge> challenges = filterMyChallenges(authorId, category, difficulty, status);
        return challenges.stream().map(c -> toResponse(c, false)).collect(Collectors.toList());
    }

    public CTFChallengeDetailResponse getChallengeDetail(UUID id, UUID authorId) {
        CTFChallenge c = loadOwned(id, authorId);
        return toDetailResponse(c);
    }

    // ── Create ───────────────────────────────────────────────────────────────

    @Transactional
    public CTFChallengeResponse createChallenge(CTFChallengeCreateRequest dto, UUID authorId) {
        validateFlag(dto.getPlainFlag());

        CTFChallenge c = new CTFChallenge();
        c.setTitle(dto.getTitle());
        c.setDescription(dto.getDescription());
        c.setCategory(CTFChallenge.CTFCategory.valueOf(dto.getCategory().toUpperCase()));
        c.setDifficulty(CTFChallenge.CTFDifficulty.valueOf(dto.getDifficulty().toUpperCase()));
        c.setBasePoints(dto.getBasePoints());
        c.setFlagHash(sha256(dto.getPlainFlag().trim()));
        c.setFlagFormat(dto.getFlagFormat() != null ? dto.getFlagFormat() : "FLAG{?}");
        boolean requiresInstance = dto.getRequiresInstance() != null && dto.getRequiresInstance();
        c.setRequiresInstance(requiresInstance);
        // dockerImage is now optional at creation time — it can be set later via the build/upload flow.
        validateDockerImageName(dto.getDockerImage());
        c.setDockerImage(dto.getDockerImage());
        c.setDockerExposedPort(dto.getDockerExposedPort());
        c.setContainerEnvVars(dto.getContainerEnvVars());
        c.setDockerFlagEnv(dto.getDockerFlagEnv() != null ? dto.getDockerFlagEnv() : "FLAG");
        c.setConnectionType(dto.getConnectionType() != null ? dto.getConnectionType().toUpperCase() : "HTTP");
        c.setDockerEnvVars(stripFlagKey(dto.getDockerEnvVars(), dto.getDockerFlagEnv()));
        c.setDockerMemoryMb(dto.getDockerMemoryMb());
        c.setDockerCpuPercent(dto.getDockerCpuPercent());
        c.setDockerPidsLimit(dto.getDockerPidsLimit());
        c.setDownloadableFileUrl(dto.getDownloadableFileUrl());
        c.setDownloadableFileName(dto.getDownloadableFileName());
        c.setMaxAttempts(dto.getMaxAttempts() != null ? dto.getMaxAttempts() : 10);
        c.setIsActive(dto.getIsActive() != null ? dto.getIsActive() : false);
        c.setHints(buildHints(dto.getHints()));
        c.setAuthorId(authorId);
        c.setDeleted(false);

        challengeRepository.save(c);

        // CHANGE 1 (Section 3, 14): also persist into ctf_flags so practice-mode
        // verification uses FlagVerifierRegistry (timing-safe MessageDigest.isEqual).
        flagRepository.save(CTFFlag.builder()
                .challengeId(c.getId())
                .type("STATIC")
                .content(dto.getPlainFlag().trim())
                .caseInsensitive(false)
                .build());

        return toResponse(c, false);
    }

    // ── Update ───────────────────────────────────────────────────────────────

    @Transactional
    public CTFChallengeResponse updateChallenge(UUID id, CTFChallengeUpdateRequest dto, UUID authorId) {
        CTFChallenge c = loadOwned(id, authorId);

        if (dto.getTitle() != null)               c.setTitle(dto.getTitle());
        if (dto.getDescription() != null)          c.setDescription(dto.getDescription());
        if (dto.getCategory() != null)             c.setCategory(CTFChallenge.CTFCategory.valueOf(dto.getCategory().toUpperCase()));
        if (dto.getDifficulty() != null)           c.setDifficulty(CTFChallenge.CTFDifficulty.valueOf(dto.getDifficulty().toUpperCase()));
        if (dto.getBasePoints() != null)           c.setBasePoints(dto.getBasePoints());
        if (dto.getPlainFlag() != null) {
            validateFlag(dto.getPlainFlag());
            c.setFlagHash(sha256(dto.getPlainFlag().trim()));
            // CHANGE 1: replace ctf_flags entry so practice verification uses the new value
            flagRepository.deleteByChallengeId(c.getId());
            flagRepository.save(CTFFlag.builder()
                    .challengeId(c.getId())
                    .type("STATIC")
                    .content(dto.getPlainFlag().trim())
                    .caseInsensitive(false)
                    .build());
        }
        if (dto.getFlagFormat() != null)           c.setFlagFormat(dto.getFlagFormat());
        if (dto.getRequiresInstance() != null)     c.setRequiresInstance(dto.getRequiresInstance());
        if (dto.getDockerImage() != null) {
            validateDockerImageName(dto.getDockerImage());
            c.setDockerImage(dto.getDockerImage());
        }
        if (dto.getDockerExposedPort() != null)     c.setDockerExposedPort(dto.getDockerExposedPort());
        if (dto.getContainerEnvVars() != null)     c.setContainerEnvVars(dto.getContainerEnvVars());
        if (dto.getDockerFlagEnv() != null)        c.setDockerFlagEnv(dto.getDockerFlagEnv());
        if (dto.getConnectionType() != null)       c.setConnectionType(dto.getConnectionType().toUpperCase());
        if (dto.getDockerEnvVars() != null)        c.setDockerEnvVars(stripFlagKey(dto.getDockerEnvVars(), dto.getDockerFlagEnv()));
        if (dto.getDockerMemoryMb() != null)       c.setDockerMemoryMb(dto.getDockerMemoryMb());
        if (dto.getDockerCpuPercent() != null)     c.setDockerCpuPercent(dto.getDockerCpuPercent());
        if (dto.getDockerPidsLimit() != null)      c.setDockerPidsLimit(dto.getDockerPidsLimit());
        if (dto.getDownloadableFileUrl() != null)  c.setDownloadableFileUrl(dto.getDownloadableFileUrl());
        if (dto.getDownloadableFileName() != null) c.setDownloadableFileName(dto.getDownloadableFileName());
        if (dto.getMaxAttempts() != null)          c.setMaxAttempts(dto.getMaxAttempts());
        if (dto.getIsActive() != null)             c.setIsActive(dto.getIsActive());
        if (dto.getHints() != null)                c.setHints(buildHints(dto.getHints()));

        challengeRepository.save(c);
        return toResponse(c, false);
    }

    // ── Toggle active ────────────────────────────────────────────────────────

    @Transactional
    public CTFChallengeResponse toggleActive(UUID id, UUID authorId) {
        CTFChallenge c = loadOwned(id, authorId);
        c.setIsActive(!Boolean.TRUE.equals(c.getIsActive()));
        challengeRepository.save(c);
        return toResponse(c, false);
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    @Transactional
    public void deleteChallenge(UUID id, UUID authorId) {
        CTFChallenge c = loadOwned(id, authorId);
        long solves = solveRepository.countByChallengeId(id);
        if (solves > 0) {
            // Soft delete — preserve solve records
            c.setDeleted(true);
            c.setDeletedAt(LocalDateTime.now());
            c.setIsActive(false);
            challengeRepository.save(c);
        } else {
            // Hard delete — no history to preserve
            challengeRepository.delete(c);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private CTFChallenge loadOwned(UUID id, UUID authorId) {
        CTFChallenge c = challengeRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new EntityNotFoundException("Challenge not found: " + id));
        if (!c.getAuthorId().equals(authorId)) {
            throw new AccessDeniedException("You do not own this challenge");
        }
        return c;
    }

    private List<CTFChallenge> filterMyChallenges(UUID authorId, String category, String difficulty, String status) {
        CTFChallenge.CTFCategory  cat  = parseCategory(category);
        CTFChallenge.CTFDifficulty diff = parseDifficulty(difficulty);
        Boolean active = parseStatus(status);

        if (cat != null)    return challengeRepository.findByAuthorIdAndDeletedFalseAndCategoryOrderByCreatedAtDesc(authorId, cat);
        if (diff != null)   return challengeRepository.findByAuthorIdAndDeletedFalseAndDifficultyOrderByCreatedAtDesc(authorId, diff);
        if (active != null) return challengeRepository.findByAuthorIdAndDeletedFalseAndIsActiveOrderByCreatedAtDesc(authorId, active);
        return challengeRepository.findByAuthorIdAndDeletedFalseOrderByCreatedAtDesc(authorId);
    }

    private void validateFlag(String plainFlag) {
        if (plainFlag == null || plainFlag.isBlank()) {
            throw new IllegalArgumentException("Flag is required");
        }
        if (!FLAG_PATTERN.matcher(plainFlag.trim()).matches()) {
            throw new IllegalArgumentException(
                    "Flag must be at least 3 characters and contain no whitespace");
        }
    }

    private List<CTFHint> buildHints(List<CTFHintRequest> requests) {
        if (requests == null) return new ArrayList<>();
        return requests.stream().map(r -> new CTFHint(
                UUID.randomUUID().toString(),
                r.getCost() != null ? r.getCost() : 0,
                r.getText()
        )).collect(Collectors.toList());
    }

    private CTFChallengeResponse toResponse(CTFChallenge c, boolean withStats) {
        long solves   = withStats ? solveRepository.countByChallengeId(c.getId()) : 0;
        long attempts = withStats ? submissionRepository.countByChallengeId(c.getId()) : 0;
        return CTFChallengeResponse.builder()
                .id(c.getId())
                .title(c.getTitle())
                .description(c.getDescription())
                .category(c.getCategory() != null ? c.getCategory().name() : null)
                .difficulty(c.getDifficulty() != null ? c.getDifficulty().name() : null)
                .basePoints(c.getBasePoints())
                .flagFormat(c.getFlagFormat())
                .requiresInstance(c.getRequiresInstance())
                .dockerImage(c.getDockerImage())
                .dockerExposedPort(c.getDockerExposedPort())
                .containerEnvVars(c.getContainerEnvVars())
                .dockerFlagEnv(c.getDockerFlagEnv())
                .connectionType(c.getConnectionType())
                .dockerEnvVars(c.getDockerEnvVars())
                .dockerMemoryMb(c.getDockerMemoryMb())
                .dockerCpuPercent(c.getDockerCpuPercent())
                .dockerPidsLimit(c.getDockerPidsLimit())
                .downloadableFileUrl(c.getDownloadableFileUrl())
                .downloadableFileName(c.getDownloadableFileName())
                .hints(c.getHints())
                .maxAttempts(c.getMaxAttempts())
                .isActive(c.getIsActive())
                .authorId(c.getAuthorId())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .solveCount(solves)
                .attemptCount(attempts)
                .build();
    }

    private CTFChallengeDetailResponse toDetailResponse(CTFChallenge c) {
        long solves   = solveRepository.countByChallengeId(c.getId());
        long attempts = submissionRepository.countByChallengeId(c.getId());

        List<CTFSolve> recentSolveEntities = solveRepository
                .findByChallengeIdOrderBySolvedAtDesc(c.getId(), PageRequest.of(0, 10));

        List<CTFSubmission> recentSubEntities = submissionRepository
                .findByChallengeIdOrderBySubmittedAtDesc(c.getId(), PageRequest.of(0, 20));

        List<CTFChallengeDetailResponse.RecentSolve> recentSolves =
                recentSolveEntities.stream().map(s -> {
                    String name = resolveDisplayName(s.getUserId());
                    return CTFChallengeDetailResponse.RecentSolve.builder()
                            .userId(s.getUserId())
                            .userDisplayName(name)
                            .solvedAt(s.getSolvedAt())
                            .pointsAwarded(s.getPointsAwarded())
                            .build();
                }).collect(Collectors.toList());

        List<CTFChallengeDetailResponse.SubmissionRecord> recentSubs =
                recentSubEntities.stream().map(s -> {
                    String name = resolveDisplayName(s.getUserId());
                    return CTFChallengeDetailResponse.SubmissionRecord.builder()
                            .id(s.getId())
                            .userId(s.getUserId())
                            .userDisplayName(name)
                            .correct(Boolean.TRUE.equals(s.getIsCorrect()))
                            .submittedValueMasked(maskValue(s.getSubmittedValue()))
                            .submittedAt(s.getSubmittedAt())
                            .build();
                }).collect(Collectors.toList());

        return CTFChallengeDetailResponse.builder()
                .id(c.getId())
                .title(c.getTitle())
                .description(c.getDescription())
                .category(c.getCategory() != null ? c.getCategory().name() : null)
                .difficulty(c.getDifficulty() != null ? c.getDifficulty().name() : null)
                .basePoints(c.getBasePoints())
                .flagFormat(c.getFlagFormat())
                .requiresInstance(c.getRequiresInstance())
                .dockerImage(c.getDockerImage())
                .dockerExposedPort(c.getDockerExposedPort())
                .containerEnvVars(c.getContainerEnvVars())
                .dockerFlagEnv(c.getDockerFlagEnv())
                .connectionType(c.getConnectionType())
                .dockerEnvVars(c.getDockerEnvVars())
                .dockerMemoryMb(c.getDockerMemoryMb())
                .dockerCpuPercent(c.getDockerCpuPercent())
                .dockerPidsLimit(c.getDockerPidsLimit())
                .downloadableFileUrl(c.getDownloadableFileUrl())
                .downloadableFileName(c.getDownloadableFileName())
                .hints(c.getHints())
                .maxAttempts(c.getMaxAttempts())
                .isActive(c.getIsActive())
                .authorId(c.getAuthorId())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .solveCount(solves)
                .attemptCount(attempts)
                .recentSolves(recentSolves)
                .recentSubmissions(recentSubs)
                .build();
    }

    private String resolveDisplayName(UUID userId) {
        return userRepository.findById(userId)
                .map(u -> u.getFirstName() + " " + u.getLastName())
                .orElse("Unknown");
    }

    private String maskValue(String value) {
        if (value == null || value.length() <= 4) return "***";
        return value.substring(0, 3) + "***";
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private CTFChallenge.CTFCategory parseCategory(String s) {
        if (s == null || s.isBlank()) return null;
        try { return CTFChallenge.CTFCategory.valueOf(s.toUpperCase()); } catch (IllegalArgumentException e) { return null; }
    }

    private CTFChallenge.CTFDifficulty parseDifficulty(String s) {
        if (s == null || s.isBlank()) return null;
        try { return CTFChallenge.CTFDifficulty.valueOf(s.toUpperCase()); } catch (IllegalArgumentException e) { return null; }
    }

    private Boolean parseStatus(String s) {
        if ("active".equalsIgnoreCase(s))   return true;
        if ("inactive".equalsIgnoreCase(s)) return false;
        return null;
    }

    private static final Pattern IMAGE_NAME_PATTERN =
            Pattern.compile("^[a-z0-9][a-z0-9._/:\\-]*$");

    private void validateDockerImageName(String image) {
        if (image == null || image.isBlank()) return;
        if (!IMAGE_NAME_PATTERN.matcher(image).matches()) {
            throw new IllegalArgumentException("Invalid Docker image name: " + image);
        }
    }

    private Map<String, String> stripFlagKey(Map<String, String> vars, String flagEnvName) {
        if (vars == null) return null;
        String flagKey = (flagEnvName != null ? flagEnvName : "FLAG").toUpperCase();
        Map<String, String> cleaned = new java.util.LinkedHashMap<>(vars);
        cleaned.keySet().removeIf(k -> k.equalsIgnoreCase(flagKey) || k.equalsIgnoreCase("FLAG"));
        return cleaned;
    }

}
