package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.*;
import com.university.platform.ctf.entity.*;
import com.university.platform.ctf.repository.*;
import com.university.platform.identity.model.User;
import com.university.platform.identity.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Teacher-only read/management endpoints scoped to a competition: dashboard
 * overview, team list, submissions log, cheat events, CSV export, and the
 * disqualify-team action.
 */
@Service
@RequiredArgsConstructor
public class CTFTeacherManagementService {

    private static final Logger log = LoggerFactory.getLogger(CTFTeacherManagementService.class);

    private final CTFCompetitionTeacherService competitionTeacher;
    private final CTFCompetitionRepository      competitionRepo;
    private final CTFChallengeRepository        challengeRepo;
    private final CTFTeamRepository             teamRepo;
    private final CTFTeamMemberRepository       memberRepo;
    private final CTFCompetitionSolveRepository solveRepo;
    private final CTFSubmissionRepository       submissionRepo; // legacy / not always populated for competitions
    private final CTFCheatEventRepository       cheatRepo;
    private final UserRepository                userRepo;
    private final SimpMessagingTemplate         ws;
    private final CTFNotificationService        notifications;
    private final CTFTeamScoreService           teamScoreService;

    // ── Overview ─────────────────────────────────────────────────────────────

    public CTFTeacherOverviewDTO getOverview(UUID competitionId, UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionTeacher.loadOwned(competitionId, userId, isAdmin);

        int teamCount        = teamRepo.countByCompetitionId(competitionId);
        int participantCount = memberRepo.countParticipantsByCompetition(competitionId);
        int solveCount       = solveRepo.countByCompetitionId(competitionId);
        int cheatCount       = cheatRepo.countByCompetitionId(competitionId);
        List<CTFChallenge> challenges = challengeRepo
                .findByCompetitionIdAndDeletedFalse(competitionId);
        int hiddenChallenges = (int) challenges.stream()
                .filter(c -> Boolean.TRUE.equals(c.getIsHidden())).count();

        int attemptCount = (int) submissionRepo.countByCompetitionId(competitionId);

        log.info("[OVERVIEW] competitionId={} teamCount={} solveCount={} attemptCount={} cheatCount={}",
                competitionId, teamCount, solveCount, attemptCount, cheatCount);

        // Recent events — last 10 solves, newest first.
        List<CTFCompetitionSolve> recent = solveRepo.findRecentByCompetition(competitionId)
                .stream().limit(10).collect(Collectors.toList());

        Map<UUID, CTFTeam> teamMap = teamRepo.findByCompetitionId(competitionId)
                .stream().collect(Collectors.toMap(CTFTeam::getId, t -> t));
        Map<UUID, CTFChallenge> chalMap = challenges.stream()
                .collect(Collectors.toMap(CTFChallenge::getId, c -> c));

        List<CTFTeacherOverviewDTO.RecentEvent> events = recent.stream().map(s -> {
            CTFTeam team = teamMap.get(s.getTeamId());
            CTFChallenge chal = chalMap.get(s.getChallengeId());
            return CTFTeacherOverviewDTO.RecentEvent.builder()
                    .type("SOLVE")
                    .at(s.getSolvedAt())
                    .teamName(team != null ? team.getName() : "Unknown")
                    .avatarColor(team != null ? team.getAvatarColor() : "#94a3b8")
                    .detail("solved " + (chal != null ? chal.getTitle() : "challenge"))
                    .points(s.getPointsAwarded())
                    .build();
        }).collect(Collectors.toList());

        return CTFTeacherOverviewDTO.builder()
                .competitionId(comp.getId())
                .title(comp.getTitle())
                .status(comp.computeStatus().name())
                .startTime(comp.getStartTime())
                .endTime(comp.getEndTime())
                .pausedAt(comp.getPausedAt())
                .frozenAt(comp.getFrozenAt())
                .isPaused(Boolean.TRUE.equals(comp.getIsPaused()))
                .isFrozen(Boolean.TRUE.equals(comp.getIsFrozen()))
                .teamCount(teamCount)
                .participantCount(participantCount)
                .solveCount(solveCount)
                .attemptCount(attemptCount)
                .cheatCount(cheatCount)
                .challengeCount(challenges.size())
                .hiddenChallengeCount(hiddenChallenges)
                .recentEvents(events)
                .build();
    }

