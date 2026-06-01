package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_hint_unlocks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFHintUnlock {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "challenge_id")
    private UUID challengeId;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "team_id")
    private UUID teamId;

    @Column(name = "hint_id", length = 50, nullable = false)
    private String hintId;

    @Column(name = "points_spent", nullable = false)
    private Integer pointsSpent;

    @Builder.Default
    @Column(name = "unlocked_at")
    private LocalDateTime unlockedAt = LocalDateTime.now();
}
