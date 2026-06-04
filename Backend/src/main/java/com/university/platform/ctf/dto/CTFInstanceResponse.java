package com.university.platform.ctf.dto;

import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CTFInstanceResponse {

    private UUID          instanceId;
    /** "HTTP", "TCP", or "SSH" */
    private String        connectionType;
    private String        sshUsername;
    private String        sshPassword;
    /** Full URL for HTTP, "host:port" for TCP */
    private String        connectionString;
    /** Legacy — kept for backward compat; same as connectionString for HTTP */
    private String        accessUrl;
    private LocalDateTime expiresAt;
    private String        status;
    private String        message;
    private Integer       renewalCount;
}
