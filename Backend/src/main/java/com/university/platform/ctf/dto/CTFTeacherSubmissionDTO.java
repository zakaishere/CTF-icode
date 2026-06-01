package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One row in the teacher Submissions tab. Built from {@code CTFSubmission}
 * which persists every flag attempt — correct, incorrect, and cheat-flagged.
 */
@Data
@Builder
public class CTFTeacherSubmissionDTO {
    private UUID id;
    private UUID teamId;
    private String teamName;
    private String avatarColor;
    private UUID challengeId;
    private String challengeTitle;
    private String challengeCategory;
    private UUID solvedByUserId;
    private String solvedByName;
    private int pointsAwarded;
    private boolean correct;
    private boolean cheatFlagged;
    /** The raw flag string the player submitted — shown truncated in the UI for anti-cheat review. */
    private String submittedValue;
    private LocalDateTime at;
}
