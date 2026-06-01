package com.university.platform.ctf.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "ctf_competitions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CTFCompetition {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false, columnDefinition = "uuid")
    private UUID id;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "start_time")
    private LocalDateTime startTime;

    @Column(name = "end_time")
    private LocalDateTime endTime;

    @Builder.Default
    @Column(name = "max_team_size")
    private Integer maxTeamSize = 4;

    @Builder.Default
    @Column(name = "min_team_size")
    private Integer minTeamSize = 1;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    @Column(name = "scoring_mode", length = 10)
    private ScoringMode scoringMode = ScoringMode.DYNAMIC;

    @Builder.Default
    @Column(name = "dynamic_min_points")
    private Integer dynamicMinPoints = 50;

    @Builder.Default
    @Column(name = "dynamic_decay_factor")
    private Double dynamicDecayFactor = 0.08;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    @Column(name = "visibility", length = 20)
    private Visibility visibility = Visibility.PUBLIC;

    @Column(name = "access_code", length = 20)
    private String accessCode;

    @Column(name = "banner_url", length = 500)
    private String bannerUrl;

    @Column(name = "created_by", columnDefinition = "uuid")
    private UUID createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Builder.Default
    @Column(name = "is_active")
    private Boolean isActive = true;

    @Builder.Default
    @Column(name = "is_paused")
    private Boolean isPaused = false;

    @Builder.Default
    @Column(name = "is_frozen")
    private Boolean isFrozen = false;

    @Column(name = "paused_at")
    private LocalDateTime pausedAt;

    @Column(name = "frozen_at")
    private LocalDateTime frozenAt;

    // CHANGE 3 (Section 4, 15): CTFd-compatible scoring function.
    // STATIC = fixed base_points, LINEAR = CTFd linear decay, LOGARITHMIC = CTFd quadratic decay.
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "scoring_function", length = 15)
    private ScoringFunction scoringFunction = ScoringFunction.LOGARITHMIC;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    @Column(name = "timing_mode", length = 15, nullable = false)
    private TimingMode timingMode = TimingMode.SCHEDULED;

    @Column(name = "duration_hours")
    private Integer durationHours;

    @Builder.Default
    @Column(name = "registration_open", nullable = false)
    private Boolean registrationOpen = false;

    @Builder.Default
    @Column(name = "is_manually_started", nullable = false)
    private Boolean isManuallyStarted = false;

    @Builder.Default
    @Column(name = "manually_ended", nullable = false)
    private Boolean manuallyEnded = false;

    @Column(name = "cover_image_url", length = 500)
    private String coverImageUrl;

    public enum ScoringMode { STATIC, DYNAMIC }
    public enum ScoringFunction { STATIC, LINEAR, LOGARITHMIC }
    public enum Visibility  { PUBLIC, ACCESS_CODE, INVITE_ONLY }
    public enum TimingMode  { SCHEDULED, DURATION, MANUAL, REGISTRATION }

    public enum Status { UPCOMING, ACTIVE, PAUSED, FROZEN, ENDED }

    /**
     * Returns the effective end time, computing it for DURATION and REGISTRATION modes.
     * durationHours stores total minutes for sub-hour precision.
     */
    public LocalDateTime getEffectiveEndTime() {
        if ((timingMode == TimingMode.DURATION || timingMode == TimingMode.REGISTRATION)
                && durationHours != null && startTime != null) {
            return startTime.plusMinutes(durationHours);
        }
        return endTime;
    }

    /**
     * Computes the current competition status based on timing mode + flags.
     *
     * SCHEDULED:    uses startTime + endTime directly.
     * DURATION:     uses startTime + durationHours (stored as total minutes).
     * MANUAL:       UPCOMING until isManuallyStarted=true, then ACTIVE;
     *               ends when teacher calls endCompetition() (sets manuallyEnded + endTime).
     * REGISTRATION: UPCOMING (registration open) until teacher starts it (isManuallyStarted);
     *               then ACTIVE until duration elapsed or teacher ends it (manuallyEnded).
     *
     * Precedence: ENDED > PAUSED > FROZEN > ACTIVE > UPCOMING.
     */
    public Status computeStatus() {
        LocalDateTime now = LocalDateTime.now();

        // A manual end (endCompetition) wins for every mode. DURATION derives its
        // effective end from startTime+duration and ignores the endTime override,
        // so without this an early end on a DURATION competition has no effect.
        if (Boolean.TRUE.equals(manuallyEnded)) return Status.ENDED;

        if (timingMode == TimingMode.MANUAL || timingMode == TimingMode.REGISTRATION) {
            if (!Boolean.TRUE.equals(isManuallyStarted)) return Status.UPCOMING;
            if (Boolean.TRUE.equals(manuallyEnded))      return Status.ENDED;
            LocalDateTime eff = getEffectiveEndTime();
            if (eff != null && now.isAfter(eff))        return Status.ENDED;
            if (Boolean.TRUE.equals(isPaused))           return Status.PAUSED;
            if (Boolean.TRUE.equals(isFrozen))           return Status.FROZEN;
            return Status.ACTIVE;
        }

        // SCHEDULED or DURATION
        LocalDateTime eff = getEffectiveEndTime();
        if (eff != null && now.isAfter(eff))        return Status.ENDED;
        if (Boolean.TRUE.equals(isPaused))           return Status.PAUSED;
        if (Boolean.TRUE.equals(isFrozen))           return Status.FROZEN;
        if (startTime != null && now.isBefore(startTime)) return Status.UPCOMING;
        return Status.ACTIVE;
    }
}
