package com.university.platform.ctf.dto;

import com.university.platform.ctf.entity.CTFCompetition;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CTFCompetitionDTO {
    private UUID id;
    private String title;
    private String description;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private LocalDateTime computedEndTime;  // effective end for DURATION mode
    private int maxTeamSize;
    private int minTeamSize;
    private String scoringMode;
    private String visibility;
    private String bannerUrl;
    private String coverImageUrl;
    private boolean active;
    private boolean started;
    private boolean ended;

    // Timing mode fields ─────────────────────────────────────────────────────
    private String  timingMode;          // SCHEDULED | DURATION | MANUAL | REGISTRATION
    private Integer durationHours;       // total minutes for DURATION/REGISTRATION mode
    private boolean manuallyStarted;
    private boolean manuallyEnded;

    // Status fields ──────────────────────────────────────────────────────────
    private String status;               // UPCOMING | ACTIVE | PAUSED | FROZEN | ENDED
    private boolean isPaused;
    private boolean isFrozen;
    private LocalDateTime pausedAt;
    private LocalDateTime frozenAt;
    private boolean registrationOpen;    // can new teams join right now?
    private boolean canEnterArena;
    private CTFTeamResponse myTeam;

    public static CTFCompetitionDTO from(CTFCompetition c) {
        LocalDateTime now = LocalDateTime.now();
        CTFCompetition.Status st = c.computeStatus();
        LocalDateTime effEnd = c.getEffectiveEndTime();
        boolean ended = effEnd != null && now.isAfter(effEnd);

        // Teams can register if:
        //   - competition.registrationOpen = true → allow anytime until ENDED
        //   - otherwise → only while UPCOMING
        boolean canRegister = Boolean.TRUE.equals(c.getRegistrationOpen())
                ? st != CTFCompetition.Status.ENDED
                : st == CTFCompetition.Status.UPCOMING;

        boolean hasStarted = (c.getTimingMode() == CTFCompetition.TimingMode.MANUAL
                || c.getTimingMode() == CTFCompetition.TimingMode.REGISTRATION)
                ? Boolean.TRUE.equals(c.getIsManuallyStarted())
                : (c.getStartTime() != null && now.isAfter(c.getStartTime()));

        return CTFCompetitionDTO.builder()
                .id(c.getId())
                .title(c.getTitle())
                .description(c.getDescription())
                .startTime(c.getStartTime())
                .endTime(c.getEndTime())
                .computedEndTime(effEnd)
                .maxTeamSize(c.getMaxTeamSize())
                .minTeamSize(c.getMinTeamSize())
                .scoringMode(c.getScoringMode().name())
                .visibility(c.getVisibility().name())
                .bannerUrl(c.getBannerUrl())
                .coverImageUrl(c.getCoverImageUrl())
                .active(Boolean.TRUE.equals(c.getIsActive()))
                .started(hasStarted)
                .ended(ended)
                .timingMode(c.getTimingMode().name())
                .durationHours(c.getDurationHours())
                .manuallyStarted(Boolean.TRUE.equals(c.getIsManuallyStarted()))
                .manuallyEnded(Boolean.TRUE.equals(c.getManuallyEnded()))
                .status(st.name())
                .isPaused(Boolean.TRUE.equals(c.getIsPaused()))
                .isFrozen(Boolean.TRUE.equals(c.getIsFrozen()))
                .pausedAt(c.getPausedAt())
                .frozenAt(c.getFrozenAt())
                .registrationOpen(canRegister)
                .canEnterArena(false)
                .myTeam(null)
                .build();
    }
}
