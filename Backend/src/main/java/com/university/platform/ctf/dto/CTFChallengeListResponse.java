package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * Wrapper for the challenges endpoint. Allows the response shape to vary
 * with competition status:
 *   UPCOMING → empty list + categoryCounts so the UI can render locked
 *              category previews while titles/descriptions stay hidden
 *   ACTIVE/FROZEN/PAUSED/ENDED → full challenge list
 */
@Data
@Builder
public class CTFChallengeListResponse {
    private String status;                       // mirrors competition status
    private String message;                      // human-readable hint, may be null
    private List<CTFChallengeDTO> challenges;    // empty list when UPCOMING
    private Map<String, Integer> categoryCounts; // category → count, for UPCOMING preview
}
