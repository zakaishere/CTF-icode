package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.CTFCompetitionCreateRequest;
import com.university.platform.ctf.dto.CTFCompetitionDTO;
import com.university.platform.ctf.dto.CTFCompetitionUpdateRequest;
import com.university.platform.ctf.entity.CTFCompetition;
import com.university.platform.ctf.entity.CTFNotification;
import com.university.platform.ctf.repository.CTFCompetitionRepository;
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

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CTFCompetitionTeacherService {

    private static final Logger log = LoggerFactory.getLogger(CTFCompetitionTeacherService.class);

    private final CTFCompetitionRepository competitionRepo;
    private final SimpMessagingTemplate    ws;
    private final CTFNotificationService   notifications;

    // ── Create ───────────────────────────────────────────────────────────────

    @Transactional
    public CTFCompetitionDTO createCompetition(CTFCompetitionCreateRequest dto, UUID creatorId) {
        CTFCompetition.TimingMode timingMode = parseTimingMode(dto.getTimingMode());
        validateTimesForMode(timingMode, dto.getStartTime(), dto.getEndTime(), dto.getDurationHours());

        if (dto.getMinTeamSize() != null && dto.getMaxTeamSize() != null
                && dto.getMinTeamSize() > dto.getMaxTeamSize()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "minTeamSize cannot exceed maxTeamSize.");
        }

        String accessCode = normalizeAccessCode(dto.getAccessCode());
        CTFCompetition.Visibility visibility = parseVisibility(dto.getVisibility());

        if (visibility != CTFCompetition.Visibility.PUBLIC && (accessCode == null || accessCode.isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "An access code is required for non-public competitions.");
        }
        if (accessCode != null && !accessCode.isEmpty()
                && competitionRepo.existsByAccessCodeIgnoreCase(accessCode)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "That access code is already in use. Pick another.");
        }

        CTFCompetition comp = CTFCompetition.builder()
                .title(dto.getTitle().trim())
                .description(dto.getDescription())
                .timingMode(timingMode)
                .startTime(dto.getStartTime())
                .endTime(timingMode == CTFCompetition.TimingMode.SCHEDULED ? dto.getEndTime() : null)
                .durationHours((timingMode == CTFCompetition.TimingMode.DURATION
                        || timingMode == CTFCompetition.TimingMode.REGISTRATION)
                        ? dto.getDurationHours() : null)
                .registrationOpen(dto.getRegistrationOpen() != null && dto.getRegistrationOpen())
                .maxTeamSize(orDefault(dto.getMaxTeamSize(), 4))
                .minTeamSize(orDefault(dto.getMinTeamSize(), 1))
                .scoringMode(parseScoring(dto.getScoringMode()))
                .dynamicMinPoints(orDefault(dto.getDynamicMinPoints(), 50))
                .dynamicDecayFactor(dto.getDynamicDecayFactor() != null ? dto.getDynamicDecayFactor() : 0.08)
                .visibility(visibility)
                .accessCode(accessCode)
                .bannerUrl(dto.getBannerUrl())
                .createdBy(creatorId)
                .isActive(true)
                .isPaused(false)
                .isFrozen(false)
                .build();

        comp = competitionRepo.save(comp);
        log.info("[CREATED] CTF competition {} (mode={}) by user {}", comp.getId(), timingMode, creatorId);
        return CTFCompetitionDTO.from(comp);
    }

    // ── Read ─────────────────────────────────────────────────────────────────

    public List<CTFCompetitionDTO> listMine(UUID creatorId) {
        return competitionRepo.findByCreatedByOrderByCreatedAtDesc(creatorId).stream()
                .map(CTFCompetitionDTO::from)
                .collect(Collectors.toList());
    }

    public CTFCompetitionDTO getOwned(UUID id, UUID userId, boolean isAdmin) {
        return CTFCompetitionDTO.from(loadOwned(id, userId, isAdmin));
    }

    // ── Update ───────────────────────────────────────────────────────────────

    @Transactional
    public CTFCompetitionDTO updateCompetition(UUID id, CTFCompetitionUpdateRequest dto,
                                               UUID userId, boolean isAdmin) {
        CTFCompetition comp = loadOwned(id, userId, isAdmin);
        CTFCompetition.Status status = comp.computeStatus();
        Map<String, Object> changes = new LinkedHashMap<>();

        // While the competition is ACTIVE (or running but paused/frozen), most
        // fields are locked. Only safe-to-extend properties are mutable.
        boolean isLive = status == CTFCompetition.Status.ACTIVE
                || status == CTFCompetition.Status.PAUSED
                || status == CTFCompetition.Status.FROZEN;

        if (isLive) {
            if (dto.getDescription() != null && !Objects.equals(dto.getDescription(), comp.getDescription())) {
                comp.setDescription(dto.getDescription());
                changes.put("description", dto.getDescription());
            }
            if (dto.getEndTime() != null) {
                // comp.getEndTime() is null for MANUAL/REGISTRATION — skip the "shorten" guard.
                if (comp.getEndTime() != null && dto.getEndTime().isBefore(comp.getEndTime())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Cannot shorten end time while the competition is running.");
                }
                if (!dto.getEndTime().equals(comp.getEndTime())) {
                    comp.setEndTime(dto.getEndTime());
                    changes.put("endTime", dto.getEndTime());
                }
            }
            if (dto.getMaxTeamSize() != null) {
                if (dto.getMaxTeamSize() < comp.getMaxTeamSize()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Cannot reduce maxTeamSize while the competition is running.");
                }
                if (!dto.getMaxTeamSize().equals(comp.getMaxTeamSize())) {
                    comp.setMaxTeamSize(dto.getMaxTeamSize());
                    changes.put("maxTeamSize", dto.getMaxTeamSize());
                }
            }
            // Any other field present in the request is silently ignored while
            // live — the UI should disable them, but we double-check here too.
        } else {
            // Pre-start (UPCOMING) or post-end (ENDED): full edit.
            if (dto.getTitle() != null)              { comp.setTitle(dto.getTitle().trim()); changes.put("title", comp.getTitle()); }
            if (dto.getDescription() != null)        { comp.setDescription(dto.getDescription()); changes.put("description", comp.getDescription()); }
            if (dto.getStartTime() != null)          { comp.setStartTime(dto.getStartTime()); changes.put("startTime", comp.getStartTime()); }
            if (dto.getEndTime() != null)            { comp.setEndTime(dto.getEndTime()); changes.put("endTime", comp.getEndTime()); }
            if (dto.getMaxTeamSize() != null)        { comp.setMaxTeamSize(dto.getMaxTeamSize()); changes.put("maxTeamSize", comp.getMaxTeamSize()); }
            if (dto.getMinTeamSize() != null)        { comp.setMinTeamSize(dto.getMinTeamSize()); changes.put("minTeamSize", comp.getMinTeamSize()); }
            if (dto.getScoringMode() != null)        { comp.setScoringMode(parseScoring(dto.getScoringMode())); changes.put("scoringMode", comp.getScoringMode()); }
            if (dto.getDynamicMinPoints() != null)   { comp.setDynamicMinPoints(dto.getDynamicMinPoints()); changes.put("dynamicMinPoints", comp.getDynamicMinPoints()); }
            if (dto.getDynamicDecayFactor() != null) { comp.setDynamicDecayFactor(dto.getDynamicDecayFactor()); changes.put("dynamicDecayFactor", comp.getDynamicDecayFactor()); }
            if (dto.getVisibility() != null)         { comp.setVisibility(parseVisibility(dto.getVisibility())); changes.put("visibility", comp.getVisibility()); }
            if (dto.getBannerUrl() != null)          { comp.setBannerUrl(dto.getBannerUrl()); changes.put("bannerUrl", comp.getBannerUrl()); }
            if (dto.getIsActive() != null)           { comp.setIsActive(dto.getIsActive()); changes.put("isActive", comp.getIsActive()); }
            if (dto.getTimingMode() != null)         { comp.setTimingMode(parseTimingMode(dto.getTimingMode())); changes.put("timingMode", comp.getTimingMode()); }
            if (dto.getDurationHours() != null)      { comp.setDurationHours(dto.getDurationHours()); changes.put("durationHours", comp.getDurationHours()); }
            if (dto.getRegistrationOpen() != null)   { comp.setRegistrationOpen(dto.getRegistrationOpen()); changes.put("registrationOpen", comp.getRegistrationOpen()); }

            if (dto.getAccessCode() != null) {
                String code = normalizeAccessCode(dto.getAccessCode());
                if (code != null && !code.isEmpty()
                        && competitionRepo.existsByAccessCodeIgnoreCaseAndIdNot(code, id)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "That access code is already in use. Pick another.");
                }
                comp.setAccessCode(code);
                changes.put("accessCode", code);
            }
        }

        validateTimesForMode(comp.getTimingMode(), comp.getStartTime(), comp.getEndTime(), comp.getDurationHours());
        if (comp.getMinTeamSize() > comp.getMaxTeamSize()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "minTeamSize cannot exceed maxTeamSize.");
        }
        if (comp.getVisibility() != CTFCompetition.Visibility.PUBLIC
                && (comp.getAccessCode() == null || comp.getAccessCode().isEmpty())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "An access code is required for non-public competitions.");
        }

        if (!changes.isEmpty()) {
            broadcast(id, Map.of("type", "COMPETITION_UPDATED", "changes", changes));
        }

        log.info("[UPDATED] CTF competition {} by user {} — changes: {}", id, userId, changes.keySet());
        return CTFCompetitionDTO.from(comp);
    }

    // ── Lifecycle controls ───────────────────────────────────────────────────

    @Transactional
    public CTFCompetitionDTO pauseCompetition(UUID id, UUID userId, boolean isAdmin) {
        CTFCompetition comp = loadOwned(id, userId, isAdmin);
        CTFCompetition.Status st = comp.computeStatus();
        if (st == CTFCompetition.Status.ENDED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot pause an ended competition.");
        }
        if (Boolean.TRUE.equals(comp.getIsPaused())) {
            return CTFCompetitionDTO.from(comp);
        }
        comp.setIsPaused(true);
        comp.setPausedAt(LocalDateTime.now());
        broadcast(id, Map.of("type", "PAUSED", "pausedAt", comp.getPausedAt()));
        notifications.sendToCompetition(id, CTFNotification.Type.COMPETITION_PAUSED,
                "Competition Paused",
                "The organizer has temporarily paused the competition. Submissions are disabled.",
                null, userId);
        log.info("[PAUSED] CTF competition {} by user {}", id, userId);
        return CTFCompetitionDTO.from(comp);
    }

    @Transactional
    public CTFCompetitionDTO resumeCompetition(UUID id, UUID userId, boolean isAdmin) {
        CTFCompetition comp = loadOwned(id, userId, isAdmin);
        if (!Boolean.TRUE.equals(comp.getIsPaused())) {
            return CTFCompetitionDTO.from(comp);
        }
        comp.setIsPaused(false);
        comp.setPausedAt(null);
        broadcast(id, Map.of("type", "RESUMED"));
        notifications.sendToCompetition(id, CTFNotification.Type.COMPETITION_RESUMED,
                "Competition Resumed",
                "The competition has resumed. Submissions are now open.",
                null, userId);
        log.info("[RESUMED] CTF competition {} by user {}", id, userId);
        return CTFCompetitionDTO.from(comp);
    }

    @Transactional
    public CTFCompetitionDTO freezeScoreboard(UUID id, UUID userId, boolean isAdmin) {
        CTFCompetition comp = loadOwned(id, userId, isAdmin);
        if (Boolean.TRUE.equals(comp.getIsFrozen())) {
            return CTFCompetitionDTO.from(comp);
        }
        comp.setIsFrozen(true);
        comp.setFrozenAt(LocalDateTime.now());
        broadcast(id, Map.of("type", "FROZEN", "frozenAt", comp.getFrozenAt()));
        notifications.sendToCompetition(id, CTFNotification.Type.SCOREBOARD_FROZEN,
                "Scoreboard Frozen",
                "The scoreboard has been frozen. Keep solving!",
                Map.of("frozenAt", comp.getFrozenAt().toString()), userId);
        log.info("[FROZEN] scoreboard for CTF competition {} by user {}", id, userId);
        return CTFCompetitionDTO.from(comp);
    }

    @Transactional
    public CTFCompetitionDTO unfreezeScoreboard(UUID id, UUID userId, boolean isAdmin) {
        CTFCompetition comp = loadOwned(id, userId, isAdmin);
        if (!Boolean.TRUE.equals(comp.getIsFrozen())) {
            return CTFCompetitionDTO.from(comp);
        }
        comp.setIsFrozen(false);
        // Intentionally keep frozenAt for the audit trail / "show me what changed after freeze".
        broadcast(id, Map.of("type", "UNFROZEN"));
        notifications.sendToCompetition(id, CTFNotification.Type.SCOREBOARD_UNFROZEN,
                "Scoreboard Unfrozen",
                "Live rankings are visible again.",
                null, userId);
        log.info("[UNFROZEN] scoreboard for CTF competition {} by user {}", id, userId);
        return CTFCompetitionDTO.from(comp);
    }

    @Transactional
    public CTFCompetitionDTO startManualCompetition(UUID id, UUID userId, boolean isAdmin) {
        CTFCompetition comp = loadOwned(id, userId, isAdmin);
        if (comp.getTimingMode() != CTFCompetition.TimingMode.MANUAL
                && comp.getTimingMode() != CTFCompetition.TimingMode.REGISTRATION) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only MANUAL or REGISTRATION mode competitions can be started this way.");
        }
        if (Boolean.TRUE.equals(comp.getIsManuallyStarted())) {
            return CTFCompetitionDTO.from(comp);
        }
        comp.setIsManuallyStarted(true);
        if (comp.getStartTime() == null) {
            comp.setStartTime(LocalDateTime.now());
        }
        broadcast(id, Map.of("type", "COMPETITION_STARTED", "startedAt", comp.getStartTime()));
        notifications.sendToCompetition(id, CTFNotification.Type.COMPETITION_STARTED,
                "Competition Started!",
                "The competition is now live. Start solving challenges!",
                Map.of("startedAt", comp.getStartTime().toString()), userId);
        log.info("[STARTED] MANUAL CTF competition {} by user {}", id, userId);
        return CTFCompetitionDTO.from(comp);
    }

    @Transactional
    public CTFCompetitionDTO endCompetition(UUID id, UUID userId, boolean isAdmin) {
        CTFCompetition comp = loadOwned(id, userId, isAdmin);
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime effEnd = comp.getEffectiveEndTime();
        if ((effEnd != null && now.isAfter(effEnd)) || Boolean.TRUE.equals(comp.getManuallyEnded())) {
            // Already over — nothing to do.
            return CTFCompetitionDTO.from(comp);
        }
        comp.setManuallyEnded(true);
        comp.setEndTime(now);
        // Releasing pause/freeze on end keeps the post-mortem scoreboard live + readable.
        comp.setIsPaused(false);
        broadcast(id, Map.of("type", "ENDED", "endedAt", now));
        notifications.sendToCompetition(id, CTFNotification.Type.COMPETITION_ENDED,
                "Competition Ended",
                "The competition has ended. Check the final scoreboard.",
                Map.of("endedAt", now.toString()), userId);
        log.info("[ENDED] CTF competition {} (early) by user {}", id, userId);
        return CTFCompetitionDTO.from(comp);
    }

    // ── WebSocket broadcast helper ───────────────────────────────────────────

    private void broadcast(UUID competitionId, Map<String, Object> payload) {
        try {
            // Single channel so clients only need one subscription.
            ws.convertAndSend("/topic/ctf/" + competitionId + "/control", payload);
        } catch (Exception e) {
            log.warn("Failed to broadcast control event for competition {}: {}", competitionId, e.getMessage());
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    public CTFCompetition loadOwned(UUID id, UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Competition not found."));
        if (!isAdmin && (comp.getCreatedBy() == null || !comp.getCreatedBy().equals(userId))) {
            throw new AccessDeniedException("You do not own this competition.");
        }
        return comp;
    }

    private void validateTimesForMode(CTFCompetition.TimingMode mode, LocalDateTime start,
                                       LocalDateTime end, Integer durationHours) {
        switch (mode) {
            case SCHEDULED -> {
                if (start == null || end == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "startTime and endTime are required for SCHEDULED mode.");
                }
                if (!end.isAfter(start)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "endTime must be after startTime.");
                }
            }
            case DURATION -> {
                if (start == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "startTime is required for DURATION mode.");
                }
                if (durationHours == null || durationHours < 1) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "durationHours (in minutes) must be at least 1 for DURATION mode.");
                }
            }
            case MANUAL -> {
                // No time constraints — host starts and ends manually.
            }
            case REGISTRATION -> {
                // No required times — host starts manually; duration is optional.
                if (durationHours != null && durationHours < 1) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "durationHours (in minutes) must be at least 1 when set for REGISTRATION mode.");
                }
            }
        }
    }

    private CTFCompetition.TimingMode parseTimingMode(String s) {
        try {
            return s == null ? CTFCompetition.TimingMode.SCHEDULED
                    : CTFCompetition.TimingMode.valueOf(s.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid timingMode.");
        }
    }

    private CTFCompetition.ScoringMode parseScoring(String s) {
        try {
            return s == null ? CTFCompetition.ScoringMode.DYNAMIC
                    : CTFCompetition.ScoringMode.valueOf(s.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid scoringMode.");
        }
    }

    private CTFCompetition.Visibility parseVisibility(String s) {
        try {
            return s == null ? CTFCompetition.Visibility.PUBLIC
                    : CTFCompetition.Visibility.valueOf(s.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid visibility.");
        }
    }

    private String normalizeAccessCode(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static <T> T orDefault(T v, T fallback) {
        return v != null ? v : fallback;
    }
}
