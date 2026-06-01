package com.university.platform.ctf.service;

import com.university.platform.ctf.dto.*;
import com.university.platform.ctf.entity.*;
import com.university.platform.ctf.exception.*;
import com.university.platform.ctf.flag.CTFFlagGenerator;
import com.university.platform.ctf.repository.*;
import com.university.platform.ctf.util.InviteCodeGenerator;
import com.university.platform.identity.model.User;
import com.university.platform.identity.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class CTFTeamService {

    private static final String[] AVATAR_COLORS = {
        "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6",
        "#f59e0b", "#10b981", "#3b82f6", "#ef4444"
    };

    private final CTFCompetitionRepository      competitionRepo;
    private final CTFTeamRepository             teamRepo;
    private final CTFTeamMemberRepository       memberRepo;
    private final CTFTeamFlagRepository         flagRepo;
    private final CTFChallengeRepository        challengeRepo;
    private final UserRepository                userRepo;
    private final CTFFlagGenerator              flagGenerator;
    private final CTFAwardRepository            awardRepo;
    private final CTFCompetitionSolveRepository solveRepo;
    private final CTFScoringEngine              scoringEngine;
    private final CTFTeamScoreService           teamScoreService;

    public CTFTeamService(CTFCompetitionRepository competitionRepo,
                          CTFTeamRepository teamRepo,
                          CTFTeamMemberRepository memberRepo,
                          CTFTeamFlagRepository flagRepo,
                          CTFChallengeRepository challengeRepo,
                          UserRepository userRepo,
                          CTFFlagGenerator flagGenerator,
                          CTFAwardRepository awardRepo,
                          CTFCompetitionSolveRepository solveRepo,
                          CTFScoringEngine scoringEngine,
                          CTFTeamScoreService teamScoreService) {
        this.competitionRepo  = competitionRepo;
        this.teamRepo         = teamRepo;
        this.memberRepo       = memberRepo;
        this.flagRepo         = flagRepo;
        this.challengeRepo    = challengeRepo;
        this.userRepo         = userRepo;
        this.flagGenerator    = flagGenerator;
        this.awardRepo        = awardRepo;
        this.solveRepo        = solveRepo;
        this.scoringEngine    = scoringEngine;
        this.teamScoreService = teamScoreService;
    }

    // ── Create team ────────────────────────────────────────────────────────────

    public CTFTeamResponse createTeam(UUID competitionId, UUID userId, CTFCreateTeamRequest req) {
        CTFCompetition comp = requireCompetition(competitionId);
        guardRegistration(comp, "create a team");
        ensureNotInTeam(competitionId, userId);

        String color = (req.getAvatarColor() != null && req.getAvatarColor().matches("#[0-9a-fA-F]{6}"))
                ? req.getAvatarColor()
                : AVATAR_COLORS[new Random().nextInt(AVATAR_COLORS.length)];

        String inviteCode = generateUniqueInviteCode();

        CTFTeam team = CTFTeam.builder()
                .competitionId(competitionId)
                .name(req.getName())
                .inviteCode(inviteCode)
                .avatarColor(color)
                .captainId(userId)
                .build();
        team = teamRepo.save(team);

        CTFTeamMember captainMember = CTFTeamMember.builder()
                .id(new CTFTeamMemberId(team.getId(), userId))
                .role(CTFTeamMember.Role.CAPTAIN)
                .build();
        memberRepo.save(captainMember);

        preGenerateFlags(comp, team);

        return buildTeamResponse(team, List.of(captainMember));
    }

    // ── Join team ──────────────────────────────────────────────────────────────

    public CTFTeamResponse joinTeam(UUID competitionId, UUID userId, CTFJoinTeamRequest req) {
        CTFCompetition comp = requireCompetition(competitionId);
        guardRegistration(comp, "join a team");
        ensureNotInTeam(competitionId, userId);

        CTFTeam team = teamRepo.findByInviteCode(req.getInviteCode())
                .filter(t -> t.getCompetitionId().equals(competitionId))
                .orElseThrow(() -> new EntityNotFoundException("Invalid invite code."));

        int currentSize = memberRepo.countByIdTeamId(team.getId());
        if (currentSize >= comp.getMaxTeamSize()) {
            throw new CTFTeamFullException();
        }

        CTFTeamMember member = CTFTeamMember.builder()
                .id(new CTFTeamMemberId(team.getId(), userId))
                .role(CTFTeamMember.Role.MEMBER)
                .build();
        memberRepo.save(member);

        List<CTFTeamMember> members = memberRepo.findByIdTeamId(team.getId());
        return buildTeamResponse(team, members);
    }

    // ── Leave team ─────────────────────────────────────────────────────────────

    public void leaveTeam(UUID competitionId, UUID userId) {
        CTFCompetition comp = requireCompetition(competitionId);
        CTFCompetition.Status st = comp.computeStatus();
        if (st != CTFCompetition.Status.UPCOMING) {
            throw new CTFCompetitionStartedException("Cannot leave a team after the competition has started.");
        }

        CTFTeamMember membership = memberRepo.findByCompetitionIdAndUserId(competitionId, userId)
                .orElseThrow(() -> new EntityNotFoundException("You are not in a team for this competition."));

        UUID teamId = membership.getId().getTeamId();

        if (membership.getRole() == CTFTeamMember.Role.CAPTAIN) {
            List<CTFTeamMember> remaining = memberRepo.findByIdTeamId(teamId).stream()
                    .filter(m -> !m.getId().getUserId().equals(userId))
                    .toList();
            if (!remaining.isEmpty()) {
                throw new IllegalStateException("Transfer captaincy before leaving, or remove all members first.");
            }
            // Last member — delete team and its flags
            flagRepo.deleteByTeamId(teamId);
            teamRepo.deleteById(teamId);
            return;
        }

        memberRepo.deleteByIdTeamIdAndIdUserId(teamId, userId);
    }

    // ── Transfer captaincy ──────────────────────────────────────────────────────

    public CTFTeamResponse transferCaptaincy(UUID competitionId, UUID captainId,
                                              CTFTransferCaptaincyRequest req) {
        CTFTeamMember captainMembership = memberRepo.findByCompetitionIdAndUserId(competitionId, captainId)
                .orElseThrow(() -> new EntityNotFoundException("You are not in a team for this competition."));

        if (captainMembership.getRole() != CTFTeamMember.Role.CAPTAIN) {
            throw new CTFNotCaptainException();
        }

        UUID teamId = captainMembership.getId().getTeamId();

        CTFTeamMemberId newCaptainId = new CTFTeamMemberId(teamId, req.getNewCaptainId());
        CTFTeamMember newCaptain = memberRepo.findById(newCaptainId)
                .orElseThrow(() -> new EntityNotFoundException("New captain is not in your team."));

        captainMembership.setRole(CTFTeamMember.Role.MEMBER);
        newCaptain.setRole(CTFTeamMember.Role.CAPTAIN);
        memberRepo.save(captainMembership);
        memberRepo.save(newCaptain);

        CTFTeam team = teamRepo.findById(teamId).orElseThrow();
        team.setCaptainId(req.getNewCaptainId());
        teamRepo.save(team);

        List<CTFTeamMember> members = memberRepo.findByIdTeamId(teamId);
        return buildTeamResponse(team, members);
    }

    // ── Kick member ────────────────────────────────────────────────────────────

    public void kickMember(UUID competitionId, UUID captainId, UUID targetUserId) {
        CTFCompetition comp = requireCompetition(competitionId);
        if (comp.computeStatus() != CTFCompetition.Status.UPCOMING) {
            throw new CTFCompetitionStartedException("Cannot kick members after the competition has started.");
        }

        CTFTeamMember captainMembership = memberRepo.findByCompetitionIdAndUserId(competitionId, captainId)
                .orElseThrow(() -> new EntityNotFoundException("You are not in a team for this competition."));

        if (captainMembership.getRole() != CTFTeamMember.Role.CAPTAIN) {
            throw new CTFNotCaptainException();
        }
        if (captainId.equals(targetUserId)) {
            throw new IllegalArgumentException("You cannot kick yourself. Use leave instead.");
        }

        UUID teamId = captainMembership.getId().getTeamId();

        if (!memberRepo.existsByIdTeamIdAndIdUserId(teamId, targetUserId)) {
            throw new EntityNotFoundException("User is not in your team.");
        }

        memberRepo.deleteByIdTeamIdAndIdUserId(teamId, targetUserId);
    }

    // ── Queries ────────────────────────────────────────────────────────────────

    public CTFTeamResponse getMyTeam(UUID competitionId, UUID userId) {
        Optional<CTFTeamMember> membership = memberRepo.findByCompetitionIdAndUserId(competitionId, userId);
        if (membership.isEmpty()) return null;

        UUID teamId = membership.get().getId().getTeamId();
        CTFTeam team = teamRepo.findById(teamId).orElseThrow();
        List<CTFTeamMember> members = memberRepo.findByIdTeamId(teamId);
        return buildTeamResponse(team, members);
    }

    public List<CTFTeamResponse> getCompetitionTeams(UUID competitionId) {
        requireCompetition(competitionId);
        return teamRepo.findByCompetitionId(competitionId).stream()
                .map(team -> {
                    List<CTFTeamMember> members = memberRepo.findByIdTeamId(team.getId());
                    return buildTeamResponse(team, members);
                })
                .collect(Collectors.toList());
    }

    // ── Internal helpers ───────────────────────────────────────────────────────

    private CTFCompetition requireCompetition(UUID id) {
        return competitionRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Competition not found."));
    }

    /**
     * Throws if the competition is no longer open for new team registrations.
     *
     * If {@code registrationOpen=true} teams may join any time up to ENDED.
     * Otherwise the competition locks at start (original behaviour).
     */
    private void guardRegistration(CTFCompetition comp, String action) {
        CTFCompetition.Status st = comp.computeStatus();
        if (st == CTFCompetition.Status.ENDED) {
            throw new CTFCompetitionStartedException("Competition has ended.");
        }
        if (!Boolean.TRUE.equals(comp.getRegistrationOpen())
                && st != CTFCompetition.Status.UPCOMING) {
            throw new CTFCompetitionStartedException("Cannot " + action + " after the competition has started.");
        }
    }

    private void ensureNotInTeam(UUID competitionId, UUID userId) {
        memberRepo.findByCompetitionIdAndUserId(competitionId, userId).ifPresent(m -> {
            throw new CTFAlreadyInTeamException();
        });
    }

    private String generateUniqueInviteCode() {
        String code;
        int attempts = 0;
        do {
            code = InviteCodeGenerator.generate();
            if (++attempts > 50) throw new IllegalStateException("Could not generate unique invite code.");
        } while (teamRepo.existsByInviteCode(code));
        return code;
    }

    private void preGenerateFlags(CTFCompetition comp, CTFTeam team) {
        List<CTFChallenge> challenges = challengeRepo
                .findByCompetitionIdAndIsActiveTrueAndDeletedFalse(comp.getId());

        for (CTFChallenge challenge : challenges) {
            // STATIC challenges share one flag for all teams — no per-team row needed.
            if (challenge.getFlagType() != CTFChallenge.FlagType.DYNAMIC) continue;
            String flagHash = computeTeamFlagHash(comp.getId(), challenge.getId(), team.getId());
            CTFTeamFlag flag = CTFTeamFlag.builder()
                    .competitionId(comp.getId())
                    .challengeId(challenge.getId())
                    .teamId(team.getId())
                    .flagHash(flagHash)
                    .build();
            flagRepo.save(flag);
        }
    }

    /**
     * SHA-256 of the team's plaintext flag. The plaintext is derived from the
     * challenge's flag format via {@link CTFFlagGenerator}, so it stays identical
     * to the value injected into the container by CTFInstanceService.
     */
    public String computeTeamFlagHash(UUID competitionId, UUID challengeId, UUID teamId) {
        String flagFormat = challengeRepo.findById(challengeId)
                .map(CTFChallenge::getFlagFormat)
                .orElse(null);
        return flagGenerator.hash(flagFormat, competitionId, challengeId, teamId);
    }

    // ── Team profile (public) ──────────────────────────────────────────────────

    public CTFTeamProfileDTO getTeamProfile(UUID competitionId, UUID teamId) {
        CTFCompetition comp = requireCompetition(competitionId);
        CTFTeam team = teamRepo.findById(teamId)
                .orElseThrow(() -> new EntityNotFoundException("Team not found"));

        // Canonical team totals. Mirror the scoreboard's freeze policy so the
        // profile page shows the same number as the scoreboard during a freeze.
        LocalDateTime freezeAt = teamScoreService.currentFreezeAt(comp);
        Map<UUID, CTFTeamScoreService.TeamTotals> totals =
                teamScoreService.teamTotals(competitionId, freezeAt);
        CTFTeamScoreService.TeamTotals self =
                totals.getOrDefault(teamId, CTFTeamScoreService.TeamTotals.ZERO);

        // Rank: 1 + number of teams with strictly higher total
        int rank = 1;
        for (Map.Entry<UUID, CTFTeamScoreService.TeamTotals> e : totals.entrySet()) {
            if (e.getKey().equals(teamId)) continue;
            if (e.getValue().totalPoints() > self.totalPoints()) rank++;
        }

        // Per-challenge current values are still needed for member breakdown +
        // solve history (those show points attributed to each solve, not the
        // team total). Load solves freeze-aware as well so the history truncates
        // consistently when frozen.
        List<CTFCompetitionSolve> allSolves = (freezeAt != null)
                ? solveRepo.findByCompetitionIdAndSolvedAtLessThanEqualOrderBySolvedAtAsc(competitionId, freezeAt)
                : solveRepo.findByCompetitionIdOrderBySolvedAtAsc(competitionId);
        Map<UUID, Integer> challengeSolveCounts = new HashMap<>();
        for (CTFCompetitionSolve s : allSolves) {
            challengeSolveCounts.merge(s.getChallengeId(), 1, Integer::sum);
        }
        List<CTFChallenge> challenges = challengeRepo.findByCompetitionIdAndDeletedFalse(competitionId);
        Map<UUID, CTFChallenge> challengeMap = challenges.stream()
                .collect(Collectors.toMap(CTFChallenge::getId, c -> c));
        Map<UUID, Integer> challengeCurrentValue =
                scoringEngine.challengeValues(comp, challenges, challengeSolveCounts);

        // Members
        List<CTFTeamMember> members = memberRepo.findByIdTeamId(teamId);
        Set<UUID> userIds = members.stream().map(m -> m.getId().getUserId()).collect(Collectors.toSet());
        Map<UUID, User> userMap = userRepo.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        List<CTFCompetitionSolve> teamSolves = allSolves.stream()
                .filter(s -> s.getTeamId().equals(teamId))
                .collect(Collectors.toList());

        List<CTFTeamMemberDTO> memberDTOs = members.stream().map(m -> {
            UUID memberId = m.getId().getUserId();
            User u = userMap.get(memberId);
            String name = u != null ? u.getFirstName() + " " + u.getLastName() : "Unknown";
            int memberSolves = (int) teamSolves.stream()
                    .filter(s -> s.getSolvedBy().equals(memberId)).count();
            int memberPoints = teamSolves.stream()
                    .filter(s -> s.getSolvedBy().equals(memberId))
                    .mapToInt(s -> challengeCurrentValue.getOrDefault(s.getChallengeId(), 0))
                    .sum();
            return CTFTeamMemberDTO.builder()
                    .userId(memberId)
                    .displayName(name)
                    .role(m.getRole().name())
                    .joinedAt(m.getJoinedAt())
                    .solveCount(memberSolves)
                    .pointsContributed(memberPoints)
                    .build();
        }).collect(Collectors.toList());

        // Solve history
        List<CTFTeamSolveEntryDTO> solveEntries = teamSolves.stream()
                .sorted(Comparator.comparing(CTFCompetitionSolve::getSolvedAt))
                .map(s -> {
                    CTFChallenge ch = challengeMap.get(s.getChallengeId());
                    if (ch == null) return null;
                    return CTFTeamSolveEntryDTO.builder()
                            .challengeId(s.getChallengeId())
                            .challengeTitle(ch.getTitle())
                            .category(ch.getCategory().name())
                            .currentPoints(challengeCurrentValue.getOrDefault(s.getChallengeId(), 0))
                            .solvedAt(s.getSolvedAt())
                            .build();
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toList());

        return CTFTeamProfileDTO.builder()
                .id(teamId)
                .competitionId(competitionId)
                .name(team.getName())
                .avatarColor(team.getAvatarColor())
                .captainId(team.getCaptainId())
                .rank(rank)
                .totalPoints(self.totalPoints())
                .solveCount(self.solveCount())
                .members(memberDTOs)
                .solves(solveEntries)
                .build();
    }

    private CTFTeamResponse buildTeamResponse(CTFTeam team, List<CTFTeamMember> members) {
        UUID compId = team.getCompetitionId();
        UUID teamId = team.getId();

        Set<UUID> userIds = members.stream()
                .map(m -> m.getId().getUserId())
                .collect(Collectors.toSet());

        Map<UUID, User> userMap = userRepo.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        List<CTFTeamMemberDTO> memberDTOs = members.stream().map(m -> {
            UUID memberId = m.getId().getUserId();
            User u = userMap.get(memberId);
            String name = u != null ? u.getFirstName() + " " + u.getLastName() : "Unknown";
            int memberSolves = solveRepo.countByCompetitionIdAndTeamIdAndSolvedBy(compId, teamId, memberId);
            int memberPoints = solveRepo.sumPointsAwardedByMember(compId, teamId, memberId);
            return CTFTeamMemberDTO.builder()
                    .userId(memberId)
                    .displayName(name)
                    .role(m.getRole().name())
                    .joinedAt(m.getJoinedAt())
                    .solveCount(memberSolves)
                    .pointsContributed(memberPoints)
                    .build();
        }).collect(Collectors.toList());

        // Score via the single source of truth. Freeze-aware so the navbar
        // matches the scoreboard during a freeze instead of leaking live deltas.
        CTFCompetition comp = competitionRepo.findById(compId).orElseThrow();
        LocalDateTime freezeAt = teamScoreService.currentFreezeAt(comp);
        CTFTeamScoreService.TeamTotals t = teamScoreService.teamTotal(compId, teamId, freezeAt);

        return CTFTeamResponse.builder()
                .id(teamId)
                .competitionId(compId)
                .name(team.getName())
                .inviteCode(team.getInviteCode())
                .avatarColor(team.getAvatarColor())
                .captainId(team.getCaptainId())
                .members(memberDTOs)
                .totalPoints(t.totalPoints())
                .solveCount(t.solveCount())
                .build();
    }
}
