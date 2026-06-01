-- =============================================================================
--  icode-ctf schema.sql
--  Fresh schema for icode-ctf.
--  Run once: psql -U icode_ctf_user -d icode_ctf -f schema.sql
--  For local dev with psp_db: SET search_path TO icode_ctf first.
-- =============================================================================

-- ── Auth ──────────────────────────────────────────────────────────────────────

SET search_path TO icode_ctf;

CREATE TABLE IF NOT EXISTS users (
    id                UUID         NOT NULL DEFAULT gen_random_uuid(),
    username          VARCHAR(50)  NOT NULL,
    email             VARCHAR(255) NOT NULL,
    password_hash     VARCHAR(255) NOT NULL,
    role              VARCHAR(20)  NOT NULL CHECK (role IN ('PLAYER','ADMIN')),
    is_email_verified BOOLEAN      NOT NULL DEFAULT false,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key    UNIQUE (email),
    CONSTRAINT users_username_key UNIQUE (username)
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);

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

--
-- PostgreSQL database dump
--

\restrict O4GzEG9N6ZLg8almPNk9ISqcTu915cwSJXYKU2hqr4hGMCisuwcFWjoSYOe8EoO

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ctf_awards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_awards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competition_id uuid NOT NULL,
    team_id uuid NOT NULL,
    value integer NOT NULL,
    reason character varying(255),
    awarded_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ctf_challenge_builds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_challenge_builds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenge_id uuid NOT NULL,
    source_type character varying(10) DEFAULT 'REGISTRY'::character varying NOT NULL,
    zip_file_path character varying(500),
    zip_original_name character varying(255),
    zip_sha256 character varying(64),
    registry_url character varying(500),
    built_image_tag character varying(500),
    build_status character varying(15) DEFAULT 'PENDING'::character varying NOT NULL,
    build_log text,
    build_started_at timestamp without time zone,
    build_finished_at timestamp without time zone,
    built_by uuid,
    image_size_mb integer,
    version integer DEFAULT 1 NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ctf_challenge_builds_build_status_check CHECK (((build_status)::text = ANY ((ARRAY['PENDING'::character varying, 'BUILDING'::character varying, 'READY'::character varying, 'FAILED'::character varying, 'PULLING'::character varying, 'OUTDATED'::character varying])::text[]))),
    CONSTRAINT ctf_challenge_builds_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['ZIP'::character varying, 'REGISTRY'::character varying])::text[])))
);


--
-- Name: ctf_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_challenges (
    id uuid NOT NULL,
    author_id uuid,
    base_points integer NOT NULL,
    category character varying(20) NOT NULL,
    container_env_vars jsonb,
    container_port integer,
    created_at timestamp(6) without time zone,
    description text NOT NULL,
    difficulty character varying(10) NOT NULL,
    docker_image character varying(255),
    downloadable_file_name character varying(255),
    downloadable_file_url character varying(500),
    flag_format character varying(100),
    flag_hash character varying(64) NOT NULL,
    hints jsonb,
    is_active boolean,
    max_attempts integer,
    requires_instance boolean,
    title character varying(255) NOT NULL,
    updated_at timestamp(6) without time zone,
    deleted boolean NOT NULL,
    deleted_at timestamp(6) without time zone,
    competition_id uuid,
    is_hidden boolean,
    flag_type character varying(10) DEFAULT 'STATIC'::character varying NOT NULL,
    initial_value integer,
    minimum_value integer,
    decay_value integer,
    docker_flag_env character varying(64) DEFAULT 'FLAG'::character varying,
    connection_type character varying(10) DEFAULT 'HTTP'::character varying,
    docker_env_vars jsonb,
    docker_memory_mb integer,
    docker_cpu_percent integer,
    docker_pids_limit integer,
    is_library boolean DEFAULT false NOT NULL,
    library_owner_id uuid,
    library_source_id uuid,
    flag_value character varying(500),
    media_url character varying(500),
    blood_bonus_enabled boolean DEFAULT false NOT NULL,
    first_blood_bonus integer DEFAULT 0 NOT NULL,
    second_blood_bonus integer DEFAULT 0 NOT NULL,
    third_blood_bonus integer DEFAULT 0 NOT NULL,
    CONSTRAINT ctf_challenges_category_check CHECK (((category)::text = ANY ((ARRAY['CRYPTO'::character varying, 'FORENSICS'::character varying, 'REVERSE'::character varying, 'WEB'::character varying, 'MISC'::character varying, 'OSINT'::character varying, 'PWN'::character varying])::text[]))),
    CONSTRAINT ctf_challenges_difficulty_check CHECK (((difficulty)::text = ANY ((ARRAY['EASY'::character varying, 'MEDIUM'::character varying, 'HARD'::character varying])::text[])))
);


--
-- Name: ctf_cheat_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_cheat_events (
    id uuid NOT NULL,
    challenge_id uuid,
    competition_id uuid,
    detected_at timestamp(6) without time zone,
    source_team uuid,
    submitted_value character varying(500),
    submitting_team uuid,
    dismissed boolean NOT NULL,
    dismissed_at timestamp(6) without time zone,
    dismissed_by uuid,
    submitting_user_id uuid
);


