package com.university.platform.ctf.entity;

import com.university.platform.ctf.converter.CTFHintListConverter;
import com.university.platform.ctf.dto.CTFHint;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "ctf_challenges")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFChallenge {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT", nullable = false)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 20)
    private CTFCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "difficulty", nullable = false, length = 10)
    private CTFDifficulty difficulty;

    @Column(name = "base_points", nullable = false)
    private Integer basePoints;

    @Column(name = "flag_hash", nullable = false, length = 64)
    private String flagHash;

    /** Plaintext flag stored only for STATIC challenges — used to inject the correct value into Docker containers.
     *  Never exposed to students via any API. Null for DYNAMIC challenges. */
    @Column(name = "flag_value", length = 500)
    private String flagValue;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "flag_type", nullable = false, length = 10)
    private FlagType flagType = FlagType.STATIC;

    @Builder.Default
    @Column(name = "flag_format", length = 100)
    private String flagFormat = "FLAG{?}";

    @Builder.Default
    @Column(name = "requires_instance")
    private Boolean requiresInstance = false;

    @Column(name = "docker_image", length = 255)
    private String dockerImage;

    @Column(name = "container_port")
    private Integer dockerExposedPort;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "container_env_vars", columnDefinition = "jsonb")
    private String containerEnvVars;

    /** Env var name where FLAG is injected into the container (default "FLAG"). */
    @Builder.Default
    @Column(name = "docker_flag_env", length = 64)
    private String dockerFlagEnv = "FLAG";

    /** "HTTP" (default) or "TCP". */
    @Builder.Default
    @Column(name = "connection_type", length = 10)
    private String connectionType = "HTTP";

    /** Teacher-supplied extra env vars — FLAG key is silently dropped on write. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "docker_env_vars", columnDefinition = "jsonb")
    private Map<String, String> dockerEnvVars;

    @Column(name = "docker_memory_mb")
    private Integer dockerMemoryMb;

    @Column(name = "docker_cpu_percent")
    private Integer dockerCpuPercent;

    @Column(name = "docker_pids_limit")
    private Integer dockerPidsLimit;

    @Column(name = "downloadable_file_url", length = 500)
    private String downloadableFileUrl;

    @Column(name = "downloadable_file_name", length = 255)
    private String downloadableFileName;

    /** Optional image or GIF URL shown inside the challenge modal. */
    @Column(name = "media_url", length = 500)
    private String mediaUrl;

    @Builder.Default
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "hints", columnDefinition = "jsonb")
    @Convert(converter = CTFHintListConverter.class)
    private List<CTFHint> hints = new ArrayList<>();

    // CHANGE 3 (Section 4, 15): per-challenge dynamic scoring parameters.
    // Nullable — if null, falls back to base_points / competition-level defaults.
    @Column(name = "initial_value")
    private Integer initialValue;

    @Column(name = "minimum_value")
    private Integer minimumValue;

    @Column(name = "decay_value")
    private Integer decayValue;

    @Builder.Default
    @Column(name = "max_attempts")
    private Integer maxAttempts = 10;

    @Builder.Default
    @Column(name = "is_active")
    private Boolean isActive = true;

    @Builder.Default
    @Column(name = "is_hidden")
    private Boolean isHidden = true;

    @Column(name = "author_id")
    private UUID authorId;

    @Column(name = "competition_id", columnDefinition = "uuid")
    private UUID competitionId;

    /** True when this challenge belongs to the teacher's reusable library. */
    @Builder.Default
    @Column(name = "is_library", nullable = false)
    private Boolean isLibrary = false;

    /** Set for library challenges — the teacher who owns this template. */
    @Column(name = "library_owner_id")
    private UUID libraryOwnerId;

    /** Set on competition copies — tracks which library challenge was the source. */
    @Column(name = "library_source_id")
    private UUID librarySourceId;

    // Blood bonus — optional per-solve reward for 1st/2nd/3rd solvers.
    // disabled by default; bonus does NOT change the displayed challenge point value.
    @Builder.Default
    @Column(name = "blood_bonus_enabled", nullable = false)
    private Boolean bloodBonusEnabled = false;

    @Builder.Default
    @Column(name = "first_blood_bonus", nullable = false)
    private Integer firstBloodBonus = 0;

    @Builder.Default
    @Column(name = "second_blood_bonus", nullable = false)
    private Integer secondBloodBonus = 0;

    @Builder.Default
    @Column(name = "third_blood_bonus", nullable = false)
    private Integer thirdBloodBonus = 0;

    @Builder.Default
    @Column(name = "deleted", nullable = false)
    private Boolean deleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public enum CTFCategory { CRYPTO, FORENSICS, REVERSE, WEB, MISC, OSINT, PWN }
    public enum CTFDifficulty { EASY, MEDIUM, HARD }
    public enum FlagType { STATIC, DYNAMIC }
}
