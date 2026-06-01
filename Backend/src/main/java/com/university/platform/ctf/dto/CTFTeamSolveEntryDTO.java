package com.university.platform.ctf.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CTFTeamSolveEntryDTO {
    private UUID challengeId;
    private String challengeTitle;
    private String category;
    private int currentPoints;
    private LocalDateTime solvedAt;
}
