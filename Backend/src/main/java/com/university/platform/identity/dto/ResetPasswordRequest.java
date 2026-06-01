package com.university.platform.identity.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ResetPasswordRequest {

    @NotBlank @Email
    public String email;

    @NotBlank @Pattern(regexp = "\\d{6}", message = "OTP must be 6 digits")
    public String otpCode;

    @NotBlank @Size(min = 8, max = 128)
    public String newPassword;
}
