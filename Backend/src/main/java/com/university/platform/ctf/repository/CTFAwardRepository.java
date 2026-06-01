package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFAward;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface CTFAwardRepository extends JpaRepository<CTFAward, UUID> {

    List<CTFAward> findByCompetitionId(UUID competitionId);

    List<CTFAward> findByCompetitionIdAndAwardedAtLessThanEqual(
            UUID competitionId, LocalDateTime cutoff);

    /** Returns all awards for a competition that match the given reason string (e.g. "solve:<challengeId>"). */
    List<CTFAward> findByCompetitionIdAndReason(UUID competitionId, String reason);

    List<CTFAward> findByCompetitionIdAndReasonStartingWith(UUID competitionId, String reasonPrefix);

    List<CTFAward> findByCompetitionIdAndAwardedAtLessThanEqualAndReasonStartingWith(
            UUID competitionId, LocalDateTime cutoff, String reasonPrefix);

    @Query("SELECT COALESCE(SUM(a.value), 0) FROM CTFAward a WHERE a.competitionId = :compId AND a.teamId = :teamId")
    int sumValueByCompetitionIdAndTeamId(@Param("compId") UUID compId, @Param("teamId") UUID teamId);

    /**
     * Sum of hint-deduction award values for one team (returns a negative number).
     * Pass {@code asOf = null} to include all hint unlocks (unfreeze view).
     * Negate the result to get the positive penalty amount used in teamScore.
     */
    @Query(value = """
        SELECT COALESCE(SUM(value), 0)
        FROM ctf_awards
        WHERE competition_id = :compId
          AND team_id        = :teamId
          AND reason         LIKE 'hint:%'
          AND (CAST(:asOf AS timestamp) IS NULL OR awarded_at <= CAST(:asOf AS timestamp))
        """, nativeQuery = true)
    int sumHintAwardsByTeamId(
            @Param("compId")  UUID compId,
            @Param("teamId")  UUID teamId,
            @Param("asOf")    LocalDateTime asOf);

    /**
     * CHANGE 6 (Section 16 Query 6): Cumulative score timeline for the top N
     * teams by total score, ordered for chart rendering.
     * Uses window function SUM(...) OVER (PARTITION BY team_id ORDER BY awarded_at).
     */
    @Query(value = """
        WITH top_teams AS (
            SELECT team_id
            FROM ctf_awards
            WHERE competition_id = :competitionId
            GROUP BY team_id
            ORDER BY SUM(value) DESC
            LIMIT :topN
        ),
        events AS (
            SELECT
                a.team_id,
                a.awarded_at,
                a.value AS points_delta,
                SUM(a.value) OVER (
                    PARTITION BY a.team_id
                    ORDER BY a.awarded_at, a.id
                ) AS cumulative_score
            FROM ctf_awards a
            WHERE a.competition_id = :competitionId
              AND a.team_id IN (SELECT team_id FROM top_teams)
              AND (CAST(:freezeTime AS timestamp) IS NULL OR a.awarded_at <= CAST(:freezeTime AS timestamp))
        )
        SELECT e.team_id, e.awarded_at, e.cumulative_score
        FROM events e
        ORDER BY e.team_id, e.awarded_at
        """, nativeQuery = true)
    List<Object[]> findCumulativeScoreTimeline(
            @Param("competitionId") UUID competitionId,
            @Param("topN") int topN,
            @Param("freezeTime") LocalDateTime freezeTime);
}
