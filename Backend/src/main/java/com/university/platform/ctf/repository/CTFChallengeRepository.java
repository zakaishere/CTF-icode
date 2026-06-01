package com.university.platform.ctf.repository;

import com.university.platform.ctf.entity.CTFChallenge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CTFChallengeRepository extends JpaRepository<CTFChallenge, UUID> {

    // ── Student-facing (active + not deleted) ────────────────────────────────

    List<CTFChallenge> findByIsActiveTrueAndDeletedFalse();

    List<CTFChallenge> findByCategoryAndIsActiveTrueAndDeletedFalse(CTFChallenge.CTFCategory category);

    List<CTFChallenge> findByDifficultyAndIsActiveTrueAndDeletedFalse(CTFChallenge.CTFDifficulty difficulty);

    List<CTFChallenge> findByCategoryAndDifficultyAndIsActiveTrueAndDeletedFalse(
            CTFChallenge.CTFCategory category, CTFChallenge.CTFDifficulty difficulty);

    Optional<CTFChallenge> findByIdAndDeletedFalse(UUID id);

    // ── Teacher-facing (own challenges, not deleted) ─────────────────────────

    List<CTFChallenge> findByAuthorIdAndDeletedFalseOrderByCreatedAtDesc(UUID authorId);

    List<CTFChallenge> findByAuthorIdAndDeletedFalseAndCategoryOrderByCreatedAtDesc(
            UUID authorId, CTFChallenge.CTFCategory category);

    List<CTFChallenge> findByAuthorIdAndDeletedFalseAndDifficultyOrderByCreatedAtDesc(
            UUID authorId, CTFChallenge.CTFDifficulty difficulty);

    List<CTFChallenge> findByAuthorIdAndDeletedFalseAndIsActiveOrderByCreatedAtDesc(
            UUID authorId, Boolean isActive);

    Optional<CTFChallenge> findByIdAndAuthorIdAndDeletedFalse(UUID id, UUID authorId);

    // ── Competition-facing ───────────────────────────────────────────────────

    List<CTFChallenge> findByCompetitionIdAndIsActiveTrueAndDeletedFalse(UUID competitionId);

    /** Visible challenges only — hides any challenge marked is_hidden=true. */
    List<CTFChallenge> findByCompetitionIdAndIsActiveTrueAndDeletedFalseAndIsHiddenFalse(UUID competitionId);

    /** All non-deleted challenges in a competition, regardless of active/hidden — for the ENDED view. */
    List<CTFChallenge> findByCompetitionIdAndDeletedFalse(UUID competitionId);

    // ── Image pre-warming ────────────────────────────────────────────────────

    @Query("SELECT DISTINCT c.dockerImage FROM CTFChallenge c " +
           "WHERE c.requiresInstance = true AND c.isActive = true AND c.deleted = false " +
           "AND c.dockerImage IS NOT NULL")
    List<String> findDistinctDockerImages();

    // ── Library ──────────────────────────────────────────────────────────────

    List<CTFChallenge> findByLibraryOwnerIdAndIsLibraryTrueAndDeletedFalseOrderByCreatedAtDesc(UUID libraryOwnerId);

    int countByLibrarySourceIdAndDeletedFalse(UUID librarySourceId);

    // ── Admin-facing (all, not deleted) ─────────────────────────────────────

    List<CTFChallenge> findByIsActiveTrue();

    List<CTFChallenge> findByCategoryAndIsActiveTrue(CTFChallenge.CTFCategory category);

    List<CTFChallenge> findByDifficultyAndIsActiveTrue(CTFChallenge.CTFDifficulty difficulty);

    List<CTFChallenge> findByCategoryAndDifficultyAndIsActiveTrue(
            CTFChallenge.CTFCategory category, CTFChallenge.CTFDifficulty difficulty);

    /**
     * CHANGE 5 (Section 16 Query 2): First blood per challenge with freeze support.
     * DISTINCT ON (challenge_id) + ORDER BY challenge_id, solved_at ASC returns the
     * earliest solve per challenge.
     * Returns Object[]: [challenge_id, challenge_title, team_id, team_name, solved_at]
     */
    @Query(value = """
        SELECT DISTINCT ON (s.challenge_id)
            s.challenge_id,
            c.title          AS challenge_title,
            s.team_id,
            t.name           AS team_name,
            s.solved_at
        FROM ctf_competition_solves s
        JOIN ctf_challenges c  ON s.challenge_id = c.id
        JOIN ctf_teams      t  ON s.team_id       = t.id
        WHERE s.competition_id = :competitionId
          AND (:freezeTime IS NULL OR s.solved_at <= :freezeTime)
        ORDER BY s.challenge_id, s.solved_at ASC
        """, nativeQuery = true)
    List<Object[]> findFirstBloodPerChallenge(
            @Param("competitionId") UUID competitionId,
            @Param("freezeTime") LocalDateTime freezeTime);
}
