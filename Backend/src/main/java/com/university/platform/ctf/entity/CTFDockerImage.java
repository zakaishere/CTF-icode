package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_docker_images")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFDockerImage {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "image_ref", nullable = false, unique = true, length = 512)
    private String imageRef;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 10)
    private String status = "PENDING";

    @Column(name = "pulled_at")
    private LocalDateTime pulledAt;

    @Column(name = "error", columnDefinition = "TEXT")
    private String error;
}
