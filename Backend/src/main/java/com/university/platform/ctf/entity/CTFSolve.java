package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_solves")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFSolve {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "challenge_id")
    private UUID challengeId;

    @Column(name = "user_id")
    private UUID userId;

    @Builder.Default
    @Column(name = "solved_at")
    private LocalDateTime solvedAt = LocalDateTime.now();

    @Column(name = "points_awarded", nullable = false)
    private Integer pointsAwarded;
}
