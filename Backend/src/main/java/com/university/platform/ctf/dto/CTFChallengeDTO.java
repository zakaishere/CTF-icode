package com.university.platform.ctf.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CTFChallengeDTO {

    private UUID id;
    private String title;
    private String description;
    private String category;
    private String difficulty;
    private Integer basePoints;
    private Integer currentPoints;
    private String authorName;
    private String sshUsername;
    private String sshPassword;
    private String flagFormat;
    private String flagType;
    private Boolean requiresInstance;
    private String dockerImage;
    private Integer dockerExposedPort;
    private String connectionType;
    private String dockerFlagEnv;
    private Map<String, String> dockerEnvVars;
    private Integer dockerMemoryMb;
    private Integer dockerCpuPercent;
    private Integer dockerPidsLimit;
    private String downloadableFileUrl;
    private String downloadableFileName;
    private String mediaUrl;
    private List<CTFHintDTO> hints;
    private Integer maxAttempts;
    private Boolean isActive;
    private LocalDateTime createdAt;

    // Viewer-specific fields
    private boolean solvedByMe;
    private long solveCount;
    private List<String> myUnlockedHints;
    private int myAttempts;
    private boolean hasActiveInstance;
    /** Sum of hint costs this team has paid for this challenge (positive integer, 0 if none). */
    private int myHintPenalty;

    // Teacher-only field — always null in student-facing responses
    private Boolean isHidden;

    // Blood bonus settings
    private Boolean bloodBonusEnabled;
    private Integer firstBloodBonus;
    private Integer secondBloodBonus;
    private Integer thirdBloodBonus;
}
