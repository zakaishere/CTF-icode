package com.university.platform.ctf.dto;

import lombok.*;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CTFSubmitResponse {

    private boolean correct;
    private String message;
    private Integer pointsAwarded;
    private int attemptsUsed;
    private int maxAttempts;
}
