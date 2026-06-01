package com.university.platform.ctf.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class CTFChallengeUpdateRequest {

    private String  title;
    private String  description;
    private String  category;
    private String  difficulty;
    private Integer basePoints;

    /** If provided, re-hashes and stores; null keeps the existing flag. */
    private String  plainFlag;

    /** "STATIC" or "DYNAMIC"; null keeps the existing type. */
    private String  flagType;

    private String  flagFormat;
    private Boolean requiresInstance;
    private String  dockerImage;
    private Integer dockerExposedPort;
    private String  containerEnvVars;
    private String  dockerFlagEnv;
    private String  connectionType;
    private Map<String, String> dockerEnvVars;
    private Integer dockerMemoryMb;
    private Integer dockerCpuPercent;
    private Integer dockerPidsLimit;
    private String  downloadableFileUrl;
    private String  downloadableFileName;
    private String  mediaUrl;
    private Integer maxAttempts;
    private Boolean isActive;

    /** Full replacement of the hints list; null means keep existing hints. */
    private List<CTFHintRequest> hints;

    // Blood bonus settings — null = keep existing value
    private Boolean bloodBonusEnabled;
    private Integer firstBloodBonus;
    private Integer secondBloodBonus;
    private Integer thirdBloodBonus;
}