--
-- Name: ctf_competition_solves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_competition_solves (
    id uuid NOT NULL,
    challenge_id uuid,
    competition_id uuid,
    points_awarded integer NOT NULL,
    solved_at timestamp(6) without time zone,
    solved_by uuid,
    team_id uuid
);


--
-- Name: ctf_competitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_competitions (
    id uuid NOT NULL,
    access_code character varying(20),
    banner_url character varying(500),
    created_at timestamp(6) without time zone,
    created_by uuid,
    description text,
    dynamic_decay_factor double precision,
    dynamic_min_points integer,
    end_time timestamp(6) without time zone,
    is_active boolean,
    max_team_size integer,
    min_team_size integer,
    scoring_mode character varying(10),
    start_time timestamp(6) without time zone,
    title character varying(255) NOT NULL,
    visibility character varying(20),
    frozen_at timestamp(6) without time zone,
    is_frozen boolean,
    is_paused boolean,
    paused_at timestamp(6) without time zone,
    scoring_function character varying(15) DEFAULT 'LOGARITHMIC'::character varying,
    timing_mode character varying(15) DEFAULT 'SCHEDULED'::character varying NOT NULL,
    duration_hours integer,
    registration_open boolean DEFAULT false NOT NULL,
    is_manually_started boolean DEFAULT false NOT NULL,
    manually_ended boolean DEFAULT false NOT NULL,
    cover_image_url character varying(500),
    CONSTRAINT ctf_competitions_scoring_mode_check CHECK (((scoring_mode)::text = ANY ((ARRAY['STATIC'::character varying, 'DYNAMIC'::character varying])::text[]))),
    CONSTRAINT ctf_competitions_timing_mode_check CHECK (((timing_mode)::text = ANY ((ARRAY['SCHEDULED'::character varying, 'DURATION'::character varying, 'MANUAL'::character varying, 'REGISTRATION'::character varying])::text[]))),
    CONSTRAINT ctf_competitions_visibility_check CHECK (((visibility)::text = ANY ((ARRAY['PUBLIC'::character varying, 'ACCESS_CODE'::character varying, 'INVITE_ONLY'::character varying])::text[])))
);


--
-- Name: ctf_docker_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_docker_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    image_ref character varying(512) NOT NULL,
    status character varying(10) DEFAULT 'PENDING'::character varying NOT NULL,
    pulled_at timestamp without time zone,
    error text
);


--
-- Name: ctf_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenge_id uuid NOT NULL,
    type character varying(10) DEFAULT 'STATIC'::character varying NOT NULL,
    content text NOT NULL,
    case_insensitive boolean DEFAULT false NOT NULL
);


--
-- Name: ctf_hint_unlocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_hint_unlocks (
    id uuid NOT NULL,
    challenge_id uuid,
    hint_id character varying(50) NOT NULL,
    points_spent integer NOT NULL,
    unlocked_at timestamp(6) without time zone,
    user_id uuid,
    team_id uuid
);


--
-- Name: ctf_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_instances (
    id uuid NOT NULL,
    assigned_port integer,
    challenge_id uuid,
    container_id character varying(255),
    expires_at timestamp(6) without time zone NOT NULL,
    started_at timestamp(6) without time zone,
    status character varying(20),
    stopped_at timestamp(6) without time zone,
    user_id uuid,
    renewal_count integer,
    team_id uuid,
    competition_id uuid,
    container_name character varying(128),
    network_id character varying(128),
    connection_string character varying(512),
    flag_value character varying(255),
    error_message text
);


--
-- Name: ctf_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_notifications (
    id uuid NOT NULL,
    body text,
    competition_id uuid NOT NULL,
    metadata jsonb,
    sent_at timestamp(6) without time zone,
    sent_by uuid,
    title character varying(255) NOT NULL,
    type character varying(30) NOT NULL,
    CONSTRAINT ctf_notifications_type_check CHECK (((type)::text = ANY ((ARRAY['COMPETITION_STARTED'::character varying, 'COMPETITION_PAUSED'::character varying, 'COMPETITION_RESUMED'::character varying, 'COMPETITION_ENDING_SOON'::character varying, 'COMPETITION_ENDED'::character varying, 'NEW_CHALLENGE'::character varying, 'CHALLENGE_UPDATED'::character varying, 'HINT_ADDED'::character varying, 'SCOREBOARD_FROZEN'::character varying, 'SCOREBOARD_UNFROZEN'::character varying, 'TEAM_DISQUALIFIED'::character varying, 'CUSTOM'::character varying])::text[])))
);


--
-- Name: ctf_resource_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_resource_config (
    id bigint NOT NULL,
    cleanup_interval_seconds integer,
    container_cpu_percent integer,
    container_memory_limit_mb integer,
    max_concurrent_instances integer,
    max_instance_duration_minutes integer,
    max_instances_per_user integer,
    updated_at timestamp(6) without time zone,
    updated_by uuid,
    max_zip_size_mb integer DEFAULT 100,
    build_timeout_seconds integer DEFAULT 300,
    zip_storage_path character varying(255) DEFAULT '/tmp/ctf-uploads'::character varying,
    CONSTRAINT ctf_resource_config_pkey PRIMARY KEY (id)
);

