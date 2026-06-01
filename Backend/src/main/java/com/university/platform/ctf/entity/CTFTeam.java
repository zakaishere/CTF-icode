package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_teams",
       uniqueConstraints = @UniqueConstraint(columnNames = {"competition_id", "name"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFTeam {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "competition_id", nullable = false, columnDefinition = "uuid")
    private UUID competitionId;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "invite_code", nullable = false, unique = true, length = 10)
    private String inviteCode;

    @Builder.Default
    @Column(name = "avatar_color", length = 7)
    private String avatarColor = "#6366f1";

    @Column(name = "captain_id", columnDefinition = "uuid")
    private UUID captainId;

    @Builder.Default
    @Column(name = "is_disqualified", nullable = false)
    private Boolean isDisqualified = false;

    @Column(name = "disqualified_at")
    private LocalDateTime disqualifiedAt;

    @Column(name = "disqualified_reason", length = 500)
    private String disqualifiedReason;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
