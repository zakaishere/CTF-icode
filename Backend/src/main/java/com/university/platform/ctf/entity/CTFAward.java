package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * CHANGE 2 (Section 14): Awards table — unifies positive solve credits and
 * negative hint deductions in one place.
 * Scoreboard = SUM(value) per team.  Never store a running score column.
 *
 * reason examples:
 *   "solve:<challengeId>"   — correct flag submission
 *   "hint:<hintId>"         — hint unlock (value is negative)
 *   "admin:<note>"          — manual adjustment by teacher/admin
 */
@Entity
@Table(name = "ctf_awards")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFAward {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "competition_id", nullable = false, columnDefinition = "uuid")
    private UUID competitionId;

    @Column(name = "team_id", nullable = false, columnDefinition = "uuid")
    private UUID teamId;

    @Column(name = "value", nullable = false)
    private int value;

    @Column(name = "reason", length = 255)
    private String reason;

    @CreationTimestamp
    @Column(name = "awarded_at", updatable = false)
    private LocalDateTime awardedAt;
}
