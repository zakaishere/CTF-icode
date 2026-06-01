package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CTFAttemptDTO {
    private UUID id;
    private LocalDateTime submittedAt;
    private boolean correct;
    /** Flag value with middle characters masked for display. */
    private String flagMasked;
    private int attemptNumber;
}
