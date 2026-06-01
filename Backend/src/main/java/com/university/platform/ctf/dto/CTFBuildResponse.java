package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Getter;

import java.util.UUID;

@Getter
@Builder
public class CTFBuildResponse {
    private UUID   buildId;
    private String status;
    private String message;
}
