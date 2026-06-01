package com.university.platform.ctf.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CTFInstanceWebSocketMessage {
    private UUID          instanceId;
    private String        status;           // RUNNING | FAILED | EXPIRED
    private String        connectionType;   // HTTP | TCP
    private String        connectionString; // URL or host:port
    private String        accessUrl;        // legacy alias
    private LocalDateTime expiresAt;
    private Integer       renewalCount;
    private String        error;
}
