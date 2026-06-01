package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class CTFLibraryChallengeDTO {
    private UUID   id;
    private String title;
    private String description;
    private String category;
    private String difficulty;
    private int    basePoints;
    private String flagType;
    private String flagFormat;
    private boolean requiresInstance;
    private String  dockerImage;
    private Integer dockerExposedPort;
    private String  connectionType;
    private String  dockerFlagEnv;
    private Map<String, String> dockerEnvVars;
    private Integer dockerMemoryMb;
    private Integer dockerCpuPercent;
    private Integer dockerPidsLimit;
    private String  downloadableFileUrl;
    private List<CTFHintDTO> hints;
    private Integer maxAttempts; // null = unlimited

    /** Latest build status: BUILDING / READY / FAILED / PENDING / null (no build yet). */
    private String buildStatus;
    private String builtImageTag;

    /** Number of competitions this library challenge has been copied into. */
    private int useCount;

    private LocalDateTime createdAt;
}
