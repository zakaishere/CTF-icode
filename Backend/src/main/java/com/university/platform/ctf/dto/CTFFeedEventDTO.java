package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CTFFeedEventDTO {
    private UUID competitionId;
    private UUID teamId;
    private String teamName;
    private String avatarColor;
    private UUID challengeId;
    private String challengeTitle;
    private int pointsAwarded;
    private LocalDateTime solvedAt;
}
