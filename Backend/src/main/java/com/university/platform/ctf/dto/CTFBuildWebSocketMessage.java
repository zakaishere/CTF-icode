package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.UUID;

@Getter
@Builder
public class CTFBuildWebSocketMessage {
    private UUID    buildId;
    private UUID    challengeId;
    private String  status;
    private String  imageTag;
    private Integer imageSizeMb;
    private String  error;
    /** TCP port auto-detected from the image's EXPOSE instruction (null if none found). */
    private Integer detectedPort;
}
