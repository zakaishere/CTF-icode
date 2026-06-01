package com.university.platform.ctf.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CTFCompetitionUpdateRequest {

    @Size(min = 3, max = 255)
    private String title;

    @Size(max = 5000)
    private String description;

    private LocalDateTime startTime;
    private LocalDateTime endTime;

    @Min(1) @Max(20)
    private Integer maxTeamSize;

    @Min(1) @Max(20)
    private Integer minTeamSize;

    @Pattern(regexp = "STATIC|DYNAMIC")
    private String scoringMode;

    @Min(0) @Max(10000)
    private Integer dynamicMinPoints;

    @DecimalMin("0.0") @DecimalMax("1.0")
    private Double dynamicDecayFactor;

    @Pattern(regexp = "PUBLIC|ACCESS_CODE|INVITE_ONLY")
    private String visibility;

    @Size(max = 30)
    @Pattern(regexp = "^[A-Za-z0-9_-]*$")
    private String accessCode;

    @Size(max = 500)
    private String bannerUrl;

    private Boolean isActive;

    @Pattern(regexp = "SCHEDULED|DURATION|MANUAL|REGISTRATION")
    private String timingMode;

    @Min(1)
    private Integer durationHours;

    private Boolean registrationOpen;
}
