package com.university.platform.ctf.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Body for the teacher CUSTOM-broadcast endpoint. */
@Data
public class CTFBroadcastRequest {

    @NotBlank
    @Size(max = 100)
    private String title;

    @NotBlank
    @Size(max = 500)
    private String body;
}
