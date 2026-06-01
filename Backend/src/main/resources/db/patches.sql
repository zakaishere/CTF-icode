-- =============================================================================
--  icode-ctf: patches.sql
--  Apply to existing databases that were created from an earlier schema.sql.
--  Fresh installs: these are already included in schema.sql — skip this file.
--
--  Run once on your production DB:
--    psql -U <user> -d <db> -c "SET search_path TO icode_ctf;" -f patches.sql
-- =============================================================================

SET search_path TO icode_ctf;

-- ── PATCH 1: Double-solve race condition fix ──────────────────────────────────
-- Prevents two team members from both receiving credit for the same challenge
-- if they submit the correct flag within the same database transaction window.
-- The DataIntegrityViolationException is caught in CTFCompetitionService.submitFlag().
ALTER TABLE ctf_competition_solves
    DROP CONSTRAINT IF EXISTS uq_comp_solve;

ALTER TABLE ctf_competition_solves
    ADD CONSTRAINT uq_comp_solve
    UNIQUE (competition_id, challenge_id, team_id);

-- ── PATCH 2: Missing performance indexes ─────────────────────────────────────

-- Instance cleanup scheduler: finds all RUNNING instances where expires_at < now()
-- Called every 60 seconds — without this index it does a full table scan.
CREATE INDEX IF NOT EXISTS idx_ctf_instances_expires_status
    ON ctf_instances(expires_at, status);

-- Instance per-user lookup: findByUserIdAndStatusIn() — used on every instance start request.
CREATE INDEX IF NOT EXISTS idx_ctf_instances_user_status
    ON ctf_instances(user_id, status);

-- Submission attempt count per team per challenge: countByChallengeIdAndTeamId()
-- Called on every flag submission to enforce per-team attempt limits.
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_chal_team
    ON ctf_submissions(challenge_id, team_id);

-- Submission lookup per competition: used by admin/teacher submission views.
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_competition
    ON ctf_submissions(competition_id);

-- Award lookup by competition + reason: used by hint penalty queries and decay corrections.
-- reason column uses prefix filtering (LIKE 'hint:%', LIKE 'solve:%') — btree index supports this.
CREATE INDEX IF NOT EXISTS idx_ctf_awards_comp_reason
    ON ctf_awards(competition_id, reason);

-- Team member lookup by user: findByCompetitionIdAndUserId() joins ctf_team_members
-- with ctf_teams on team_id, then filters by user_id. Index on user_id speeds the join.
-- Note: ctf_team_members has no competition_id column — competition is on ctf_teams.
CREATE INDEX IF NOT EXISTS idx_ctf_team_members_user_id
    ON ctf_team_members(user_id);

-- ctf_teams competition lookup: speeds up team-member joins that filter by competition.
CREATE INDEX IF NOT EXISTS idx_ctf_teams_competition_id
    ON ctf_teams(competition_id);

-- Solve duplicate check: existsByCompetitionIdAndChallengeIdAndTeamId()
-- Called on every flag submission — must be instant, not a table scan.
-- NOTE: This index is also covered by the UNIQUE constraint above (uq_comp_solve),
-- but we keep it explicit for clarity and as a fallback if the constraint is skipped.
CREATE INDEX IF NOT EXISTS idx_ctf_comp_solves_lookup
    ON ctf_competition_solves(competition_id, challenge_id, team_id);

-- ── Verification ─────────────────────────────────────────────────────────────
-- After running, verify with:
--   SELECT indexname, tablename FROM pg_indexes
--   WHERE schemaname = 'icode_ctf'
--   ORDER BY tablename, indexname;