    // ── Teams ────────────────────────────────────────────────────────────────

    public List<CTFTeacherTeamDTO> listTeams(UUID competitionId, UUID userId, boolean isAdmin) {
        competitionTeacher.loadOwned(competitionId, userId, isAdmin);

        List<CTFTeam> teams = teamRepo.findByCompetitionId(competitionId);
        if (teams.isEmpty()) return List.of();

        // Previously summed solve.pointsAwarded directly — that snapshot is
        // pre-decay-correction, ignores hint penalties, and ignores blood
        // bonuses, so the admin panel showed a number that disagreed with both
        // the navbar and the scoreboard. Route through the canonical service.
        // Admins always see the live (unfrozen) totals.
        Map<UUID, CTFTeamScoreService.TeamTotals> totals =
                teamScoreService.teamTotals(competitionId, null);

        // Resolve user display names in one query.
        Set<UUID> userIds = new HashSet<>();
        Map<UUID, List<CTFTeamMember>> membersByTeam = new HashMap<>();
        for (CTFTeam t : teams) {
            List<CTFTeamMember> ms = memberRepo.findByIdTeamId(t.getId());
            membersByTeam.put(t.getId(), ms);
            ms.forEach(m -> userIds.add(m.getId().getUserId()));
            if (t.getCaptainId() != null) userIds.add(t.getCaptainId());
        }
        Map<UUID, User> userMap = userRepo.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        return teams.stream().map(t -> {
            List<CTFTeamMember> members = membersByTeam.getOrDefault(t.getId(), List.of());
            List<CTFTeamMemberDTO> memberDtos = members.stream().map(m -> {
                User u = userMap.get(m.getId().getUserId());
                return CTFTeamMemberDTO.builder()
                        .userId(m.getId().getUserId())
                        .displayName(u != null ? u.getUsername() : "Unknown")
                        .role(m.getRole().name())
                        .joinedAt(m.getJoinedAt())
                        .build();
            }).collect(Collectors.toList());

            User captain = t.getCaptainId() != null ? userMap.get(t.getCaptainId()) : null;
            CTFTeamScoreService.TeamTotals tt = totals.getOrDefault(
                    t.getId(), CTFTeamScoreService.TeamTotals.ZERO);
            return CTFTeacherTeamDTO.builder()
                    .id(t.getId())
                    .name(t.getName())
                    .avatarColor(t.getAvatarColor())
                    .captainId(t.getCaptainId())
                    .captainName(captain != null ? captain.getUsername() : null)
                    .members(memberDtos)
                    .totalPoints(tt.totalPoints())
                    .solveCount(tt.solveCount())
                    .lastSolveAt(tt.lastSolveAt())
                    .createdAt(t.getCreatedAt())
                    .isDisqualified(Boolean.TRUE.equals(t.getIsDisqualified()))
                    .disqualifiedAt(t.getDisqualifiedAt())
                    .disqualifiedReason(t.getDisqualifiedReason())
                    .build();
        }).collect(Collectors.toList());
    }

    // ── Submissions log ──────────────────────────────────────────────────────

