package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_competition_solves",
       uniqueConstraints = @UniqueConstraint(columnNames = {"competition_id", "challenge_id", "team_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFCompetitionSolve {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "competition_id", columnDefinition = "uuid")
    private UUID competitionId;

    @Column(name = "challenge_id", columnDefinition = "uuid")
    private UUID challengeId;

    @Column(name = "team_id", columnDefinition = "uuid")
    private UUID teamId;

    @Column(name = "solved_by", columnDefinition = "uuid")
    private UUID solvedBy;

    @CreationTimestamp
    @Column(name = "solved_at", updatable = false)
    private LocalDateTime solvedAt;

    @Column(name = "points_awarded", nullable = false)
    private Integer pointsAwarded;
}
