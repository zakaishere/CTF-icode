package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
@Builder
public class CTFTeamResponse {
    private UUID id;
    private UUID competitionId;
    private String name;
    private String inviteCode;
    private String avatarColor;
    private UUID captainId;
    private List<CTFTeamMemberDTO> members;
    private int solveCount;
    private int totalPoints;
}
