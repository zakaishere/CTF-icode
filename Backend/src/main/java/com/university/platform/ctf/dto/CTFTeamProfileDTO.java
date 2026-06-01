package com.university.platform.ctf.dto;

import lombok.*;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CTFTeamProfileDTO {
    private UUID id;
    private UUID competitionId;
    private String name;
    private String avatarColor;
    private UUID captainId;
    private int rank;
    private int totalPoints;
    private int solveCount;
    private List<CTFTeamMemberDTO> members;
    private List<CTFTeamSolveEntryDTO> solves;
}
