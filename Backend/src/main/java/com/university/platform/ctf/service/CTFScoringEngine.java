package com.university.platform.ctf.service;

import com.university.platform.ctf.entity.CTFChallenge;
import com.university.platform.ctf.entity.CTFCompetition;
import com.university.platform.ctf.repository.CTFAwardRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Single source of truth for all CTF score computations.
 *
 * challengeValue(comp, challenge, totalSolveCount) is the canonical way to ask
 * "what is this challenge worth right now?"  All call sites — scoreboard, challenge
 * list, team profile, navbar — must call this and nothing else.
 *
 * Key invariant: the FIRST solve never lowers the displayed value.  Decay begins
 * when a SECOND team solves the challenge (effectiveSolves = max(0, n - 1)).
 * This is achieved by normalising the count to Math.max(1, n) before calling
 * CTFScoringService, which internally subtracts 1 to get n-1.
 */
@Service
public class CTFScoringEngine {

    private final CTFScoringService  scoringService;
    private final CTFAwardRepository awardRepo;

    public CTFScoringEngine(CTFScoringService scoringService, CTFAwardRepository awardRepo) {
        this.scoringService = scoringService;
        this.awardRepo      = awardRepo;
    }

    /**
     * Current point value of a challenge after {@code totalSolveCount} teams have
     * solved it.  Safe to call with 0 (returns initial value).
     */
    public int challengeValue(CTFCompetition comp, CTFChallenge challenge, int totalSolveCount) {
        CTFCompetition.ScoringFunction fn = comp.getScoringFunction();
        if (fn == null) fn = CTFCompetition.ScoringFunction.LOGARITHMIC;

        int initial = challenge.getInitialValue() != null
                ? challenge.getInitialValue() : challenge.getBasePoints();
        int minimum = challenge.getMinimumValue() != null
                ? challenge.getMinimumValue()
                : (comp.getDynamicMinPoints() != null ? comp.getDynamicMinPoints() : 50);
        int decay   = challenge.getDecayValue()   != null ? challenge.getDecayValue() : 10;

        // n=1 → CTFScoringService uses (n-1)=0 → returns initial.
        // n=2 → (n-1)=1 → decay starts.  This is the "2nd solve triggers decay" rule.
        int n = Math.max(1, totalSolveCount);

        return switch (fn) {
            case STATIC      -> initial;
            case LINEAR      -> scoringService.calculateLinear(initial, minimum, decay, n);
            case LOGARITHMIC -> scoringService.calculateLogarithmic(initial, minimum, decay, n);
        };
    }

    /**
     * Sum of hint costs paid by {@code teamId} in {@code competitionId}, up to {@code asOf}.
     * Returns a positive number (the penalty to subtract from the raw solve sum).
     * Pass {@code asOf = null} to include all hint unlocks (live / unfrozen view).
     *
     * teamScore(team, asOf) = sum(challengeValue(solved challenges))
     *                       - hintPenalty(team, asOf)
     *                       + bloodBonus(challengeById, challengeSolveOrder, team)
     */
    public int hintPenalty(UUID competitionId, UUID teamId, LocalDateTime asOf) {
        return -awardRepo.sumHintAwardsByTeamId(competitionId, teamId, asOf);
    }

    /**
     * Extra points awarded to {@code teamId} for being the 1st/2nd/3rd solver on
     * challenges that have {@code blood_bonus_enabled = true}.
     *
     * {@code challengeById}      — challengeId → CTFChallenge (all challenges in the competition)
     * {@code challengeSolveOrder} — challengeId → ordered list of teamIds that solved it
     *                               (ascending by solved_at, already capped at asOf by the caller)
     *
     * This method is pure Java — no DB queries — so the caller must pass pre-built
     * maps derived from the already-loaded solve list (respecting the freeze / asOf cutoff).
     */
    public int bloodBonus(Map<UUID, CTFChallenge> challengeById,
                          Map<UUID, List<UUID>>   challengeSolveOrder,
                          UUID                    teamId) {
        int bonus = 0;
        for (Map.Entry<UUID, CTFChallenge> e : challengeById.entrySet()) {
            CTFChallenge ch = e.getValue();
            if (!Boolean.TRUE.equals(ch.getBloodBonusEnabled())) continue;
            List<UUID> order = challengeSolveOrder.get(e.getKey());
            if (order == null) continue;
            int pos = order.indexOf(teamId) + 1; // 1-indexed; 0 means team didn't solve it
            if (pos == 1 && ch.getFirstBloodBonus()  != null) bonus += ch.getFirstBloodBonus();
            else if (pos == 2 && ch.getSecondBloodBonus() != null) bonus += ch.getSecondBloodBonus();
            else if (pos == 3 && ch.getThirdBloodBonus()  != null) bonus += ch.getThirdBloodBonus();
        }
        return bonus;
    }

    /**
     * Bulk: returns a challengeId → currentValue map.
     * {@code solveCounts} maps challengeId → number of teams that solved it.
     * Missing entries are treated as 0 solves (returns initial value for each).
     */
    public Map<UUID, Integer> challengeValues(CTFCompetition comp,
                                               List<CTFChallenge> challenges,
                                               Map<UUID, Integer> solveCounts) {
        Map<UUID, Integer> values = new HashMap<>(challenges.size());
        for (CTFChallenge ch : challenges) {
            values.put(ch.getId(), challengeValue(comp, ch, solveCounts.getOrDefault(ch.getId(), 0)));
        }
        return values;
    }
}
