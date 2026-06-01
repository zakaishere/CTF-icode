package com.university.platform.ctf.dto;

import com.university.platform.ctf.entity.CTFNotification;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/** Wire payload for both REST history and WebSocket push. */
@Data
@Builder
public class CTFNotificationDTO {
    private UUID id;
    private UUID competitionId;
    private String type;                  // CTFNotification.Type name
    private String title;
    private String body;
    private Map<String, Object> metadata;
    private LocalDateTime sentAt;

    public static CTFNotificationDTO from(CTFNotification n) {
        return CTFNotificationDTO.builder()
                .id(n.getId())
                .competitionId(n.getCompetitionId())
                .type(n.getType().name())
                .title(n.getTitle())
                .body(n.getBody())
                .metadata(n.getMetadata())
                .sentAt(n.getSentAt())
                .build();
    }
}
