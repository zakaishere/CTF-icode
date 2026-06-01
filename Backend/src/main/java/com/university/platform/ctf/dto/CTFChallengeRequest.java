package com.university.platform.ctf.dto;

import lombok.*;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CTFChallengeRequest {

    private String title;
    private String description;
    private String category;
    private String difficulty;
    private Integer basePoints;
    private String flagHash;
    private String flagFormat;
    private Boolean requiresInstance;
    private String dockerImage;
    private Integer dockerExposedPort;
    private String containerEnvVars;
    private String downloadableFileUrl;
    private String downloadableFileName;
    private List<CTFHint> hints;
    private Integer maxAttempts;
    private Boolean isActive;
}
