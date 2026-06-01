package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "ctf_notifications", indexes = {
        @Index(name = "idx_ctf_notif_competition", columnList = "competition_id, sent_at"),
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFNotification {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "competition_id", columnDefinition = "uuid", nullable = false)
    private UUID competitionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 30)
    private Type type;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "body", columnDefinition = "TEXT")
    private String body;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @CreationTimestamp
    @Column(name = "sent_at", updatable = false)
    private LocalDateTime sentAt;

    @Column(name = "sent_by", columnDefinition = "uuid")
    private UUID sentBy;

    public enum Type {
        COMPETITION_STARTED,
        COMPETITION_PAUSED,
        COMPETITION_RESUMED,
        COMPETITION_ENDING_SOON,
        COMPETITION_ENDED,
        NEW_CHALLENGE,
        CHALLENGE_UPDATED,
        HINT_ADDED,
        SCOREBOARD_FROZEN,
        SCOREBOARD_UNFROZEN,
        TEAM_DISQUALIFIED,
        CUSTOM
    }
}
