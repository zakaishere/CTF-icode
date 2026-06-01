package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "ctf_team_members")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFTeamMember {

    @EmbeddedId
    private CTFTeamMemberId id;

    @CreationTimestamp
    @Column(name = "joined_at", updatable = false)
    private LocalDateTime joinedAt;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    @Column(name = "role", length = 10)
    private Role role = Role.MEMBER;

    public enum Role { CAPTAIN, MEMBER }
}
