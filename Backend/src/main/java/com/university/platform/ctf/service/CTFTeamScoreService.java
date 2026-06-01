package com.university.platform.ctf.service;

import com.university.platform.ctf.entity.CTFAward;
import com.university.platform.ctf.entity.CTFChallenge;
import com.university.platform.ctf.entity.CTFCompetition;
import com.university.platform.ctf.entity.CTFCompetitionSolve;
import com.university.platform.ctf.repository.CTFAwardRepository;
import com.university.platform.ctf.repository.CTFChallengeRepository;
import com.university.platform.ctf.repository.CTFCompetitionRepository;
import com.university.platform.ctf.repository.CTFCompetitionSolveRepository;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The ONE place that decides what a team's score is.
 *
 * Every UI that shows a team total — the scoreboard, the navbar, the team
 * profile page, the admin/teacher panel — must read it from here. If you find
 * yourself summing solves or awards anywhere else in the codebase, you're
 * about to drift away from the scoreboard and create the kind of split-brain
 * bug this service exists to prevent.
 *
 * The formula:
 *   total = sum(currentValue[c] for c in solved-by-team)   // dynamic decay
 *         + sum(hintAward.value for team)                  // already negative
 *         + bloodBonus(team)                               // 1st/2nd/3rd-solve bonus
 *
 * Freeze-aware: passing a non-null {@code freezeAt} gives the score as it
 * stood at that timestamp — solves after it are ignored, hint awards after
 * it don't count. Pass null for the live (admin) view.
 */
@Service
public class CTFTeamScoreService {

    private final CTFCompetitionRepository      competitionRepo;
    private final CTFChallengeRepository        challengeRepo;
    private final CTFCompetitionSolveRepository solveRepo;
    private final CTFAwardRepository            awardRepo;
    private final CTFScoringEngine              scoringEngine;

    public CTFTeamScoreService(CTFCompetitionRepository competitionRepo,
                                CTFChallengeRepository challengeRepo,
                                CTFCompetitionSolveRepository solveRepo,
                                CTFAwardRepository awardRepo,
                                CTFScoringEngine scoringEngine) {
        this.competitionRepo = competitionRepo;
        this.challengeRepo   = challengeRepo;
        this.solveRepo       = solveRepo;
        this.awardRepo       = awardRepo;
        this.scoringEngine   = scoringEngine;
    }

    /**
     * Per-team totals for the competition. Teams with no solves AND no hint
     * awards do not appear in the map — callers iterating over a team list
     * should use {@link TeamTotals#ZERO} as the default.
     */
    public Map<UUID, TeamTotals> teamTotals(UUID competitionId, LocalDateTime freezeAt) {
        CTFCompetition comp = competitionRepo.findById(competitionId)
                .orElseThrow(() -> new EntityNotFoundException("Competition not found."));

        // 1. Solves (capped at freezeAt when supplied) — ordered ASC so insertion
        //    order in the solve-order map equals 1st/2nd/3rd solve position.
        List<CTFCompetitionSolve> solves = (freezeAt != null)
                ? solveRepo.findByCompetitionIdAndSolvedAtLessThanEqualOrderBySolvedAtAsc(competitionId, freezeAt)
                : solveRepo.findByCompetitionIdOrderBySolvedAtAsc(competitionId);

        Map<UUID, Integer>       challengeSolveCounts = new HashMap<>();
        Map<UUID, Set<UUID>>     teamSolvedChallenges = new HashMap<>();
        Map<UUID, LocalDateTime> teamLastSolveAt      = new HashMap<>();
        Map<UUID, List<UUID>>    challengeSolveOrder  = new LinkedHashMap<>();

        for (CTFCompetitionSolve s : solves) {
            challengeSolveCounts.merge(s.getChallengeId(), 1, Integer::sum);
            teamSolvedChallenges.computeIfAbsent(s.getTeamId(), k -> new HashSet<>())
                    .add(s.getChallengeId());
            teamLastSolveAt.merge(s.getTeamId(), s.getSolvedAt(),
                    (a, b) -> a.isAfter(b) ? a : b);
            challengeSolveOrder.computeIfAbsent(s.getChallengeId(), k -> new ArrayList<>())
                    .add(s.getTeamId());
        }

        // 2. Current per-challenge value (decay applied) via the engine.
        List<CTFChallenge> challenges = challengeRepo.findByCompetitionIdAndDeletedFalse(competitionId);
        Map<UUID, Integer> challengeCurrentValue =
                scoringEngine.challengeValues(comp, challenges, challengeSolveCounts);
        Map<UUID, CTFChallenge> challengeById = challenges.stream()
                .collect(Collectors.toMap(CTFChallenge::getId, c -> c));

        // 3. Hint deductions (already-negative values), capped at freezeAt.
        List<CTFAward> hintAwards = (freezeAt != null)
                ? awardRepo.findByCompetitionIdAndAwardedAtLessThanEqualAndReasonStartingWith(
                        competitionId, freezeAt, "hint:")
                : awardRepo.findByCompetitionIdAndReasonStartingWith(competitionId, "hint:");
        Map<UUID, Integer> hintPenaltyByTeam = new HashMap<>();
        for (CTFAward a : hintAwards) {
            hintPenaltyByTeam.merge(a.getTeamId(), a.getValue(), Integer::sum);
        }

        // 4. Walk every team that has a solve OR a hint award and build totals.
        Set<UUID> teamIds = new HashSet<>(teamSolvedChallenges.keySet());
        teamIds.addAll(hintPenaltyByTeam.keySet());

        Map<UUID, TeamTotals> result = new HashMap<>(teamIds.size());
        for (UUID teamId : teamIds) {
            Set<UUID> solved = teamSolvedChallenges.getOrDefault(teamId, Set.of());
            int solveSubtotal = solved.stream()
                    .mapToInt(cid -> challengeCurrentValue.getOrDefault(cid, 0))
                    .sum();
            int hintPenalty = hintPenaltyByTeam.getOrDefault(teamId, 0);
            int bloodBonus  = scoringEngine.bloodBonus(challengeById, challengeSolveOrder, teamId);
            int total       = solveSubtotal + hintPenalty + bloodBonus;
            result.put(teamId, new TeamTotals(
                    total, solveSubtotal, hintPenalty, bloodBonus,
                    solved.size(), teamLastSolveAt.get(teamId)));
        }
        return result;
    }

    /**
     * Convenience for callers that only need one team's total (navbar, profile).
     * Returns {@link TeamTotals#ZERO} when the team has no solves and no hints.
     */
    public TeamTotals teamTotal(UUID competitionId, UUID teamId, LocalDateTime freezeAt) {
        return teamTotals(competitionId, freezeAt).getOrDefault(teamId, TeamTotals.ZERO);
    }

    /**
     * Returns the {@code freezeAt} timestamp the scoreboard would use for this
     * competition right now — non-null only when the comp is in FROZEN state.
     * Use this when a non-scoreboard view (navbar, profile) wants to stay in
     * sync with the scoreboard during a freeze.
     */
    public LocalDateTime currentFreezeAt(CTFCompetition comp) {
        return (comp.computeStatus() == CTFCompetition.Status.FROZEN && comp.getFrozenAt() != null)
                ? comp.getFrozenAt() : null;
    }

    /** Canonical breakdown of a team's score at a point in time. */
    public record TeamTotals(int totalPoints,
                              int solveSubtotal,
                              int hintPenalty,
                              int bloodBonus,
                              int solveCount,
                              LocalDateTime lastSolveAt) {
        public static final TeamTotals ZERO = new TeamTotals(0, 0, 0, 0, 0, null);
    }
}
