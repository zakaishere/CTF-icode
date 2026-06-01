package com.university.platform.ctf.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class CTFTransferCaptaincyRequest {

    @NotNull
    private UUID newCaptainId;
}
