-- =============================================================================
--  icode-ctf — Docker database initialisation
--  Runs once when the postgres container is first created.
--  Idempotent: safe to run again (all statements use IF NOT EXISTS / ON CONFLICT).
-- =============================================================================

-- Create the application schema inside the icode_ctf database
CREATE SCHEMA IF NOT EXISTS icode_ctf;
SET search_path TO icode_ctf;

-- ── Auth ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id                UUID         NOT NULL DEFAULT gen_random_uuid(),
    first_name        VARCHAR(100) NOT NULL,
    last_name         VARCHAR(100) NOT NULL,
    email             VARCHAR(255) NOT NULL,
    password_hash     VARCHAR(255) NOT NULL,
    role              VARCHAR(20)  NOT NULL CHECK (role IN ('PLAYER','ADMIN')),
    is_email_verified BOOLEAN      NOT NULL DEFAULT false,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

CREATE TABLE IF NOT EXISTS verification_tokens (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,
    otp_code    VARCHAR(6)  NOT NULL,
    token_type  VARCHAR(30) NOT NULL,
    expiry_date TIMESTAMP   NOT NULL,
    CONSTRAINT verification_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT fk_vtokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vtokens_user ON verification_tokens(user_id);

-- ── CTF tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ctf_awards (
    id             uuid DEFAULT gen_random_uuid() NOT NULL,
    competition_id uuid NOT NULL,
    team_id        uuid NOT NULL,
    value          integer NOT NULL,
    reason         character varying(255),
    awarded_at     timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS ctf_challenge_builds (
    id                uuid DEFAULT gen_random_uuid() NOT NULL,
    challenge_id      uuid NOT NULL,
    source_type       character varying(10)  DEFAULT 'REGISTRY' NOT NULL,
    zip_file_path     character varying(500),
    zip_original_name character varying(255),
    zip_sha256        character varying(64),
    registry_url      character varying(500),
    built_image_tag   character varying(500),
    build_status      character varying(15)  DEFAULT 'PENDING' NOT NULL,
    build_log         text,
    build_started_at  timestamp without time zone,
    build_finished_at timestamp without time zone,
    built_by          uuid,
    image_size_mb     integer,
    version           integer DEFAULT 1 NOT NULL,
    error_message     text,
    created_at        timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ctf_challenge_builds_build_status_check
        CHECK (build_status = ANY (ARRAY['PENDING','BUILDING','READY','FAILED','PULLING','OUTDATED'])),
    CONSTRAINT ctf_challenge_builds_source_type_check
        CHECK (source_type = ANY (ARRAY['ZIP','REGISTRY']))
);

CREATE TABLE IF NOT EXISTS ctf_challenges (
    id                    uuid NOT NULL,
    author_id             uuid,
    base_points           integer NOT NULL,
    category              character varying(20) NOT NULL,
    container_env_vars    jsonb,
    container_port        integer,
    created_at            timestamp(6) without time zone,
    description           text NOT NULL,
    difficulty            character varying(10) NOT NULL,
    docker_image          character varying(255),
    downloadable_file_name  character varying(255),
    downloadable_file_url   character varying(500),
    flag_format           character varying(100),
    flag_hash             character varying(64) NOT NULL,
    hints                 jsonb,
    is_active             boolean,
    max_attempts          integer,
    requires_instance     boolean,
    title                 character varying(255) NOT NULL,
    updated_at            timestamp(6) without time zone,
    deleted               boolean NOT NULL,
    deleted_at            timestamp(6) without time zone,
    competition_id        uuid,
    is_hidden             boolean,
    flag_type             character varying(10) DEFAULT 'STATIC' NOT NULL,
    initial_value         integer,
    minimum_value         integer,
    decay_value           integer,
    docker_flag_env       character varying(64) DEFAULT 'FLAG',
    connection_type       character varying(10) DEFAULT 'HTTP',
    docker_env_vars       jsonb,
    docker_memory_mb      integer,
    docker_cpu_percent    integer,
    docker_pids_limit     integer,
    is_library            boolean DEFAULT false NOT NULL,
    library_owner_id      uuid,
    library_source_id     uuid,
    flag_value            character varying(500),
    media_url             character varying(500),
    blood_bonus_enabled   boolean DEFAULT false NOT NULL,
    first_blood_bonus     integer DEFAULT 0 NOT NULL,
    second_blood_bonus    integer DEFAULT 0 NOT NULL,
    third_blood_bonus     integer DEFAULT 0 NOT NULL,
    CONSTRAINT ctf_challenges_category_check
        CHECK (category = ANY (ARRAY['CRYPTO','FORENSICS','REVERSE','WEB','MISC','OSINT','PWN'])),
    CONSTRAINT ctf_challenges_difficulty_check
        CHECK (difficulty = ANY (ARRAY['EASY','MEDIUM','HARD']))
);

CREATE TABLE IF NOT EXISTS ctf_cheat_events (
    id                uuid NOT NULL,
    challenge_id      uuid,
    competition_id    uuid,
    detected_at       timestamp(6) without time zone,
    source_team       uuid,
    submitted_value   character varying(500),
    submitting_team   uuid,
    dismissed         boolean NOT NULL,
    dismissed_at      timestamp(6) without time zone,
    dismissed_by      uuid,
    submitting_user_id uuid
);

CREATE TABLE IF NOT EXISTS ctf_competition_solves (
    id             uuid NOT NULL,
    challenge_id   uuid,
    competition_id uuid,
    points_awarded integer NOT NULL,
    solved_at      timestamp(6) without time zone,
    solved_by      uuid,
    team_id        uuid
);

CREATE TABLE IF NOT EXISTS ctf_competitions (
    id                   uuid NOT NULL,
    access_code          character varying(20),
    banner_url           character varying(500),
    created_at           timestamp(6) without time zone,
    created_by           uuid,
    description          text,
    dynamic_decay_factor double precision,
    dynamic_min_points   integer,
    end_time             timestamp(6) without time zone,
    is_active            boolean,
    max_team_size        integer,
    min_team_size        integer,
    scoring_mode         character varying(10),
    start_time           timestamp(6) without time zone,
    title                character varying(255) NOT NULL,
    visibility           character varying(20),
    frozen_at            timestamp(6) without time zone,
    is_frozen            boolean,
    is_paused            boolean,
    paused_at            timestamp(6) without time zone,
    scoring_function     character varying(15) DEFAULT 'LOGARITHMIC',
    timing_mode          character varying(15) DEFAULT 'SCHEDULED' NOT NULL,
    duration_hours       integer,
    registration_open    boolean DEFAULT false NOT NULL,
    is_manually_started  boolean DEFAULT false NOT NULL,
    manually_ended       boolean DEFAULT false NOT NULL,
    cover_image_url      character varying(500),
    CONSTRAINT ctf_competitions_scoring_mode_check
        CHECK (scoring_mode = ANY (ARRAY['STATIC','DYNAMIC'])),
    CONSTRAINT ctf_competitions_timing_mode_check
        CHECK (timing_mode = ANY (ARRAY['SCHEDULED','DURATION','MANUAL','REGISTRATION'])),
    CONSTRAINT ctf_competitions_visibility_check
        CHECK (visibility = ANY (ARRAY['PUBLIC','ACCESS_CODE','INVITE_ONLY']))
);

CREATE TABLE IF NOT EXISTS ctf_docker_images (
    id        uuid DEFAULT gen_random_uuid() NOT NULL,
    image_ref character varying(512) NOT NULL,
    status    character varying(10) DEFAULT 'PENDING' NOT NULL,
    pulled_at timestamp without time zone,
    error     text
);

CREATE TABLE IF NOT EXISTS ctf_flags (
    id               uuid DEFAULT gen_random_uuid() NOT NULL,
    challenge_id     uuid NOT NULL,
    type             character varying(10) DEFAULT 'STATIC' NOT NULL,
    content          text NOT NULL,
    case_insensitive boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS ctf_hint_unlocks (
    id           uuid NOT NULL,
    challenge_id uuid,
    hint_id      character varying(50) NOT NULL,
    points_spent integer NOT NULL,
    unlocked_at  timestamp(6) without time zone,
    user_id      uuid,
    team_id      uuid
);

CREATE TABLE IF NOT EXISTS ctf_instances (
    id                uuid NOT NULL,
    assigned_port     integer,
    challenge_id      uuid,
    container_id      character varying(255),
    expires_at        timestamp(6) without time zone NOT NULL,
    started_at        timestamp(6) without time zone,
    status            character varying(20),
    stopped_at        timestamp(6) without time zone,
    user_id           uuid,
    renewal_count     integer,
    team_id           uuid,
    competition_id    uuid,
    container_name    character varying(128),
    network_id        character varying(128),
    connection_string character varying(512),
    flag_value        character varying(255),
    error_message     text
);

CREATE TABLE IF NOT EXISTS ctf_notifications (
    id             uuid NOT NULL,
    body           text,
    competition_id uuid NOT NULL,
    metadata       jsonb,
    sent_at        timestamp(6) without time zone,
    sent_by        uuid,
    title          character varying(255) NOT NULL,
    type           character varying(30)  NOT NULL,
    CONSTRAINT ctf_notifications_type_check
        CHECK (type = ANY (ARRAY[
            'COMPETITION_STARTED','COMPETITION_PAUSED','COMPETITION_RESUMED',
            'COMPETITION_ENDING_SOON','COMPETITION_ENDED','NEW_CHALLENGE',
            'CHALLENGE_UPDATED','HINT_ADDED','SCOREBOARD_FROZEN',
            'SCOREBOARD_UNFROZEN','TEAM_DISQUALIFIED','CUSTOM'
        ]))
);

CREATE TABLE IF NOT EXISTS ctf_resource_config (
    id                          bigint NOT NULL,
    cleanup_interval_seconds    integer,
    container_cpu_percent       integer,
    container_memory_limit_mb   integer,
    max_concurrent_instances    integer,
    max_instance_duration_minutes integer,
    max_instances_per_user      integer,
    updated_at                  timestamp(6) without time zone,
    updated_by                  uuid,
    max_zip_size_mb             integer DEFAULT 100,
    build_timeout_seconds       integer DEFAULT 300,
    zip_storage_path            character varying(255) DEFAULT '/data/ctf-uploads',
    CONSTRAINT ctf_resource_config_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS ctf_solves (
    id             uuid NOT NULL,
    challenge_id   uuid,
    points_awarded integer NOT NULL,
    solved_at      timestamp(6) without time zone,
    user_id        uuid
);

CREATE TABLE IF NOT EXISTS ctf_submissions (
    id               uuid NOT NULL,
    attempt_number   integer NOT NULL,
    challenge_id     uuid,
    ip_address       character varying(45),
    is_correct       boolean NOT NULL,
    submitted_at     timestamp(6) without time zone,
    submitted_value  character varying(500) NOT NULL,
    user_agent       character varying(500),
    user_id          uuid,
    competition_id   uuid,
    team_id          uuid,
    is_cheat_flagged boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS ctf_team_flags (
    id             uuid NOT NULL,
    challenge_id   uuid,
    competition_id uuid,
    flag_hash      character varying(64) NOT NULL,
    generated_at   timestamp(6) without time zone,
    team_id        uuid
);

CREATE TABLE IF NOT EXISTS ctf_team_members (
    team_id   uuid NOT NULL,
    user_id   uuid NOT NULL,
    joined_at timestamp(6) without time zone,
    role      character varying(10),
    CONSTRAINT ctf_team_members_role_check
        CHECK (role = ANY (ARRAY['CAPTAIN','MEMBER']))
);

CREATE TABLE IF NOT EXISTS ctf_teams (
    id                  uuid NOT NULL,
    avatar_color        character varying(7),
    captain_id          uuid,
    competition_id      uuid NOT NULL,
    created_at          timestamp(6) without time zone,
    invite_code         character varying(10) NOT NULL,
    name                character varying(50) NOT NULL,
    disqualified_at     timestamp(6) without time zone,
    disqualified_reason character varying(500),
    is_disqualified     boolean NOT NULL
);

-- ── Primary keys ──────────────────────────────────────────────────────────────
ALTER TABLE ctf_awards              ADD CONSTRAINT ctf_awards_pkey              PRIMARY KEY (id);
ALTER TABLE ctf_challenge_builds    ADD CONSTRAINT ctf_challenge_builds_pkey    PRIMARY KEY (id);
ALTER TABLE ctf_challenges          ADD CONSTRAINT ctf_challenges_pkey          PRIMARY KEY (id);
ALTER TABLE ctf_cheat_events        ADD CONSTRAINT ctf_cheat_events_pkey        PRIMARY KEY (id);
ALTER TABLE ctf_competition_solves  ADD CONSTRAINT ctf_competition_solves_pkey  PRIMARY KEY (id);
ALTER TABLE ctf_competitions        ADD CONSTRAINT ctf_competitions_pkey        PRIMARY KEY (id);
ALTER TABLE ctf_docker_images       ADD CONSTRAINT ctf_docker_images_pkey       PRIMARY KEY (id);
ALTER TABLE ctf_flags               ADD CONSTRAINT ctf_flags_pkey               PRIMARY KEY (id);
ALTER TABLE ctf_hint_unlocks        ADD CONSTRAINT ctf_hint_unlocks_pkey        PRIMARY KEY (id);
ALTER TABLE ctf_instances           ADD CONSTRAINT ctf_instances_pkey           PRIMARY KEY (id);
ALTER TABLE ctf_notifications       ADD CONSTRAINT ctf_notifications_pkey       PRIMARY KEY (id);
ALTER TABLE ctf_solves              ADD CONSTRAINT ctf_solves_pkey              PRIMARY KEY (id);
ALTER TABLE ctf_submissions         ADD CONSTRAINT ctf_submissions_pkey         PRIMARY KEY (id);
ALTER TABLE ctf_team_flags          ADD CONSTRAINT ctf_team_flags_pkey          PRIMARY KEY (id);
ALTER TABLE ctf_team_members        ADD CONSTRAINT ctf_team_members_pkey        PRIMARY KEY (team_id, user_id);
ALTER TABLE ctf_teams               ADD CONSTRAINT ctf_teams_pkey               PRIMARY KEY (id);

-- ── Constraints and indexes ───────────────────────────────────────────────────

-- Double-solve race condition prevention
ALTER TABLE ctf_competition_solves DROP CONSTRAINT IF EXISTS uq_comp_solve;
ALTER TABLE ctf_competition_solves ADD  CONSTRAINT uq_comp_solve
    UNIQUE (competition_id, challenge_id, team_id);

CREATE INDEX IF NOT EXISTS idx_ctf_instances_expires_status ON ctf_instances(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_ctf_instances_user_status    ON ctf_instances(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_chal_team    ON ctf_submissions(challenge_id, team_id);
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_competition  ON ctf_submissions(competition_id);
CREATE INDEX IF NOT EXISTS idx_ctf_awards_comp_reason       ON ctf_awards(competition_id, reason);
CREATE INDEX IF NOT EXISTS idx_ctf_team_members_user_id     ON ctf_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ctf_teams_competition_id     ON ctf_teams(competition_id);
CREATE INDEX IF NOT EXISTS idx_ctf_comp_solves_lookup
    ON ctf_competition_solves(competition_id, challenge_id, team_id);

-- ── Seed data ─────────────────────────────────────────────────────────────────

INSERT INTO ctf_resource_config
    (id, max_concurrent_instances, max_instances_per_user, max_instance_duration_minutes,
     container_memory_limit_mb, container_cpu_percent, cleanup_interval_seconds,
     max_zip_size_mb, build_timeout_seconds, zip_storage_path)
VALUES
    (1, 20, 2, 60, 512, 50, 300, 100, 300, '/data/ctf-uploads')
ON CONFLICT (id) DO NOTHING;

-- Default admin account (password: Admin1234!)
-- Change this password immediately after first login in production.
INSERT INTO users (id, first_name, last_name, email, password_hash, role, is_email_verified)
VALUES (
    gen_random_uuid(),
    'Admin', 'icode-ctf',
    'admin@icode-ctf.local',
    '$2b$12$Pjyp8RJIa3DJ9zlb2AQbCOmIXLD0rXQgf2IQfFT5MiZuxGxs5Kc2C',  -- Admin123!
    'ADMIN',
    true
)
ON CONFLICT (email) DO UPDATE
    SET role = 'ADMIN', is_email_verified = true,
        password_hash = '$2b$12$Pjyp8RJIa3DJ9zlb2AQbCOmIXLD0rXQgf2IQfFT5MiZuxGxs5Kc2C';