-- Seed the single resource-config row (required by the backend on startup)
INSERT INTO ctf_resource_config
  (id, max_concurrent_instances, max_instances_per_user, max_instance_duration_minutes,
   container_memory_limit_mb, container_cpu_percent, cleanup_interval_seconds,
   max_zip_size_mb, build_timeout_seconds, zip_storage_path)
VALUES
  (1, 20, 2, 60, 512, 50, 300, 100, 300, '/tmp/ctf-uploads')
ON CONFLICT (id) DO NOTHING;

-- Seed default admin account (password: Admin1234!)
INSERT INTO users (id, username, email, password_hash, role, is_email_verified)
VALUES (
  gen_random_uuid(),
  'admin',
  'admin@icode-ctf.local',
  '$2b$10$p8hBXEZMyiOIQv4oT0433.EB6JrOzlaSTQkq/U3QnXsaVKLx61bs2',
  'ADMIN',
  true
)
ON CONFLICT (email) DO UPDATE
  SET role = 'ADMIN', is_email_verified = true;


--
-- Name: ctf_solves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_solves (
    id uuid NOT NULL,
    challenge_id uuid,
    points_awarded integer NOT NULL,
    solved_at timestamp(6) without time zone,
    user_id uuid
);


--
-- Name: ctf_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_submissions (
    id uuid NOT NULL,
    attempt_number integer NOT NULL,
    challenge_id uuid,
    ip_address character varying(45),
    is_correct boolean NOT NULL,
    submitted_at timestamp(6) without time zone,
    submitted_value character varying(500) NOT NULL,
    user_agent character varying(500),
    user_id uuid,
    competition_id uuid,
    team_id uuid,
    is_cheat_flagged boolean DEFAULT false NOT NULL
);


--
-- Name: ctf_team_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_team_flags (
    id uuid NOT NULL,
    challenge_id uuid,
    competition_id uuid,
    flag_hash character varying(64) NOT NULL,
    generated_at timestamp(6) without time zone,
    team_id uuid
);


--
-- Name: ctf_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_team_members (
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp(6) without time zone,
    role character varying(10),
    CONSTRAINT ctf_team_members_role_check CHECK (((role)::text = ANY ((ARRAY['CAPTAIN'::character varying, 'MEMBER'::character varying])::text[])))
);


--
-- Name: ctf_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS ctf_teams (
    id uuid NOT NULL,
    avatar_color character varying(7),
    captain_id uuid,
    competition_id uuid NOT NULL,
    created_at timestamp(6) without time zone,
    invite_code character varying(10) NOT NULL,
    name character varying(50) NOT NULL,
    disqualified_at timestamp(6) without time zone,
    disqualified_reason character varying(500),
    is_disqualified boolean NOT NULL
);


-- ── Constraints and indexes ───────────────────────────────────────────────────

-- Prevent double-solve race condition (two teammates submitting the same flag simultaneously).
-- The corresponding catch in CTFCompetitionService.submitFlag() returns a graceful "already solved".
ALTER TABLE ctf_competition_solves
    DROP CONSTRAINT IF EXISTS uq_comp_solve;
ALTER TABLE ctf_competition_solves
    ADD CONSTRAINT uq_comp_solve UNIQUE (competition_id, challenge_id, team_id);

-- Instance cleanup and per-user lookup (called every 60s and on every instance start)
CREATE INDEX IF NOT EXISTS idx_ctf_instances_expires_status ON ctf_instances(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_ctf_instances_user_status    ON ctf_instances(user_id, status);

-- Submission attempt counting (called on every flag submission)
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_chal_team    ON ctf_submissions(challenge_id, team_id);
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_competition  ON ctf_submissions(competition_id);

-- Award lookup for hint penalties and decay correction (called on every correct submission)
CREATE INDEX IF NOT EXISTS idx_ctf_awards_comp_reason       ON ctf_awards(competition_id, reason);

-- Team member lookup by user (user_id + team_id join on every flag submission)
CREATE INDEX IF NOT EXISTS idx_ctf_team_members_user_id     ON ctf_team_members(user_id);
-- ctf_teams competition lookup for team-member queries that join via team_id
CREATE INDEX IF NOT EXISTS idx_ctf_teams_competition_id     ON ctf_teams(competition_id);

-- Solve existence check (called on every flag submission to prevent duplicate solves)
CREATE INDEX IF NOT EXISTS idx_ctf_comp_solves_lookup
    ON ctf_competition_solves(competition_id, challenge_id, team_id);

--
-- PostgreSQL database dump complete
--

\unrestrict O4GzEG9N6ZLg8almPNk9ISqcTu915cwSJXYKU2hqr4hGMCisuwcFWjoSYOe8EoO

