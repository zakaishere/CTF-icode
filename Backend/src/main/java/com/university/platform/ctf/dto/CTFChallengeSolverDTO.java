package com.university.platform.ctf.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CTFChallengeSolverDTO {
    private UUID teamId;
    private String teamName;
    private String avatarColor;
    private LocalDateTime solvedAt;
    /** 1 = first blood, 2 = second blood, 3 = third blood, null = no blood position. */
    private Integer bloodPosition;
    /** Bonus points awarded for this blood position; null when bloodPosition is null. */
    private Integer bloodBonus;
}
