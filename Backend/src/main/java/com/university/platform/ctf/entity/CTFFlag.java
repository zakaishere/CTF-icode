package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.util.UUID;

/**
 * CHANGE 1 (Section 3, 14): Separate flags table.
 * One challenge can have multiple accepted flags (static text or regex pattern).
 * Used by practice-mode CTFSubmissionService only.
 * Competition flags stay in ctf_team_flags (DYNAMIC) or challenge.flag_hash (STATIC).
 */
@Entity
@Table(name = "ctf_flags")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFFlag {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "challenge_id", nullable = false, columnDefinition = "uuid")
    private UUID challengeId;

    @Builder.Default
    @Column(name = "type", nullable = false, length = 10)
    private String type = "STATIC";

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Builder.Default
    @Column(name = "case_insensitive", nullable = false)
    private boolean caseInsensitive = false;
}
