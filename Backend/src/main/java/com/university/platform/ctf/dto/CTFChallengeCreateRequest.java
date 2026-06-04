package com.university.platform.ctf.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class CTFChallengeCreateRequest {

    private String  title;
    private String  description;
    private String  authorName;
    private String  category;
    private String  difficulty;
    private Integer basePoints;

    /** Plain-text flag — required for STATIC, ignored for DYNAMIC. */
    private String  plainFlag;

    /** "STATIC" (default) or "DYNAMIC" (per-team generated flag). */
    private String  flagType;

    private String  flagFormat;
    private Boolean requiresInstance;
    private String  dockerImage;
    private Integer dockerExposedPort;
    private String  containerEnvVars;
    /** Env var name for FLAG injection — default "FLAG". */
    private String  dockerFlagEnv;
    /** "HTTP" or "TCP" */
    private String  connectionType;
    /** Extra env vars; FLAG key is silently rejected. */
    private Map<String, String> dockerEnvVars;
    private Integer dockerMemoryMb;
    private Integer dockerCpuPercent;
    private Integer dockerPidsLimit;
    private String  downloadableFileUrl;
    private String  downloadableFileName;
    private String  mediaUrl;
    private Integer maxAttempts;
    private Boolean isActive;

    /** Hints provided at creation time — backend generates IDs. */
    private List<CTFHintRequest> hints;

    // Blood bonus settings — optional; null = disabled / keep existing
    private Boolean bloodBonusEnabled;
    private Integer firstBloodBonus;
    private Integer secondBloodBonus;
    private Integer thirdBloodBonus;
}
