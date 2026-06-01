package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Top-of-dashboard snapshot for the teacher Control tab. Cheap to compute and
 * intended to be polled every ~10s.
 */
@Data
@Builder
public class CTFTeacherOverviewDTO {
    private UUID competitionId;
    private String title;
    private String status;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private LocalDateTime pausedAt;
    private LocalDateTime frozenAt;
    private boolean isPaused;
    private boolean isFrozen;

    // Stat cards
    private int teamCount;
    private int participantCount;
    private int solveCount;
    private int attemptCount;    // total submissions (correct + wrong) for the competition's challenges
    private int cheatCount;
    private int challengeCount;
    private int hiddenChallengeCount;

    // Recent activity feed — last N solves
    private List<RecentEvent> recentEvents;

    @Data
    @Builder
    public static class RecentEvent {
        private String type;            // SOLVE | CHEAT | NEW_TEAM
        private LocalDateTime at;
        private String teamName;
        private String avatarColor;
        private String detail;          // human-readable line
        private Integer points;         // null for non-solve events
    }
}
