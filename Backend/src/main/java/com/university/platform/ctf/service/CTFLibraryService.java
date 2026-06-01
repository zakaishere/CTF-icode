package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.*;
import com.university.platform.ctf.entity.*;
import com.university.platform.ctf.repository.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Manages the teacher's reusable challenge library. Library challenges have
 * {@code is_library=true} and no {@code competition_id}. When a teacher adds one
 * to a competition, a copy is created with {@code competition_id} set and
 * {@code library_source_id} pointing back to the original — so the library
 * challenge and the competition copy are independent rows.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class CTFLibraryService {

    private static final Logger log = LoggerFactory.getLogger(CTFLibraryService.class);

    private static final Pattern FLAG_PATTERN = Pattern.compile("^\\S{3,}$");

    private final CTFChallengeRepository        challengeRepo;
    private final CTFChallengeBuildRepository   buildRepo;
    private final CTFTeamRepository             teamRepo;
    private final CTFTeamFlagRepository         flagRepo;
    private final CTFTeamService                teamService;
    private final CTFCompetitionTeacherService  competitionTeacher;

    // ── List ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<CTFLibraryChallengeDTO> getMyLibrary(UUID userId) {
        return challengeRepo
                .findByLibraryOwnerIdAndIsLibraryTrueAndDeletedFalseOrderByCreatedAtDesc(userId)
                .stream()
                .map(this::toLibraryDto)
                .collect(Collectors.toList());
    }

    // ── Create ────────────────────────────────────────────────────────────────

    public CTFLibraryChallengeDTO saveToLibrary(CTFChallengeCreateRequest dto, UUID userId) {
        CTFChallenge.FlagType flagType = "DYNAMIC".equalsIgnoreCase(dto.getFlagType())
                ? CTFChallenge.FlagType.DYNAMIC
                : CTFChallenge.FlagType.STATIC;

        if (flagType == CTFChallenge.FlagType.STATIC) {
            validateFlag(dto.getPlainFlag());
        }

        CTFChallenge c = new CTFChallenge();
        c.setIsLibrary(true);
        c.setLibraryOwnerId(userId);
        c.setAuthorId(userId);
        c.setTitle(dto.getTitle());
        c.setDescription(dto.getDescription());
        c.setCategory(CTFChallenge.CTFCategory.valueOf(dto.getCategory().toUpperCase()));
        c.setDifficulty(CTFChallenge.CTFDifficulty.valueOf(dto.getDifficulty().toUpperCase()));
        c.setBasePoints(dto.getBasePoints());
        c.setFlagType(flagType);
        if (flagType == CTFChallenge.FlagType.STATIC) {
            c.setFlagHash(sha256(dto.getPlainFlag().trim()));
            c.setFlagValue(dto.getPlainFlag().trim());
        } else {
            c.setFlagHash("dynamic");
            c.setFlagValue(null);
        }
        c.setFlagFormat(dto.getFlagFormat() != null ? dto.getFlagFormat() : "FLAG{?}");
        c.setRequiresInstance(dto.getRequiresInstance() != null ? dto.getRequiresInstance() : false);
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
        Integer maLib = dto.getMaxAttempts();
        c.setMaxAttempts(maLib != null && maLib > 0 ? maLib : null);
        c.setIsActive(true);
        c.setIsHidden(false); // hidden concept doesn't apply to library challenges
        c.setHints(buildHints(dto.getHints()));
        c.setDeleted(false);

        challengeRepo.save(c);
        log.info("[LIBRARY] Created library challenge {} by user {}", c.getId(), userId);
        return toLibraryDto(c);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    public CTFLibraryChallengeDTO updateLibraryChallenge(UUID challengeId,
                                                          CTFChallengeCreateRequest dto,
                                                          UUID userId) {
        CTFChallenge c = requireOwned(challengeId, userId);

        if (dto.getTitle() != null)            c.setTitle(dto.getTitle());
        if (dto.getDescription() != null)      c.setDescription(dto.getDescription());
        if (dto.getCategory() != null)         c.setCategory(CTFChallenge.CTFCategory.valueOf(dto.getCategory().toUpperCase()));
        if (dto.getDifficulty() != null)       c.setDifficulty(CTFChallenge.CTFDifficulty.valueOf(dto.getDifficulty().toUpperCase()));
        if (dto.getBasePoints() != null)       c.setBasePoints(dto.getBasePoints());
        if (dto.getFlagFormat() != null)       c.setFlagFormat(dto.getFlagFormat());
        if (dto.getRequiresInstance() != null) c.setRequiresInstance(dto.getRequiresInstance());
        if (dto.getDockerImage() != null)      c.setDockerImage(dto.getDockerImage());
        if (dto.getDockerExposedPort() != null) c.setDockerExposedPort(dto.getDockerExposedPort());
        if (dto.getDockerFlagEnv() != null)    c.setDockerFlagEnv(dto.getDockerFlagEnv());
        if (dto.getConnectionType() != null)   c.setConnectionType(dto.getConnectionType().toUpperCase());
        if (dto.getDockerEnvVars() != null)    c.setDockerEnvVars(stripFlagKey(dto.getDockerEnvVars(), dto.getDockerFlagEnv()));
        if (dto.getDockerMemoryMb() != null)   c.setDockerMemoryMb(dto.getDockerMemoryMb());
        if (dto.getDockerCpuPercent() != null) c.setDockerCpuPercent(dto.getDockerCpuPercent());
        if (dto.getDockerPidsLimit() != null)  c.setDockerPidsLimit(dto.getDockerPidsLimit());
        if (dto.getDownloadableFileUrl() != null) c.setDownloadableFileUrl(dto.getDownloadableFileUrl());
        if (dto.getHints() != null)            c.setHints(buildHints(dto.getHints()));

        challengeRepo.save(c);
        return toLibraryDto(c);
    }

    // ── Add to competition ────────────────────────────────────────────────────

    public CTFChallengeDTO addToCompetition(UUID libraryId, UUID competitionId,
                                             UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionTeacher.loadOwned(competitionId, userId, isAdmin);

        CTFChallenge src = challengeRepo.findByIdAndDeletedFalse(libraryId)
                .orElseThrow(() -> new EntityNotFoundException("Library challenge not found."));
        if (!Boolean.TRUE.equals(src.getIsLibrary())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a library challenge.");
        }
        if (!userId.equals(src.getLibraryOwnerId())) {
            throw new AccessDeniedException("You do not own this library challenge.");
        }

        // Copy into competition — same docker image, no rebuild needed.
        CTFChallenge copy = new CTFChallenge();
        copy.setCompetitionId(competitionId);
        copy.setLibrarySourceId(libraryId);
        copy.setTitle(src.getTitle());
        copy.setDescription(src.getDescription());
        copy.setCategory(src.getCategory());
        copy.setDifficulty(src.getDifficulty());
        copy.setBasePoints(src.getBasePoints());
        copy.setFlagType(src.getFlagType());
        copy.setFlagHash(src.getFlagHash());
        copy.setFlagValue(src.getFlagValue()); // preserves plaintext for STATIC container injection
        copy.setFlagFormat(src.getFlagFormat());
        copy.setRequiresInstance(src.getRequiresInstance());
        copy.setDockerImage(src.getDockerImage());
        copy.setDockerExposedPort(src.getDockerExposedPort());
        copy.setDockerFlagEnv(src.getDockerFlagEnv() != null ? src.getDockerFlagEnv() : "FLAG");
        copy.setConnectionType(src.getConnectionType() != null ? src.getConnectionType() : "HTTP");
        copy.setDockerEnvVars(src.getDockerEnvVars());
        copy.setDockerMemoryMb(src.getDockerMemoryMb());
        copy.setDockerCpuPercent(src.getDockerCpuPercent());
        copy.setDockerPidsLimit(src.getDockerPidsLimit());
        copy.setDownloadableFileUrl(src.getDownloadableFileUrl());
        copy.setDownloadableFileName(src.getDownloadableFileName());
        copy.setMaxAttempts(src.getMaxAttempts()); // null = unlimited, preserves original
        copy.setIsActive(true);
        copy.setIsHidden(true); // hidden by default in competition — teacher reveals explicitly
        copy.setAuthorId(userId);
        copy.setIsLibrary(false);
        copy.setHints(src.getHints() != null
                ? src.getHints().stream()
                    .map(h -> new CTFHint(UUID.randomUUID().toString(), h.cost(), h.text()))
                    .collect(Collectors.toList())
                : new ArrayList<>());
        copy.setDeleted(false);
        challengeRepo.save(copy);

        // Pre-generate per-team flags for all teams already in the competition.
        generateTeamFlagsForChallenge(competitionId, copy.getId());

        log.info("[LIBRARY] Added challenge {} (source={}) to competition {} by user {}",
                copy.getId(), libraryId, competitionId, userId);
        return toCompetitionDto(copy);
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    public void removeFromLibrary(UUID challengeId, UUID userId) {
        CTFChallenge c = requireOwned(challengeId, userId);

        int useCount = challengeRepo.countByLibrarySourceIdAndDeletedFalse(challengeId);
        if (useCount > 0) {
            // Soft-delete — competition copies still exist, keep row for integrity.
            c.setDeleted(true);
            c.setDeletedAt(LocalDateTime.now());
            challengeRepo.save(c);
            log.info("[LIBRARY] Soft-deleted library challenge {} (used in {} competitions)", challengeId, useCount);
        } else {
            challengeRepo.delete(c);
            log.info("[LIBRARY] Hard-deleted library challenge {} (never used)", challengeId);
        }
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private CTFChallenge requireOwned(UUID challengeId, UUID userId) {
        CTFChallenge c = challengeRepo.findByIdAndDeletedFalse(challengeId)
                .orElseThrow(() -> new EntityNotFoundException("Library challenge not found."));
        if (!Boolean.TRUE.equals(c.getIsLibrary())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a library challenge.");
        }
        if (!userId.equals(c.getLibraryOwnerId())) {
            throw new AccessDeniedException("You do not own this library challenge.");
        }
        return c;
    }

    private void generateTeamFlagsForChallenge(UUID competitionId, UUID challengeId) {
        CTFChallenge challenge = challengeRepo.findByIdAndDeletedFalse(challengeId).orElse(null);
        if (challenge == null || challenge.getFlagType() != CTFChallenge.FlagType.DYNAMIC) return;
        for (CTFTeam team : teamRepo.findByCompetitionId(competitionId)) {
            String hash = teamService.computeTeamFlagHash(competitionId, challengeId, team.getId());
            flagRepo.save(CTFTeamFlag.builder()
                    .competitionId(competitionId)
                    .challengeId(challengeId)
                    .teamId(team.getId())
                    .flagHash(hash)
                    .build());
        }
    }

    private CTFLibraryChallengeDTO toLibraryDto(CTFChallenge c) {
        String buildStatus = null;
        String builtImageTag = null;
        var latest = buildRepo.findTopByChallengeIdOrderByCreatedAtDesc(c.getId());
        if (latest.isPresent()) {
            buildStatus   = latest.get().getBuildStatus();
            builtImageTag = latest.get().getBuiltImageTag();
        }

        int useCount = challengeRepo.countByLibrarySourceIdAndDeletedFalse(c.getId());

        return CTFLibraryChallengeDTO.builder()
                .id(c.getId())
                .title(c.getTitle())
                .description(c.getDescription())
                .category(c.getCategory() != null ? c.getCategory().name() : null)
                .difficulty(c.getDifficulty() != null ? c.getDifficulty().name() : null)
                .basePoints(c.getBasePoints())
                .flagType(c.getFlagType() != null ? c.getFlagType().name() : "STATIC")
                .flagFormat(c.getFlagFormat())
                .requiresInstance(Boolean.TRUE.equals(c.getRequiresInstance()))
                .dockerImage(c.getDockerImage())
                .dockerExposedPort(c.getDockerExposedPort())
                .connectionType(c.getConnectionType())
                .dockerFlagEnv(c.getDockerFlagEnv())
                .dockerEnvVars(c.getDockerEnvVars())
                .dockerMemoryMb(c.getDockerMemoryMb())
                .dockerCpuPercent(c.getDockerCpuPercent())
                .dockerPidsLimit(c.getDockerPidsLimit())
                .downloadableFileUrl(c.getDownloadableFileUrl())
                .hints(c.getHints() == null ? List.of() :
                        c.getHints().stream()
                                .map(h -> new CTFHintDTO(h.id(), h.cost(), h.text()))
                                .collect(Collectors.toList()))
                .maxAttempts(c.getMaxAttempts()) // null = unlimited
                .buildStatus(buildStatus)
                .builtImageTag(builtImageTag)
                .useCount(useCount)
                .createdAt(c.getCreatedAt())
                .build();
    }

    private CTFChallengeDTO toCompetitionDto(CTFChallenge c) {
        return CTFChallengeDTO.builder()
                .id(c.getId())
                .title(c.getTitle())
                .description(c.getDescription())
                .category(c.getCategory() != null ? c.getCategory().name() : null)
                .difficulty(c.getDifficulty() != null ? c.getDifficulty().name() : null)
                .basePoints(c.getBasePoints())
                .flagFormat(c.getFlagFormat())
                .flagType(c.getFlagType() != null ? c.getFlagType().name() : "STATIC")
                .requiresInstance(Boolean.TRUE.equals(c.getRequiresInstance()))
                .dockerImage(c.getDockerImage())
                .dockerExposedPort(c.getDockerExposedPort())
                .connectionType(c.getConnectionType())
                .dockerFlagEnv(c.getDockerFlagEnv())
                .dockerEnvVars(c.getDockerEnvVars())
                .dockerMemoryMb(c.getDockerMemoryMb())
                .dockerCpuPercent(c.getDockerCpuPercent())
                .dockerPidsLimit(c.getDockerPidsLimit())
                .downloadableFileUrl(c.getDownloadableFileUrl())
                .downloadableFileName(c.getDownloadableFileName())
                .hints(c.getHints() == null ? List.of() :
                        c.getHints().stream()
                                .map(h -> new CTFHintDTO(h.id(), h.cost(), h.text()))
                                .collect(Collectors.toList()))
                .maxAttempts(c.getMaxAttempts())
                .isActive(Boolean.TRUE.equals(c.getIsActive()))
                .isHidden(Boolean.TRUE.equals(c.getIsHidden()))
                .solveCount(0)
                .solvedByMe(false)
                .build();
    }

    private List<CTFHint> buildHints(List<CTFHintRequest> requests) {
        if (requests == null) return new ArrayList<>();
        return requests.stream()
                .map(r -> new CTFHint(UUID.randomUUID().toString(),
                        r.getCost() != null ? r.getCost() : 0,
                        r.getText()))
                .collect(Collectors.toList());
    }

    private void validateFlag(String plainFlag) {
        if (plainFlag == null || plainFlag.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Flag is required.");
        }
        if (!FLAG_PATTERN.matcher(plainFlag.trim()).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Flag must be at least 3 characters and contain no whitespace.");
        }
    }

    private static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
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