    public List<CTFTeacherSubmissionDTO> listSubmissions(UUID competitionId, UUID userId, boolean isAdmin,
                                                          int limit) {
        competitionTeacher.loadOwned(competitionId, userId, isAdmin);

        // Read from ctf_submissions which stores every attempt (correct + incorrect + cheat).
        org.springframework.data.domain.Pageable page = limit > 0
                ? org.springframework.data.domain.PageRequest.of(0, limit)
                : org.springframework.data.domain.Pageable.unpaged();
        List<CTFSubmission> submissions = submissionRepo.findByCompetitionIdOrderBySubmittedAtDesc(competitionId, page);

        Map<UUID, CTFTeam> teamMap = teamRepo.findByCompetitionId(competitionId)
                .stream().collect(Collectors.toMap(CTFTeam::getId, t -> t));
        Map<UUID, CTFChallenge> chalMap = challengeRepo
                .findByCompetitionIdAndDeletedFalse(competitionId).stream()
                .collect(Collectors.toMap(CTFChallenge::getId, c -> c));
        Set<UUID> userIds = submissions.stream().map(CTFSubmission::getUserId)
                .filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, User> users = userRepo.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        // Correct solves also have a point value stored in the solve record.
        Map<String, Integer> solvePoints = solveRepo.findRecentByCompetition(competitionId).stream()
                .collect(Collectors.toMap(
                        s -> s.getTeamId() + ":" + s.getChallengeId(),
                        CTFCompetitionSolve::getPointsAwarded,
                        (a, b) -> a));

        return submissions.stream().map(s -> {
            CTFTeam team = teamMap.get(s.getTeamId());
            CTFChallenge chal = chalMap.get(s.getChallengeId());
            User u = s.getUserId() != null ? users.get(s.getUserId()) : null;
            int pts = Boolean.TRUE.equals(s.getIsCorrect())
                    ? solvePoints.getOrDefault(s.getTeamId() + ":" + s.getChallengeId(), 0)
                    : 0;
            return CTFTeacherSubmissionDTO.builder()
                    .id(s.getId())
                    .teamId(s.getTeamId())
                    .teamName(team != null ? team.getName() : "Unknown")
                    .avatarColor(team != null ? team.getAvatarColor() : "#94a3b8")
                    .challengeId(s.getChallengeId())
                    .challengeTitle(chal != null ? chal.getTitle() : "—")
                    .challengeCategory(chal != null && chal.getCategory() != null ? chal.getCategory().name() : null)
                    .solvedByUserId(s.getUserId())
                    .solvedByName(u != null ? u.getUsername() : "Unknown")
                    .pointsAwarded(pts)
                    .correct(Boolean.TRUE.equals(s.getIsCorrect()))
                    .cheatFlagged(Boolean.TRUE.equals(s.getIsCheatFlagged()))
                    .submittedValue(s.getSubmittedValue())
                    .at(s.getSubmittedAt())
                    .build();
        }).collect(Collectors.toList());
    }

    // ── Cheats ───────────────────────────────────────────────────────────────

    public List<CTFTeacherCheatDTO> listCheats(UUID competitionId, UUID userId, boolean isAdmin) {
        competitionTeacher.loadOwned(competitionId, userId, isAdmin);

        List<CTFCheatEvent> events = cheatRepo.findByCompetitionIdOrderByDetectedAtDesc(competitionId);
        if (events.isEmpty()) return List.of();

        Map<UUID, CTFTeam> teamMap = teamRepo.findByCompetitionId(competitionId)
                .stream().collect(Collectors.toMap(CTFTeam::getId, t -> t));
        Map<UUID, CTFChallenge> chalMap = challengeRepo
                .findByCompetitionIdAndDeletedFalse(competitionId).stream()
                .collect(Collectors.toMap(CTFChallenge::getId, c -> c));

        // Collect all user IDs to resolve in one query: submitters + dismissedBy
        Set<UUID> userIds = new HashSet<>();
        events.stream().map(CTFCheatEvent::getSubmittingUserId).filter(Objects::nonNull).forEach(userIds::add);
        events.stream().map(CTFCheatEvent::getDismissedBy).filter(Objects::nonNull).forEach(userIds::add);
        Map<UUID, User> userMap = userRepo.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        return events.stream().map(ev -> {
            CTFTeam submitting = teamMap.get(ev.getSubmittingTeam());
            CTFTeam source     = teamMap.get(ev.getSourceTeam());
            CTFChallenge chal  = chalMap.get(ev.getChallengeId());
            User submitter     = ev.getSubmittingUserId() != null ? userMap.get(ev.getSubmittingUserId()) : null;
            User dismisser     = ev.getDismissedBy()      != null ? userMap.get(ev.getDismissedBy())      : null;
            return CTFTeacherCheatDTO.builder()
                    .id(ev.getId())
                    .competitionId(ev.getCompetitionId())
                    .challengeId(ev.getChallengeId())
                    .challengeTitle(chal != null ? chal.getTitle() : "—")
                    .challengeCategory(chal != null && chal.getCategory() != null ? chal.getCategory().name() : null)
                    .submittingTeamId(ev.getSubmittingTeam())
                    .submittingTeamName(submitting != null ? submitting.getName() : "Unknown")
                    .submittingTeamAccentColor(submitting != null ? submitting.getAvatarColor() : null)
                    .submittingUserId(ev.getSubmittingUserId())
                    .submittingUserName(submitter != null ? submitter.getUsername() : null)
                    .submittingUserEmail(submitter != null ? submitter.getEmail() : null)
                    .sourceTeamId(ev.getSourceTeam())
                    .sourceTeamName(source != null ? source.getName() : "Unknown")
                    .sourceTeamAccentColor(source != null ? source.getAvatarColor() : null)
                    .submittedValue(ev.getSubmittedValue())
                    .detectedAt(ev.getDetectedAt())
                    .dismissed(Boolean.TRUE.equals(ev.getDismissed()))
                    .dismissedByUsername(dismisser != null
                            ? dismisser.getUsername() : null)
                    .submittingTeamDisqualified(submitting != null && Boolean.TRUE.equals(submitting.getIsDisqualified()))
                    .build();
        }).collect(Collectors.toList());
    }

