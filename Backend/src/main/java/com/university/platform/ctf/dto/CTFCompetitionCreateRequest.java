package com.university.platform.ctf.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CTFCompetitionCreateRequest {

    @NotBlank
    @Size(min = 3, max = 255)
    private String title;

    @Size(max = 5000)
    private String description;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    @Min(1)
    @Max(20)
    private Integer maxTeamSize = 4;

    @Min(1)
    @Max(20)
    private Integer minTeamSize = 1;

    /** STATIC or DYNAMIC */
    @Pattern(regexp = "STATIC|DYNAMIC")
    private String scoringMode = "DYNAMIC";

    @Min(0)
    @Max(10000)
    private Integer dynamicMinPoints = 50;

    @DecimalMin("0.0")
    @DecimalMax("1.0")
    private Double dynamicDecayFactor = 0.08;

    /** PUBLIC, ACCESS_CODE, INVITE_ONLY */
    @Pattern(regexp = "PUBLIC|ACCESS_CODE|INVITE_ONLY")
    private String visibility = "PUBLIC";

    /** Required when visibility != PUBLIC. */
    @Size(max = 30)
    @Pattern(regexp = "^[A-Za-z0-9_-]*$", message = "Access code: letters, digits, hyphen, underscore only")
    private String accessCode;

    @Size(max = 500)
    private String bannerUrl;

    /** SCHEDULED | DURATION | MANUAL | REGISTRATION */
    @Pattern(regexp = "SCHEDULED|DURATION|MANUAL|REGISTRATION")
    private String timingMode = "SCHEDULED";

    /** For DURATION mode: total minutes until competition ends (stored in duration_hours column). */
    @Min(1)
    private Integer durationHours;

    /** When true, teams may join/create after the competition starts. Default: false (lock at start). */
    private Boolean registrationOpen = false;
}
