package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.*;
import com.university.platform.ctf.entity.*;
import com.university.platform.ctf.entity.CTFNotification;
import com.university.platform.ctf.repository.*;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Teacher-side challenge management scoped to a single competition. Per-competition
 * challenges live in {@code ctf_challenges} with {@code competition_id} set, and
 * each team gets its own per-challenge flag hashed in {@code ctf_team_flags} so
 * cross-team copy-paste can be detected.
 */
@Service
@RequiredArgsConstructor
public class CTFCompetitionChallengeTeacherService {

    private static final Logger log = LoggerFactory.getLogger(CTFCompetitionChallengeTeacherService.class);

    private static final Pattern FLAG_PATTERN =
            Pattern.compile("^\\S{3,}$");

    private final CTFCompetitionTeacherService competitionTeacher;
    private final CTFChallengeRepository       challengeRepo;
    private final CTFCompetitionRepository     competitionRepo;
    private final CTFTeamRepository            teamRepo;
    private final CTFTeamFlagRepository        flagRepo;
    private final CTFHintUnlockRepository      hintUnlockRepo;
    private final CTFTeamService               teamService;
    private final SimpMessagingTemplate        ws;
    private final CTFNotificationService       notifications;

    // ── List challenges (teacher view — all, including hidden) ───────────────

