package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CTFTeacherCheatDTO {
    private UUID          id;
    private UUID          competitionId;

    // Challenge
    private UUID          challengeId;
    private String        challengeTitle;
    private String        challengeCategory;

    // Submitting team + user
    private UUID          submittingTeamId;
    private String        submittingTeamName;
    private String        submittingTeamAccentColor;
    private UUID          submittingUserId;
    private String        submittingUserName;
    private String        submittingUserEmail;

    // Source team (whose flag was stolen)
    private UUID          sourceTeamId;
    private String        sourceTeamName;
    private String        sourceTeamAccentColor;

    // Submission
    private String        submittedValue;          // intentionally not masked for teachers
    private LocalDateTime detectedAt;

    // State
    private boolean       dismissed;
    private String        dismissedByUsername;     // null when not yet dismissed
    private boolean       submittingTeamDisqualified;
}
