package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Teacher view of a single team. Includes members, score, and disqualification
 * status — different from {@link CTFTeamResponse} which is the student-facing
 * shape (includes invite code, hides DQ details).
 */
@Data
@Builder
public class CTFTeacherTeamDTO {
    private UUID id;
    private String name;
    private String avatarColor;
    private UUID captainId;
    private String captainName;
    private List<CTFTeamMemberDTO> members;
    private int totalPoints;
    private int solveCount;
    private LocalDateTime lastSolveAt;
    private LocalDateTime createdAt;
    private boolean isDisqualified;
    private LocalDateTime disqualifiedAt;
    private String disqualifiedReason;
}
