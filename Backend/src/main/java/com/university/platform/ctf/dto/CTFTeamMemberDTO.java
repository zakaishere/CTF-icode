package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CTFTeamMemberDTO {
    private UUID userId;
    private String displayName;
    private String role;
    private LocalDateTime joinedAt;
    private int solveCount;
    private int pointsContributed;
}
