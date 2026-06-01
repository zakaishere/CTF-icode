package com.university.platform.ctf.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class CTFCreateTeamRequest {

    @NotBlank
    @Pattern(regexp = "^[a-zA-Z0-9 \\-]{3,30}$",
             message = "Team name must be 3-30 characters: letters, digits, spaces, or hyphens only")
    private String name;

    private String avatarColor;
}
