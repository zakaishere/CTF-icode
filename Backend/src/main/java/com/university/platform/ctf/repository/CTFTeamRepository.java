package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFTeam;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CTFTeamRepository extends JpaRepository<CTFTeam, UUID> {

    List<CTFTeam> findByCompetitionId(UUID competitionId);

    int countByCompetitionId(UUID competitionId);

    Optional<CTFTeam> findByInviteCode(String inviteCode);

    boolean existsByInviteCode(String inviteCode);

    boolean existsByCompetitionIdAndName(UUID competitionId, String name);

    /**
     * CHANGE 4 (Section 16 Query 1): Scoreboard computed from ctf_awards with
     * freeze-time filter and ROW_NUMBER() tiebreaker.
     * Returns Object[]: [position, team_id, name, avatar_color, total_score, last_award_at]
     * Pass null for freezeTime to include all awards.
     */
    @Query(value = """
        WITH sumscores AS (
            SELECT
                team_id,
                SUM(value)       AS total_score,
                MAX(awarded_at)  AS last_award_at
            FROM ctf_awards
            WHERE competition_id = :competitionId
              AND (:freezeTime IS NULL OR awarded_at <= :freezeTime)
            GROUP BY team_id
        )
        SELECT
            ROW_NUMBER() OVER (
                ORDER BY COALESCE(s.total_score, 0) DESC,
                         COALESCE(s.last_award_at, '9999-12-31') ASC
            )                          AS position,
            t.id                       AS team_id,
            t.name,
            t.avatar_color,
            COALESCE(s.total_score, 0) AS total_score,
            s.last_award_at
        FROM ctf_teams t
        LEFT JOIN sumscores s ON t.id = s.team_id
        WHERE t.competition_id = :competitionId
        ORDER BY position
        """, nativeQuery = true)
    List<Object[]> findScoreboardFromAwards(
            @Param("competitionId") UUID competitionId,
            @Param("freezeTime") LocalDateTime freezeTime);
}