    @Transactional(readOnly = true)
    public List<CTFChallengeDTO> listChallenges(UUID competitionId, UUID userId, boolean isAdmin) {
        competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        return challengeRepo.findByCompetitionIdAndDeletedFalse(competitionId)
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    // ── Add challenge ────────────────────────────────────────────────────────

    /**
     * Creates a hidden challenge under the competition and pre-generates team
     * flags for every existing team — so the moment the teacher reveals it,
     * teams can submit immediately.
     */
    @Transactional
    public CTFChallengeDTO addChallenge(UUID competitionId, CTFChallengeCreateRequest dto,
                                        UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionTeacher.loadOwned(competitionId, userId, isAdmin);

        CTFChallenge.FlagType flagType = "DYNAMIC".equalsIgnoreCase(dto.getFlagType())
                ? CTFChallenge.FlagType.DYNAMIC
                : CTFChallenge.FlagType.STATIC;

        if (flagType == CTFChallenge.FlagType.STATIC) {
            validateFlag(dto.getPlainFlag());
        }

        CTFChallenge c = new CTFChallenge();
        c.setCompetitionId(competitionId);
        c.setTitle(dto.getTitle());
        c.setDescription(dto.getDescription());
        c.setCategory(CTFChallenge.CTFCategory.valueOf(dto.getCategory().toUpperCase()));
        c.setDifficulty(CTFChallenge.CTFDifficulty.valueOf(dto.getDifficulty().toUpperCase()));
        c.setBasePoints(dto.getBasePoints());
        c.setFlagType(flagType);
        if (flagType == CTFChallenge.FlagType.STATIC) {
            c.setFlagHash(sha256(dto.getPlainFlag().trim()));
            c.setFlagValue(dto.getPlainFlag().trim()); // plaintext injected into containers
        } else {
            c.setFlagHash("dynamic"); // never checked — submission uses ctf_team_flags
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
        c.setMediaUrl(dto.getMediaUrl());
        // null or 0 = unlimited (stored as null); positive = hard limit per team
        Integer ma = dto.getMaxAttempts();
        c.setMaxAttempts(ma != null && ma > 0 ? ma : null);
        c.setIsActive(true);
        c.setIsHidden(true); // hidden by default — teacher reveals explicitly
        c.setHints(buildHints(dto.getHints()));
        c.setAuthorId(userId);
        c.setAuthorName(dto.getAuthorName());
        c.setSshUsername(dto.getSshUsername());
        c.setSshPassword(dto.getSshPassword());
        c.setDeleted(false);
        c.setBloodBonusEnabled(Boolean.TRUE.equals(dto.getBloodBonusEnabled()));
        c.setFirstBloodBonus(dto.getFirstBloodBonus()  != null ? dto.getFirstBloodBonus()  : 0);
        c.setSecondBloodBonus(dto.getSecondBloodBonus() != null ? dto.getSecondBloodBonus() : 0);
        c.setThirdBloodBonus(dto.getThirdBloodBonus()  != null ? dto.getThirdBloodBonus()  : 0);

        challengeRepo.save(c);

        // Pre-generate per-team flags so submissions don't need a lazy first-write.
        generateTeamFlagsForChallenge(competitionId, c.getId());

        log.info("[ADDED] CTF challenge {} to competition {} by user {}", c.getId(), competitionId, userId);
        return toDto(c);
    }

    // ── Update challenge (non-flag fields) ───────────────────────────────────

    @Transactional
    public CTFChallengeDTO updateChallenge(UUID competitionId, UUID challengeId,
                                           CTFChallengeUpdateRequest dto,
                                           UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        CTFChallenge c = loadChallenge(competitionId, challengeId);

        // Flag is intentionally not mutable here — teachers must use the
        // /flag endpoint, which also regenerates team flags.
        if (dto.getPlainFlag() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Use PATCH /challenges/{id}/flag to rotate the flag.");
        }

        if (dto.getTitle() != null)               c.setTitle(dto.getTitle());
        if (dto.getDescription() != null)          c.setDescription(dto.getDescription());
        if (dto.getCategory() != null)             c.setCategory(CTFChallenge.CTFCategory.valueOf(dto.getCategory().toUpperCase()));
        if (dto.getDifficulty() != null)           c.setDifficulty(CTFChallenge.CTFDifficulty.valueOf(dto.getDifficulty().toUpperCase()));
        if (dto.getBasePoints() != null)           c.setBasePoints(dto.getBasePoints());
        if (dto.getFlagType() != null)             c.setFlagType("DYNAMIC".equalsIgnoreCase(dto.getFlagType())
                                                       ? CTFChallenge.FlagType.DYNAMIC
                                                       : CTFChallenge.FlagType.STATIC);

        // Track whether the dynamic flag template changed — if so, every team's
        // pre-generated flag is now stale and must be regenerated.
        boolean formatChanged = dto.getFlagFormat() != null
                && !dto.getFlagFormat().equals(c.getFlagFormat());
        if (dto.getFlagFormat() != null)           c.setFlagFormat(dto.getFlagFormat());
        if (dto.getRequiresInstance() != null)     c.setRequiresInstance(dto.getRequiresInstance());
        if (dto.getDockerImage() != null)          c.setDockerImage(dto.getDockerImage());
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
        if (dto.getMediaUrl() != null)             c.setMediaUrl(dto.getMediaUrl());
        if (dto.getMaxAttempts() != null) {
            c.setMaxAttempts(dto.getMaxAttempts() <= 0 ? null : dto.getMaxAttempts());
        }
        if (dto.getIsActive() != null)             c.setIsActive(dto.getIsActive());
        if (dto.getHints() != null)                c.setHints(buildHints(dto.getHints()));
        if (dto.getBloodBonusEnabled() != null)    c.setBloodBonusEnabled(dto.getBloodBonusEnabled());
        if (dto.getFirstBloodBonus()  != null)     c.setFirstBloodBonus(dto.getFirstBloodBonus());
        if (dto.getSecondBloodBonus() != null)     c.setSecondBloodBonus(dto.getSecondBloodBonus());
        if (dto.getThirdBloodBonus()  != null)     c.setThirdBloodBonus(dto.getThirdBloodBonus());
        if (dto.getAuthorName()       != null)     c.setAuthorName(dto.getAuthorName());
        if (dto.getSshUsername()      != null)     c.setSshUsername(dto.getSshUsername());
        if (dto.getSshPassword()      != null)     c.setSshPassword(dto.getSshPassword());

        challengeRepo.save(c);

        // If the dynamic flag template changed, wipe + regenerate every team's flag
        // so stored hashes match the new format. Players must restart instances to
        // receive a freshly-injected flag.
        if (formatChanged && c.getFlagType() == CTFChallenge.FlagType.DYNAMIC) {
            flagRepo.findByCompetitionIdAndChallengeId(competitionId, challengeId)
                    .forEach(flagRepo::delete);
            generateTeamFlagsForChallenge(competitionId, challengeId);
            log.info("[FLAG_FORMAT_CHANGED] regenerated team flags for challenge={} competition={}",
                    challengeId, competitionId);
        }

        // Broadcast to students only when the challenge is currently visible
        // and the competition is live — otherwise hidden changes stay quiet.
        CTFCompetition.Status st = comp.computeStatus();
        if (!Boolean.TRUE.equals(c.getIsHidden())
                && (st == CTFCompetition.Status.ACTIVE
                 || st == CTFCompetition.Status.PAUSED
                 || st == CTFCompetition.Status.FROZEN)) {
            broadcastChallengeEvent(competitionId, Map.of(
                    "type", "CHALLENGE_UPDATED",
                    "challenge", Map.of(
                            "id", c.getId(),
                            "title", c.getTitle(),
                            "category", c.getCategory().name()
                    )
            ));
            notifications.sendToCompetition(competitionId, CTFNotification.Type.CHALLENGE_UPDATED,
                    "Challenge Updated",
                    c.getTitle() + " has been updated by the organizer.",
                    Map.of("challengeId", c.getId().toString(),
                           "challengeTitle", c.getTitle(),
                           "category", c.getCategory().name()),
                    userId);
        }

        return toDto(c);
    }

    // ── Rotate flag ──────────────────────────────────────────────────────────

    /**
     * Rotates the plain flag → new SHA hash → regenerates every team's
     * per-team flag for this challenge so prior leaked flags become useless.
     */
    @Transactional
    public CTFChallengeDTO updateChallengeFlag(UUID competitionId, UUID challengeId,
                                                String newPlainFlag,
                                                UUID userId, boolean isAdmin) {
        competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        validateFlag(newPlainFlag);

        CTFChallenge c = loadChallenge(competitionId, challengeId);
        String oldHash = c.getFlagHash();
        c.setFlagHash(sha256(newPlainFlag.trim()));
        c.setFlagValue(newPlainFlag.trim()); // keep plaintext in sync for container injection
        challengeRepo.save(c);

        // Wipe + regenerate per-team flags. We don't bother with a partial
        // refresh — if the master flag rotated, every derived flag is stale.
        flagRepo.findByCompetitionIdAndChallengeId(competitionId, challengeId)
                .forEach(flagRepo::delete);
        generateTeamFlagsForChallenge(competitionId, challengeId);

        // Audit trail in logs only — the audit table is intentionally not
        // back-filled with prior changes; this log is the durable record.
        log.warn("[FLAG_ROTATED] challenge={} competition={} by={} oldHash={} newHash={}",
                challengeId, competitionId, userId, oldHash, c.getFlagHash());

        return toDto(c);
    }

    // ── Reveal / hide ────────────────────────────────────────────────────────

    @Transactional
    public CTFChallengeDTO revealChallenge(UUID competitionId, UUID challengeId,
                                            UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        CTFChallenge c = loadChallenge(competitionId, challengeId);
        if (!Boolean.TRUE.equals(c.getIsHidden())) return toDto(c);
        c.setIsHidden(false);
        challengeRepo.save(c);

        CTFCompetition.Status st = comp.computeStatus();
        if (st == CTFCompetition.Status.ACTIVE
                || st == CTFCompetition.Status.PAUSED
                || st == CTFCompetition.Status.FROZEN) {
            broadcastChallengeEvent(competitionId, Map.of(
                    "type", "NEW_CHALLENGE",
                    "challenge", toDto(c)
            ));
            notifications.sendToCompetition(competitionId, CTFNotification.Type.NEW_CHALLENGE,
                    "New Challenge Available",
                    c.getTitle() + " has been added to " + c.getCategory().name(),
                    Map.of("challengeId", c.getId().toString(),
                           "challengeTitle", c.getTitle(),
                           "category", c.getCategory().name(),
                           "points", c.getBasePoints(),
                           "difficulty", c.getDifficulty().name()),
                    userId);
        }
        return toDto(c);
    }

    @Transactional
    public CTFChallengeDTO hideChallenge(UUID competitionId, UUID challengeId,
                                          UUID userId, boolean isAdmin) {
        competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        CTFChallenge c = loadChallenge(competitionId, challengeId);
        if (Boolean.TRUE.equals(c.getIsHidden())) return toDto(c);
        c.setIsHidden(true);
        challengeRepo.save(c);
        broadcastChallengeEvent(competitionId, Map.of(
                "type", "CHALLENGE_HIDDEN",
                "challengeId", c.getId()
        ));
        return toDto(c);
    }

    // ── Hints ────────────────────────────────────────────────────────────────

    @Transactional
    public CTFChallengeDTO addHint(UUID competitionId, UUID challengeId,
                                    CTFHintRequest req, UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        CTFChallenge c = loadChallenge(competitionId, challengeId);

        if (req.getText() == null || req.getText().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hint text is required.");
        }
        int cost = req.getCost() != null && req.getCost() >= 0 ? req.getCost() : 0;

        List<CTFHint> hints = c.getHints() != null ? new ArrayList<>(c.getHints()) : new ArrayList<>();
        CTFHint hint = new CTFHint(UUID.randomUUID().toString(), cost, req.getText().trim());
        hints.add(hint);
        c.setHints(hints);
        challengeRepo.save(c);

        // Only broadcast cost/id — never the hint text. Students must spend
        // points to unlock the actual content.
        CTFCompetition.Status st = comp.computeStatus();
        if (!Boolean.TRUE.equals(c.getIsHidden())
                && (st == CTFCompetition.Status.ACTIVE
                 || st == CTFCompetition.Status.PAUSED
                 || st == CTFCompetition.Status.FROZEN)) {
            broadcastChallengeEvent(competitionId, Map.of(
                    "type", "HINT_ADDED",
                    "challengeId", c.getId(),
                    "challengeTitle", c.getTitle(),
                    "hint", Map.of("id", hint.id(), "cost", hint.cost())
            ));
            notifications.sendToCompetition(competitionId, CTFNotification.Type.HINT_ADDED,
                    "Hint Added",
                    "A new hint is available for: " + c.getTitle(),
                    Map.of("challengeId", c.getId().toString(),
                           "challengeTitle", c.getTitle(),
                           "hintId", hint.id(),
                           "hintCost", hint.cost()),
                    userId);
        }
        return toDto(c);
    }

    @Transactional
    public CTFChallengeDTO deleteHint(UUID competitionId, UUID challengeId, String hintId,
                                       UUID userId, boolean isAdmin) {
        competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        CTFChallenge c = loadChallenge(competitionId, challengeId);

        // Refuse to delete a hint that's already been paid for — students
        // would lose value and the points spent are unrecoverable.
        if (hintUnlockRepo.existsByChallengeIdAndHintId(challengeId, hintId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot delete a hint that one or more teams have already unlocked.");
        }

        List<CTFHint> hints = c.getHints() != null ? new ArrayList<>(c.getHints()) : new ArrayList<>();
        boolean removed = hints.removeIf(h -> h.id().equals(hintId));
        if (!removed) {
            throw new EntityNotFoundException("Hint not found on this challenge.");
        }
        c.setHints(hints);
        challengeRepo.save(c);
        return toDto(c);
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private void generateTeamFlagsForChallenge(UUID competitionId, UUID challengeId) {
        CTFChallenge challenge = challengeRepo.findByIdAndDeletedFalse(challengeId).orElse(null);
        // STATIC challenges use one shared flag — no per-team rows needed or wanted.
        if (challenge == null || challenge.getFlagType() != CTFChallenge.FlagType.DYNAMIC) return;
        List<CTFTeam> teams = teamRepo.findByCompetitionId(competitionId);
        for (CTFTeam team : teams) {
            String hash = teamService.computeTeamFlagHash(competitionId, challengeId, team.getId());
            flagRepo.save(CTFTeamFlag.builder()
                    .competitionId(competitionId)
                    .challengeId(challengeId)
                    .teamId(team.getId())
                    .flagHash(hash)
                    .build());
        }
    }

    private CTFChallenge loadChallenge(UUID competitionId, UUID challengeId) {
        CTFChallenge c = challengeRepo.findByIdAndDeletedFalse(challengeId)
                .orElseThrow(() -> new EntityNotFoundException("Challenge not found."));
        if (!competitionId.equals(c.getCompetitionId())) {
            throw new EntityNotFoundException("Challenge not part of this competition.");
        }
        return c;
    }

    private void broadcastChallengeEvent(UUID competitionId, Map<String, Object> payload) {
        try {
            ws.convertAndSend("/topic/ctf/" + competitionId + "/challenges", payload);
        } catch (Exception e) {
            log.warn("Failed to broadcast challenge event for competition {}: {}", competitionId, e.getMessage());
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

    private void validateFlag(String plainFlag) {
        if (plainFlag == null || plainFlag.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Flag is required.");
        }
        if (!FLAG_PATTERN.matcher(plainFlag.trim()).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Flag must be at least 3 characters and contain no whitespace");
        }
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private CTFChallengeDTO toDto(CTFChallenge c) {
        return CTFChallengeDTO.builder()
                .id(c.getId())
                .title(c.getTitle())
                .authorName(c.getAuthorName())
                .sshUsername(c.getSshUsername())
                .sshPassword(c.getSshPassword())
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
                .mediaUrl(c.getMediaUrl())
                .hints(c.getHints() == null ? List.of() :
                        c.getHints().stream()
                                .map(h -> new CTFHintDTO(h.id(), h.cost(), h.text()))
                                .collect(Collectors.toList()))
                .maxAttempts(c.getMaxAttempts())
                .isActive(Boolean.TRUE.equals(c.getIsActive()))
                .isHidden(Boolean.TRUE.equals(c.getIsHidden()))
                .bloodBonusEnabled(Boolean.TRUE.equals(c.getBloodBonusEnabled()))
                .firstBloodBonus(c.getFirstBloodBonus())
                .secondBloodBonus(c.getSecondBloodBonus())
                .thirdBloodBonus(c.getThirdBloodBonus())
                .solveCount(0)
                .solvedByMe(false)
                .build();
    }

    private Map<String, String> stripFlagKey(Map<String, String> vars, String flagEnvName) {
        if (vars == null) return null;
        String flagKey = (flagEnvName != null ? flagEnvName : "FLAG").toUpperCase();
        Map<String, String> cleaned = new java.util.LinkedHashMap<>(vars);
        cleaned.keySet().removeIf(k -> k.equalsIgnoreCase(flagKey) || k.equalsIgnoreCase("FLAG"));
        return cleaned;
    }
}
