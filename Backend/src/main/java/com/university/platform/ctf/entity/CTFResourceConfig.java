package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_resource_config")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFResourceConfig {

    @Id
    @Column(name = "id")
    private Long id;

    @Builder.Default
    @Column(name = "max_concurrent_instances")
    private Integer maxConcurrentInstances = 3;

    @Builder.Default
    @Column(name = "max_instances_per_user")
    private Integer maxInstancesPerUser = 1;

    @Builder.Default
    @Column(name = "max_instance_duration_minutes")
    private Integer maxInstanceDurationMinutes = 30;

    @Builder.Default
    @Column(name = "container_memory_limit_mb")
    private Integer containerMemoryLimitMb = 128;

    @Builder.Default
    @Column(name = "container_cpu_percent")
    private Integer containerCpuPercent = 50;

    @Builder.Default
    @Column(name = "cleanup_interval_seconds")
    private Integer cleanupIntervalSeconds = 60;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
