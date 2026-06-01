package com.university.platform.ctf.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class CTFCompetitionSubmitResponse {
    private boolean correct;
    private String message;
    private Integer pointsAwarded;
    private Integer newRank;

    /** How many submissions this team has made (including the one just processed). */
    private int attemptsUsed;

    /** Remaining attempts; null when the challenge has no limit. */
    private Integer attemptsRemaining;

    /** True once the team has exhausted their attempts without solving. */
    private boolean lockedOut;

    /** True when a running Docker instance for this challenge was stopped on solve. */
    private boolean instanceStopped;
}
