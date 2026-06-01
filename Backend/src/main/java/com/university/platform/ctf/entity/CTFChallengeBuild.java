package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_challenge_builds")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFChallengeBuild {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "challenge_id", nullable = false, columnDefinition = "uuid")
    private UUID challengeId;

    @Builder.Default
    @Column(name = "source_type", nullable = false, length = 10)
    private String sourceType = "REGISTRY";

    @Column(name = "zip_file_path", length = 500)
    private String zipFilePath;

    @Column(name = "zip_original_name", length = 255)
    private String zipOriginalName;

    @Column(name = "zip_sha256", length = 64)
    private String zipSha256;

    @Column(name = "registry_url", length = 500)
    private String registryUrl;

    @Column(name = "built_image_tag", length = 500)
    private String builtImageTag;

    @Builder.Default
    @Column(name = "build_status", nullable = false, length = 15)
    private String buildStatus = "PENDING";

    @Column(name = "build_log", columnDefinition = "TEXT")
    private String buildLog;

    @Column(name = "build_started_at")
    private LocalDateTime buildStartedAt;

    @Column(name = "build_finished_at")
    private LocalDateTime buildFinishedAt;

    @Column(name = "built_by", columnDefinition = "uuid")
    private UUID builtBy;

    @Column(name = "image_size_mb")
    private Integer imageSizeMb;

    @Builder.Default
    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false, nullable = false)
    private LocalDateTime createdAt;
}
