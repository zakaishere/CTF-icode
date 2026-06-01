package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.CTFNotificationDTO;
import com.university.platform.ctf.entity.CTFCompetition;
import com.university.platform.ctf.entity.CTFNotification;
import com.university.platform.ctf.entity.CTFNotification.Type;
import com.university.platform.ctf.repository.CTFCompetitionRepository;
import com.university.platform.ctf.repository.CTFNotificationRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Persists CTF notifications and broadcasts them over WebSocket. Both methods
 * are {@link Async @Async} so callers never block on the STOMP send — that
 * keeps lifecycle controls (pause/resume/etc.) snappy even if the broker is
 * sluggish.
 */
@Service
@RequiredArgsConstructor
public class CTFNotificationService {

    private static final Logger log = LoggerFactory.getLogger(CTFNotificationService.class);

    private final CTFNotificationRepository  notifRepo;
    private final CTFCompetitionRepository   competitionRepo;
    private final SimpMessagingTemplate      ws;

    /** Tracks which competitions have already received the 30-min warning so
     *  the scheduler doesn't re-fire on every tick. Keyed by competition id. */
    private final Set<UUID> endingSoonSent = ConcurrentHashMap.newKeySet();

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Persist + broadcast a competition-wide notification. Returns the saved
     * DTO synchronously (callers may want the id), but the WebSocket fan-out
     * runs on a worker thread.
     */
    @Transactional
    public CTFNotificationDTO sendToCompetition(UUID competitionId, Type type, String title,
                                                 String body, Map<String, Object> metadata,
                                                 UUID sentBy) {
        CTFNotification saved = persist(competitionId, type, title, body, metadata, sentBy);
        CTFNotificationDTO dto = CTFNotificationDTO.from(saved);
        broadcastCompetitionAsync(competitionId, dto);
        return dto;
    }

    /**
     * Sends a notification to a single team. Used for moderation messages
     * like disqualification. We don't persist these to the history table
     * — that's a per-competition log and per-team toasts would clutter it.
     */
    @Async
    public void sendToTeam(UUID teamId, Type type, String title, String body,
                            Map<String, Object> metadata) {
        try {
            CTFNotificationDTO dto = CTFNotificationDTO.builder()
                    .id(UUID.randomUUID())
                    .competitionId(null)
                    .type(type.name())
                    .title(title)
                    .body(body)
                    .metadata(metadata == null ? Map.of() : metadata)
                    .sentAt(LocalDateTime.now())
                    .build();
            ws.convertAndSend("/topic/ctf/team/" + teamId + "/notifications", dto);
        } catch (Exception e) {
            log.warn("Failed to broadcast team notification to team={} type={}: {}", teamId, type, e.getMessage());
        }
    }

    /** Read history — newest first, capped at 50. */
    public List<CTFNotificationDTO> getHistory(UUID competitionId) {
        return notifRepo.findByCompetitionIdOrderBySentAtDesc(competitionId, PageRequest.of(0, 50))
                .stream()
                .map(CTFNotificationDTO::from)
                .collect(Collectors.toList());
    }

    // ── Scheduled: 30-min warning ────────────────────────────────────────────

    /**
     * Runs every minute. Fires {@link Type#COMPETITION_ENDING_SOON} for any
     * currently-running competition whose remaining time is in the
     * (29min, 30min] window — that one-minute slice prevents duplicate sends
     * even if the scheduler runs slightly off-cadence.
     */
    @Scheduled(fixedRate = 60_000, initialDelay = 30_000)
    public void scheduleEndingSoonWarnings() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime windowOpen  = now.plusMinutes(29);
        LocalDateTime windowClose = now.plusMinutes(30);

        try {
            for (CTFCompetition comp : competitionRepo.findActiveUpcoming(now)) {
                LocalDateTime end = comp.getEndTime();
                if (end == null) continue;
                if (end.isAfter(windowOpen) && !end.isAfter(windowClose)
                        && !endingSoonSent.contains(comp.getId())) {
                    sendToCompetition(comp.getId(), Type.COMPETITION_ENDING_SOON,
                            "⚠ 30 Minutes Remaining",
                            "The competition ends in 30 minutes. Final push!",
                            Map.of("endTime", end.toString()),
                            null);
                    endingSoonSent.add(comp.getId());
                }
            }
        } catch (Exception e) {
            log.warn("scheduleEndingSoonWarnings tick failed: {}", e.getMessage());
        }
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private CTFNotification persist(UUID competitionId, Type type, String title, String body,
                                     Map<String, Object> metadata, UUID sentBy) {
        // Defensive: a non-null FK is required. Surface a clear error early.
        if (competitionId == null) {
            throw new IllegalArgumentException("competitionId is required.");
        }
        if (!competitionRepo.existsById(competitionId)) {
            throw new EntityNotFoundException("Competition not found: " + competitionId);
        }
        CTFNotification n = CTFNotification.builder()
                .competitionId(competitionId)
                .type(type)
                .title(title)
                .body(body)
                .metadata(metadata == null ? Map.of() : metadata)
                .sentBy(sentBy)
                .build();
        return notifRepo.save(n);
    }

    @Async
    public void broadcastCompetitionAsync(UUID competitionId, CTFNotificationDTO dto) {
        try {
            ws.convertAndSend("/topic/ctf/" + competitionId + "/notifications", dto);
        } catch (Exception e) {
            log.warn("Failed to broadcast competition notification {}: {}", dto.getId(), e.getMessage());
        }
    }
}
