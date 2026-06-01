package com.university.platform.ctf.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CTFAccessCodeRequest {

    @NotBlank
    @Size(min = 1, max = 30)
    private String accessCode;
}
