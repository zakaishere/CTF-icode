package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Lightweight public status payload — no auth required.
 * Used by the lobby entry page so unauthenticated users can see when a
 * competition starts.
 */
@Data
@Builder
public class CTFCompetitionStatusDTO {
    private UUID id;
    private String status;                  // UPCOMING | ACTIVE | PAUSED | FROZEN | ENDED
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private UUID myTeamId;                  // null if user not authenticated / not in team
    private boolean canEnterArena;
    private boolean registrationOpen;
    private int participantCount;
    private int teamCount;
    private boolean isPaused;
    private boolean isFrozen;
    private LocalDateTime pausedAt;
    private LocalDateTime frozenAt;
}
