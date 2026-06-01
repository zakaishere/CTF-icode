package com.university.platform.ctf.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CTFJoinTeamRequest {

    @NotBlank
    private String inviteCode;
}
