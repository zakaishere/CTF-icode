package com.university.platform.ctf.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * CHANGE 6 (Section 16 Query 6): One data point in a team's cumulative score
 * timeline for the scoreboard graph.
 */
@Getter
@AllArgsConstructor
public class CTFGraphPointDTO {
    private final LocalDateTime time;
    private final int score;
}
