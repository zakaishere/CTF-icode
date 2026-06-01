package com.university.platform.ctf.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;
import java.util.UUID;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class CTFTeamMemberId implements Serializable {

    @Column(name = "team_id", columnDefinition = "uuid")
    private UUID teamId;

    @Column(name = "user_id", columnDefinition = "uuid")
    private UUID userId;
}
