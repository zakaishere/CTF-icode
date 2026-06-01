package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class CTFChallengeDetailResponse {

    private UUID            id;
    private String          title;
    private String          description;
    private String          category;
    private String          difficulty;
    private Integer         basePoints;
    private String          flagFormat;
    private Boolean         requiresInstance;
    private String          dockerImage;
    private Integer         dockerExposedPort;
    private String          containerEnvVars;
    private String          dockerFlagEnv;
    private String          connectionType;
    private Map<String,String> dockerEnvVars;
    private Integer         dockerMemoryMb;
    private Integer         dockerCpuPercent;
    private Integer         dockerPidsLimit;
    private String          downloadableFileUrl;
    private String          downloadableFileName;
    private List<CTFHint>   hints;
    private Integer         maxAttempts;
    private Boolean         isActive;
    private UUID            authorId;
    private LocalDateTime   createdAt;
    private LocalDateTime   updatedAt;

    private long            solveCount;
    private long            attemptCount;

    private List<RecentSolve>      recentSolves;
    private List<SubmissionRecord> recentSubmissions;

    @Data
    @Builder
    public static class RecentSolve {
        private UUID   userId;
        private String userDisplayName;
        private LocalDateTime solvedAt;
        private int    pointsAwarded;
    }

    @Data
    @Builder
    public static class SubmissionRecord {
        private UUID      id;
        private UUID      userId;
        private String    userDisplayName;
        private boolean   correct;
        private String    submittedValueMasked;
        private LocalDateTime submittedAt;
    }
}