    public byte[] exportCheatsCsv(UUID competitionId, UUID userId, boolean isAdmin) {
        List<CTFTeacherCheatDTO> cheats = listCheats(competitionId, userId, isAdmin);
        StringBuilder sb = new StringBuilder();
        sb.append("Detected At,Challenge,Category,Submitted By (User),Submitted By (Team),Flag Belonged To (Team),Submitted Value,Status\n");
        for (CTFTeacherCheatDTO c : cheats) {
            sb.append(c.getDetectedAt()).append(',')
              .append(escapeCsv(c.getChallengeTitle())).append(',')
              .append(c.getChallengeCategory() != null ? c.getChallengeCategory() : "").append(',')
              .append(escapeCsv(c.getSubmittingUserName() != null ? c.getSubmittingUserName() : "")).append(',')
              .append(escapeCsv(c.getSubmittingTeamName())).append(',')
              .append(escapeCsv(c.getSourceTeamName())).append(',')
              .append(escapeCsv(c.getSubmittedValue() != null ? c.getSubmittedValue() : "")).append(',')
              .append(c.isDismissed() ? "Dismissed" : "Active")
              .append('\n');
        }
        return sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    public String exportCheatsFilename(UUID competitionId, UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        String safe = comp.getTitle().toLowerCase().replaceAll("[^a-z0-9]+", "-");
        if (safe.length() > 40) safe = safe.substring(0, 40);
        String date = LocalDateTime.now().toLocalDate().toString();
        return "cheats-" + safe + "-" + date + ".csv";
    }

    @Transactional
    public CTFTeacherCheatDTO dismissCheat(UUID competitionId, UUID cheatId,
                                            UUID userId, boolean isAdmin) {
        competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        CTFCheatEvent ev = cheatRepo.findById(cheatId)
                .orElseThrow(() -> new EntityNotFoundException("Cheat event not found."));
        if (!competitionId.equals(ev.getCompetitionId())) {
            throw new EntityNotFoundException("Cheat event not part of this competition.");
        }
        ev.setDismissed(true);
        ev.setDismissedAt(LocalDateTime.now());
        ev.setDismissedBy(userId);
        cheatRepo.save(ev);

        // Build single-event response — reuse list mapper for consistency.
        return listCheats(competitionId, userId, isAdmin).stream()
                .filter(c -> c.getId().equals(cheatId))
                .findFirst()
                .orElseThrow();
    }

    @Transactional
    public CTFTeacherTeamDTO disqualifyTeam(UUID competitionId, UUID teamId, String reason,
                                             UUID userId, boolean isAdmin) {
        competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        CTFTeam team = teamRepo.findById(teamId)
                .orElseThrow(() -> new EntityNotFoundException("Team not found."));
        if (!competitionId.equals(team.getCompetitionId())) {
            throw new EntityNotFoundException("Team not part of this competition.");
        }
        team.setIsDisqualified(true);
        team.setDisqualifiedAt(LocalDateTime.now());
        team.setDisqualifiedReason(reason != null ? reason.trim() : "Disqualified by organizer");
        teamRepo.save(team);

        // Wipe the team's points by deleting their solves. The team row stays
        // so members still see the lobby with a DQ banner (handled in Prompt 3).
        solveRepo.findByCompetitionIdAndTeamId(competitionId, teamId).forEach(solveRepo::delete);

        // Notify the room so the scoreboard refreshes immediately.
        try {
            ws.convertAndSend("/topic/ctf/competitions/" + competitionId + "/scoreboard",
                    Map.of("event", "TEAM_DISQUALIFIED", "teamId", teamId));
            ws.convertAndSend("/topic/ctf/" + competitionId + "/control",
                    Map.of("type", "TEAM_DISQUALIFIED", "teamId", teamId, "teamName", team.getName()));
        } catch (Exception e) {
            log.warn("Failed to broadcast team disqualification: {}", e.getMessage());
        }

        // Push a private notification to the affected team's channel.
        notifications.sendToTeam(teamId,
                com.university.platform.ctf.entity.CTFNotification.Type.TEAM_DISQUALIFIED,
                "Your team has been disqualified",
                team.getDisqualifiedReason() != null
                        ? team.getDisqualifiedReason()
                        : "Contact the organizer for details.",
                Map.of("teamId", teamId.toString(),
                       "competitionId", competitionId.toString()));

        log.warn("[DISQUALIFIED] team={} competition={} by={} reason={}",
                teamId, competitionId, userId, reason);

        return listTeams(competitionId, userId, isAdmin).stream()
                .filter(t -> t.getId().equals(teamId))
                .findFirst()
                .orElseThrow();
    }

    // ── CSV export ───────────────────────────────────────────────────────────

    /**
     * Returns a CSV body bytes (Excel-compatible). Chosen over XLSX to avoid
     * pulling Apache POI as a dependency — Excel/Sheets open CSV cleanly.
     */
    public byte[] exportCsv(UUID competitionId, UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        List<CTFTeacherSubmissionDTO> subs = listSubmissions(competitionId, userId, isAdmin, 0);
        List<CTFTeacherTeamDTO> teams = listTeams(competitionId, userId, isAdmin);

        StringBuilder sb = new StringBuilder();
        // Section: scoreboard
        sb.append("# Competition: ").append(escapeCsv(comp.getTitle())).append("\n");
        sb.append("# Status: ").append(comp.computeStatus().name()).append("\n");
        sb.append("# Exported at: ").append(LocalDateTime.now()).append("\n\n");

        sb.append("rank,team,points,solves,members,disqualified,last_solve_at\n");
        // Sort by points desc as the scoreboard would
        List<CTFTeacherTeamDTO> sorted = new ArrayList<>(teams);
        sorted.sort(Comparator
                .comparingInt(CTFTeacherTeamDTO::getTotalPoints).reversed()
                .thenComparing(t -> t.getLastSolveAt() != null ? t.getLastSolveAt() : LocalDateTime.MAX));
        int rank = 1;
        for (CTFTeacherTeamDTO t : sorted) {
            sb.append(rank++).append(",")
              .append(escapeCsv(t.getName())).append(",")
              .append(t.getTotalPoints()).append(",")
              .append(t.getSolveCount()).append(",")
              .append(t.getMembers() != null ? t.getMembers().size() : 0).append(",")
              .append(t.isDisqualified() ? "yes" : "no").append(",")
              .append(t.getLastSolveAt() != null ? t.getLastSolveAt() : "")
              .append("\n");
        }

        sb.append("\n# Submissions log\n");
        sb.append("at,team,member,challenge,category,points,correct\n");
        for (CTFTeacherSubmissionDTO s : subs) {
            sb.append(s.getAt()).append(",")
              .append(escapeCsv(s.getTeamName())).append(",")
              .append(escapeCsv(s.getSolvedByName())).append(",")
              .append(escapeCsv(s.getChallengeTitle())).append(",")
              .append(s.getChallengeCategory() != null ? s.getChallengeCategory() : "").append(",")
              .append(s.getPointsAwarded()).append(",")
              .append(s.isCorrect() ? "yes" : "no")
              .append("\n");
        }

        return sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    public String exportFilename(UUID competitionId, UUID userId, boolean isAdmin) {
        CTFCompetition comp = competitionTeacher.loadOwned(competitionId, userId, isAdmin);
        String safe = comp.getTitle().toLowerCase().replaceAll("[^a-z0-9]+", "-");
        if (safe.length() > 60) safe = safe.substring(0, 60);
        return safe + "-ctf-export.csv";
    }

    private static String escapeCsv(String v) {
        if (v == null) return "";
        if (v.contains(",") || v.contains("\"") || v.contains("\n")) {
            return "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }
}
