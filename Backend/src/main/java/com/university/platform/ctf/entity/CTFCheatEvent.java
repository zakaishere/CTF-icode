package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_cheat_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFCheatEvent {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "competition_id", columnDefinition = "uuid")
    private UUID competitionId;

    @Column(name = "challenge_id", columnDefinition = "uuid")
    private UUID challengeId;

    @Column(name = "submitting_team", columnDefinition = "uuid")
    private UUID submittingTeam;

    /** The exact team member who submitted — taken from the JWT, never client-supplied. */
    @Column(name = "submitting_user_id", columnDefinition = "uuid")
    private UUID submittingUserId;

    @Column(name = "source_team", columnDefinition = "uuid")
    private UUID sourceTeam;

    @Column(name = "submitted_value", length = 500)
    private String submittedValue;

    @CreationTimestamp
    @Column(name = "detected_at", updatable = false)
    private LocalDateTime detectedAt;

    @Builder.Default
    @Column(name = "dismissed", nullable = false)
    private Boolean dismissed = false;

    @Column(name = "dismissed_at")
    private LocalDateTime dismissedAt;

    @Column(name = "dismissed_by", columnDefinition = "uuid")
    private UUID dismissedBy;
}
