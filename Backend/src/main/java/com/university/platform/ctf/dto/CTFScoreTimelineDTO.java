package com.university.platform.ctf.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CTFScoreTimelineDTO {

    private List<TeamTimeline> teams;
    private String             competitionStart;  // ISO-8601 local datetime, null for MANUAL not-yet-started
    private String             competitionEnd;    // null when ACTIVE with no fixed end

    @Data
    @Builder
    public static class TeamTimeline {
        private UUID             teamId;
        private String           teamName;
        private String           accentColor;
        private List<ScorePoint> points;
    }

    @Data
    @Builder
    public static class ScorePoint {
        private String time;   // ISO-8601 local datetime string ("2026-05-22T10:30:00")
        private int    score;  // cumulative score at this moment
    }
}
