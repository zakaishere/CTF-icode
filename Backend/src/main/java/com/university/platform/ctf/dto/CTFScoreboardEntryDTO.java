package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CTFScoreboardEntryDTO {
    private int rank;
    private UUID teamId;
    private String teamName;
    private String avatarColor;
    private int totalPoints;
    private int solveCount;
    private int membersCount;
    private LocalDateTime lastSolveAt;
}
