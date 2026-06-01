package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_submissions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFSubmission {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "competition_id")
    private UUID competitionId;

    @Column(name = "challenge_id")
    private UUID challengeId;

    @Column(name = "team_id")
    private UUID teamId;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "submitted_value", length = 500, nullable = false)
    private String submittedValue;

    @Column(name = "is_correct", nullable = false)
    private Boolean isCorrect;

    @Column(name = "attempt_number", nullable = false)
    private Integer attemptNumber;

    @Builder.Default
    @Column(name = "submitted_at")
    private LocalDateTime submittedAt = LocalDateTime.now();

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    /** True when the submitted flag belonged to another team (cross-team flag reuse). */
    @Builder.Default
    @Column(name = "is_cheat_flagged", nullable = false)
    private Boolean isCheatFlagged = false;
}
