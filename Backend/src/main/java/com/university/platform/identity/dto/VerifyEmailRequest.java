package com.university.platform.identity.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class VerifyEmailRequest {

    @NotBlank @Email
    public String email;

    @NotBlank @Pattern(regexp = "\\d{6}", message = "OTP must be 6 digits")
    public String otpCode;
}
