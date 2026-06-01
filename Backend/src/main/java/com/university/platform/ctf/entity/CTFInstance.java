package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_instances")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFInstance {

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

    @Column(name = "competition_id")
    private UUID competitionId;

    @Column(name = "container_id", length = 255)
    private String containerId;

    @Column(name = "container_name", length = 128)
    private String containerName;

    @Column(name = "network_id", length = 128)
    private String networkId;

    @Column(name = "assigned_port")
    private Integer assignedPort;

    @Column(name = "connection_string", length = 512)
    private String connectionString;

    /** Never exposed to students — only injected into the container. */
    @Column(name = "flag_value", length = 255)
    private String flagValue;

    @Builder.Default
    @Column(name = "status", length = 20)
    private String status = "STARTING";

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Builder.Default
    @Column(name = "started_at")
    private LocalDateTime startedAt = LocalDateTime.now();

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "stopped_at")
    private LocalDateTime stoppedAt;

    @Builder.Default
    @Column(name = "renewal_count")
    private Integer renewalCount = 0;
}
