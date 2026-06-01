# CTF Platform Audit Report: icode-ctf vs CTFd

*Generated: 2026-05-31 | Audited by: Claude Sonnet 4.6*

---

## Executive Summary

icode-ctf is a multi-competition CTF platform built on Spring Boot (Java 17) + Next.js, targeting an academic setting where teachers create competitions, students form teams, and Docker-based challenge instances are spawned per team. Compared to CTFd, it **exceeds** CTFd in feature density (multi-competition, teacher library, dynamic flag anti-cheat, blood bonus, cheat detection, per-instance isolation networks, score timeline) but **lags behind** in production readiness. The biggest risks are: (1) CORS hardcoded to `localhost:*` — the frontend cannot reach the backend from any non-localhost hostname, making every production deployment broken out of the box; (2) default secrets in `application.yml` (`JWT_SECRET: CHANGE_ME_TO_A_256_BIT_BASE64_ENCODED_SECRET_KEY`, `CTF_FLAG_SECRET: CHANGE_ME`) that allow token forgery and flag prediction if env overrides are forgotten; (3) in-memory-only rate limiting and caching via Bucket4j + Caffeine that resets on every restart and cannot be shared across multiple backend nodes; (4) two N+1 query patterns in the scoreboard path — one DB query per team for member counts + one DB query per challenge for solve counts. To be event-ready it needs: a CORS fix, secret rotation enforcement, Redis for distributed cache/rate-limit, a bulk member-count query, and a confirmed application.yml env-override checklist before any first event.

---

## Phase 1 — Platform Overview

### 1.1 CTFd

- **Tech stack**: Python 3, Flask, SQLAlchemy ORM; database: PostgreSQL/MySQL/SQLite; cache: Redis (production) or SimpleCache (dev) via Flask-Caching; Celery optional for async
- **Authentication**: Session-based (Flask-Login), HMAC of password stored in session cookie, CSRF nonce per-session, email+password registration, optional OAuth, API tokens supported
- **Team system**: Users create or join teams with a join token; captain roles; bracket support; team size limits
- **Challenge system**: Plugin-based (`BaseChallenge`); static/dynamic point types; category, tags, hints, files, value; admin CRUD; challenge visibility toggle; challenge ratings
- **Instance system**: Not built-in; relies on external plugins (e.g., CTFd-Docker or RHCT); no native Docker management
- **Submission system**: Per-challenge flag records (plaintext or hash); timing-safe XOR comparison for static flags; regex flag type; attempt logging; max attempts configurable per challenge
- **Scoring system**: Static (fixed points) and dynamic (decay via `dynamic_challenges` plugin); decay formula: parabola/linear; value stored directly in `Challenges.value` column, updated on each solve; awards table for bonuses
- **Scoreboard**: SQL aggregate query (`UNION ALL` of solves + awards, `GROUP BY account_id`, `SUM`); cached 60 seconds with `@cache.memoize`; scoreboard freeze via a Unix timestamp config value; freeze filters `Solves.date < freeze`
- **Background jobs**: Cache invalidation is synchronous (called in the solve path); Celery optional for email/async work; cleanup jobs not built-in (no containers to clean)
- **Caching**: Redis-backed Flask-Caching; standings, user scores, user/team schema, challenge lists, pages all cached; comprehensive `clear_standings()` called on every solve
- **File storage**: Local filesystem or S3/compatible via pluggable `Uploader`; served via `/files/<token>` route
- **Security**: Flask-WTF CSRF on all form endpoints; bcrypt passwords; rate limiting via Flask-Limiter (optional, configured per deployment); ban/hide flags for users/teams; input validation via WTForms + marshmallow schemas
- **Database schema**: Key tables: `users`, `teams`, `challenges`, `solves`, `submissions`, `flags`, `files`, `hints`, `awards`, `tokens`, `pages`, `notifications`; indexed on foreign keys via SQLAlchemy; `solves.account_id` + `solves.challenge_id` indexed

### 1.2 icode-ctf

- **Tech stack**: Java 17, Spring Boot 3.x, Spring Data JPA + Hibernate, PostgreSQL; cache: Caffeine (in-memory, JVM-local); WebSocket via STOMP over SockJS; frontend: Next.js
- **Authentication**: Stateless JWT (HS256, 24h expiry via `JwtService`), BCrypt passwords, email OTP verification (configurable), password reset via email, `JwtAuthenticationFilter` validates every request; `ADMIN`/`TEACHER`/`STUDENT` roles in JWT claims
- **Team system**: Captain creates team with random invite code; members join by code; per-competition teams (`CTFTeam` + `CTFTeamMember`); captaincy transfer; kick; max team size configurable; `CTFTeamFlagRepository` stores per-team dynamic flags
- **Challenge system**: Categories (CRYPTO, FORENSICS, REVERSE, WEB, MISC, OSINT, PWN), difficulties (EASY/MEDIUM/HARD); teacher library system (`is_library` flag); challenge soft-delete; blood bonus (1st/2nd/3rd); flag type (STATIC/DYNAMIC); downloadable files + media URL; JSON hints stored in `ctf_challenges.hints` (JSONB column)
- **Instance system**: Docker-based; `CTFBuildService` builds images from ZIP (@Async on `ctfBuildExecutor`: 2 core, 5 max, queue 20); `CTFInstanceService` spawns containers (@Async on `ctfInstanceExecutor`: 3 core, 10 max, queue 50); per-instance isolated bridge network; TCP health check before marking RUNNING; HTTP health check for web challenges; `@Scheduled` cleanup every 60s; orphan janitor every 5 min; max 3 renewals per instance
- **Submission system**: `CTFSubmissionService` for practice mode; `CTFCompetitionService.submitFlag()` for competition mode; SHA-256 + `MessageDigest.isEqual()` timing-safe comparison; `FlagVerifierRegistry` (static + regex); cross-team flag detection (`flagRepo.findCheatSource()`) logged silently as `CTFCheatEvent`; per-team+challenge wrong-attempt rate limit (5 wrong in 5 min window); submission audit trail persisted
- **Scoring system**: Event-sourced via `ctf_awards` table; `CTFScoringEngine` computes STATIC/LINEAR/LOGARITHMIC decay; retroactive decay correction on each new solve; blood bonus post-solve award; freeze-aware (`buildScoreboard` passes `freezeAt` to `teamTotals`); `CTFTeamScoreService.teamTotals()` loads all solves once then computes in memory
- **Scoreboard**: Caffeine cache 30s (`@Cacheable(value="scoreboard", key="#competitionId")`); evicted on `submitFlag()`; WebSocket broadcast after each solve; live (unfrozen) view via `/scoreboard/live`; admin view bypasses cache
- **Background jobs**: Instance cleanup `@Scheduled(fixedDelay=60000)`; orphan janitor `@Scheduled(fixedDelay=300000)`; Docker build and spawn on separate thread pools (async); email via `mailExecutor` pool (2 core, 5 max)
- **Caching**: Caffeine (JVM-local, single node only); caches: `scoreboard` (30s), `challenges` (60s, per user), `competition-status` (10s), `user-profile` (5min), `leaderboard` (2min), `hint-unlocks` (5min)
- **File storage**: Local filesystem at `${CTF_UPLOAD_PATH:/tmp/ctf-uploads}`; challenge files stored after ZIP extraction; ZIPs up to 100 MB; no S3/object storage integration
- **Security**: Spring Security with `JwtAuthenticationFilter`; BCrypt; Bucket4j rate limiting (strict 10/min for `/submit`, `/auth/`, `/register`; 120/min general; 300/min polling); Docker capability drops (`NET_ADMIN`, `SYS_ADMIN`); `readonlyRootfs=false` (containers can write); PID limit (200 default); memory + CPU limits; `tini` as init process; Micrometer metrics
- **Database schema**: Key tables: `users`, `ctf_teams`, `ctf_team_members`, `ctf_competitions`, `ctf_challenges`, `ctf_instances`, `ctf_submissions`, `ctf_competition_solves`, `ctf_awards`, `ctf_hint_unlocks`, `ctf_challenge_builds`, `ctf_docker_images`, `ctf_cheat_events`, `ctf_resource_configs`; indexes not explicitly visible in JPA entities (Spring Boot auto-creates based on `@Column(nullable=false)` and `@Id` only — no explicit `@Index` annotations visible)

---

## Phase 2 — Side-by-Side Comparison

| System | CTFd has | icode-ctf has | Gap | Severity |
|--------|----------|---------------|-----|----------|
| **Auth** | Session + CSRF + bcrypt + OAuth + API tokens | JWT + BCrypt + email OTP + password reset | No OAuth; no persistent API tokens; email OTP disabled by default in config | IMPORTANT |
| **Team management** | Join token + captain + brackets + ban/hide | Invite code + captain + kick + captaincy transfer + competition-scoped teams | No brackets; no hidden/banned flags | NICE |
| **Challenge upload** | Admin web form; file attachments via uploader | ZIP upload → async Docker build + registry pull; file download URL | CTFd has no Docker build pipeline at all — icode-ctf BETTER here | BETTER |
| **Instance management** | None (needs external plugins) | Full Docker lifecycle: build, spawn, port map, health check, expiry, orphan janitor, per-team flags | icode-ctf far ahead | BETTER |
| **Submissions** | Flag per challenge (plaintext or hash); timing-safe XOR; audit log | SHA-256 + timing-safe; static + regex + dynamic; cross-team cheat detection; full audit trail | icode-ctf ahead (cheat detection not in CTFd core) | BETTER |
| **Rate limiting** | Via Flask-Limiter (optional, not always configured) or nginx | Bucket4j in-memory (10 wrong/min strict, 5 wrong/5min per challenge); but in-memory only | Not distributed; resets on restart; no Redis backend | CRITICAL |
| **Scoring** | Static + dynamic decay (per-challenge `value` column updated inline) | Static + linear + logarithmic decay; blood bonus; event-sourced awards; retroactive decay correction | CTFd decay is simpler but well-tested; icode-ctf more complex but correct | BETTER |
| **Scoreboard freeze** | Timestamp-based freeze in config; SQL filters `date < freeze` | `isFrozen` + `frozenAt` on competition entity; Caffeine cache respects freeze | Both handle it; icode-ctf freeze is per-competition, CTFd is global | BETTER |
| **Caching** | Redis-backed (production-grade, distributed, persistent across restarts) | Caffeine in-memory (single node, resets on restart) | Critical gap for any multi-instance or restart-resilient deployment | IMPORTANT |
| **Background jobs** | Celery (optional) for heavy async; cache invalidation synchronous | Thread pools for Docker builds/spawns; `@Scheduled` for cleanup; no job queue or retry mechanism | No persistent job queue; CallerRunsPolicy on build overflow blocks HTTP thread | IMPORTANT |
| **File storage** | Local FS or S3 via pluggable Uploader | Local FS only (`/tmp/ctf-uploads`) | No S3/object storage; `/tmp` lost on container restart | IMPORTANT |
| **Security** | CSRF on forms; bcrypt; rate limiting optional | JWT stateless (no CSRF needed); bcrypt; Bucket4j; Docker isolation; CORS **hardcoded to localhost** | CORS broken for production — no non-localhost origin allowed | CRITICAL |
| **Admin panel** | Full web admin (challenges, users, teams, submissions, config, stats, export) | Teacher/admin control panel (competition management, scoreboard, submissions, cheat detection) | No global export/import; no user management UI; no ban/hide | IMPORTANT |
| **Multi-competition** | Single event per instance (separate deployments for multiple events) | Native multi-competition with access codes, start/end times, pause/freeze | icode-ctf BETTER for university use | BETTER |
| **Notifications** | Built-in notification system | `CTFNotification` entity + WebSocket broadcast | Both present | — |
| **Leaderboard graph** | Score progression API | Score timeline API + Caffeine-cached | icode-ctf has richer data (blood bonus breakdown, per-member contribution) | BETTER |

---

## Phase 3 — Deep Dive: Critical Systems

### 3A — Challenge Upload and Instance Flow

**ZIP upload → extraction → validation → storage**

| Step | CTFd | icode-ctf |
|------|------|-----------|
| Upload | File form field, any type | `.zip` only, max 100 MB enforced (`CTFChallengeUploadController:73`) |
| Storage | Saved via `Uploader` plugin (local/S3) | Saved to `${CTF_UPLOAD_PATH}` via `storageService.saveZip()` |
| Validation | File type loosely checked | Extension `.zip` required; SHA-256 computed on save |
| Extraction | N/A | `storageService.extractZip()` then `findDockerContext()` to locate Dockerfile |

**Dockerfile detection and image building**

CTFd has no native Docker build pipeline. icode-ctf's flow (`CTFBuildService.doBuildFromZip()`):
1. Parse `EXPOSE` port from Dockerfile text before build starts (early estimate).
2. Tag as `icode-ctf/challenge-<id_prefix>:v<version>`.
3. Run `docker build` via Docker Java SDK with optional `cacheFrom` for rebuilds.
4. Post-build: `inspectImageCmd` to confirm final EXPOSE port, persist to `ctf_challenges.container_port`.

**How the build is triggered (blocking? async? queued?)**

icode-ctf: `buildService.buildFromZip(build, zipPath)` annotated `@Async("ctfBuildExecutor")`. The `ctfBuildExecutor` has core=2, max=5, queue=20, `CallerRunsPolicy`. If 25 concurrent builds are submitted simultaneously, the 26th runs **on the HTTP request thread itself** — blocking the servlet thread for the full build duration (up to 600 seconds). This is a serious risk during mass challenge uploads.

**Port detection and assignment**

icode-ctf: `reservePort()` is `synchronized` — picks a random port in [32000, 33000], checks `USED_PORTS` set (JVM-local `ConcurrentHashMap`) and attempts a `ServerSocket` bind. Port is persisted to DB at instance creation. On restart, `syncPortsFromDb()` restores the set from RUNNING/STARTING instances.

**Instance start → container run → port mapping**

`spawnDockerAsync()` on the `ctfInstanceExecutor` thread pool:
1. Pull or verify image locally.
2. Create isolated bridge network (`ctf-net-<instanceId_prefix>`).
3. Create container with `HostConfig`: port binding, memory/CPU/PID limits, capability drops, `tini` init.
4. Start container.
5. Wait for TCP port readiness (20 × 750ms = 15s max).
6. For TCP challenges: second readiness check after 1.5s (detects single-connection wrappers).
7. For HTTP challenges: `waitForHttp()` (12 × 1000ms = 12s max).
8. Inspect container state to confirm still running.
9. Update DB to RUNNING, send WebSocket notification.

**Instance expiry → cleanup**

`@Scheduled(fixedDelay=60000)` calls `cleanupExpiredInstances()`: finds RUNNING instances with `expiresAt < now`, sends WebSocket "EXPIRED" notification, submits `teardownContainer()` to `ctfInstanceExecutor`. `teardownContainer()` stops container (10s timeout), force-removes it with volumes, removes isolated network with retry (4 attempts, exponential backoff). Orphan janitor at 5-minute interval reaps stale `ctf-*` containers and empty `ctf-net-*` networks.

**What happens if two teams start an instance simultaneously**

Port reservation is `synchronized`, so no port collision. Both teams get separate containers on separate ports. Each container gets its own isolated bridge network. No shared state between instances — correct.

**What happens if a build fails halfway**

`doBuildFromZip()` wraps the entire build in try/catch. On exception: sets `CTFChallengeBuild.buildStatus = "FAILED"`, saves error message, sends WebSocket notification. The `finally` block calls `storageService.cleanup(extractedDir)` to remove extracted files. Old image (on rebuild) is NOT cleaned up on failure — it remains in service. Correct behavior.

---

### 3B — Submission Handling Under Load

**How flag checking works**

CTFd: plaintext `CTFdStaticFlag.compare()` — timing-safe XOR byte-by-byte.  
icode-ctf competition path (`CTFCompetitionService.submitFlag()`):
1. `submissionRepo.countByChallengeIdAndTeamId()` — count attempts (1 DB query).
2. `solveRepo.existsByCompetitionIdAndChallengeIdAndTeamId()` — duplicate solve check (1 DB query).
3. `isRateLimited()` — scans in-memory `wrongAttempts` list (no DB).
4. For DYNAMIC: `flagRepo.findByCompetitionIdAndChallengeIdAndTeamId()` — fetch or compute team flag hash (1-2 DB queries).
5. SHA-256 hash + `MessageDigest.isEqual()` — in memory.
6. On correct: `solveRepo.save()`, `awardRepo.save()`, retroactive decay corrections (N×`awardRepo.save()` for N prior solvers), `instanceService.stopInstanceOnSolve()`.
7. Total DB hits per correct submission: ~5-10+ depending on solver count.

**Rate limiting**

icode-ctf has TWO overlapping rate limits:
- **Global**: Bucket4j interceptor — 10 req/min on any URL matching `/submit` (via `RateLimitInterceptor.isStrictEndpoint()`). Per-user by JWT, per-IP for anonymous.
- **Per-challenge wrong-attempt**: 5 wrong attempts in 5-minute window stored in `wrongAttempts` ConcurrentHashMap, keyed by `teamId:challengeId`. Only tracks **wrong** attempts; not wrong + correct combined.

**Problem**: The `wrongAttempts` map in `CTFCompetitionService` is never pruned of old competition entries. After a competition ends, the map still holds all those keys indefinitely. Over multiple competitions, this is a slow memory leak.

**50 teams submitting flags simultaneously**

- Bucket4j throttles per-user, so 50 different users each get their own quota — no cross-user interference at the rate limiter.
- The `@Transactional` annotation on `CTFCompetitionService` uses Spring's default transaction-per-request, each with its own connection from the HikariCP pool (max 50 connections). 50 simultaneous submits = 50 connections from the pool = pool fully saturated. A 51st concurrent request waits up to 3000ms (`connection-timeout: 3000`) then throws.
- `solveRepo.existsByCompetitionIdAndChallengeIdAndTeamId()` without a composite index on `(competition_id, challenge_id, team_id)` could be a full table scan.
- No pessimistic locking on solves: two members of the same team submitting simultaneously could both pass the `existsByCompetitionIdAndChallengeIdAndTeamId()` check before either `solveRepo.save()` commits. This is a **double-solve race condition**.

**Does anything queue or block?**

Submissions hit the DB directly. No queue. The only throttle is Bucket4j and the DB connection pool.

---

### 3C — Scoreboard Performance

**CTFd scoreboard query**

Single SQL `UNION ALL` query in `get_standings()`:
```sql
SELECT account_id, SUM(challenge.value), MAX(solve.id), MAX(solve.date) FROM solves JOIN challenges ...
UNION ALL
SELECT account_id, SUM(value), MAX(id), MAX(date) FROM awards ...
-- wrapped in subquery, joined to users/teams
ORDER BY score DESC, date ASC, id ASC
```
This is one round-trip to the DB. Cached for 60 seconds with `@cache.memoize`. Cleared via `clear_standings()` on every solve (which deletes many memoized variants).

**icode-ctf scoreboard query**

`buildScoreboard()` → `teamScoreService.teamTotals()`:
1. Load ALL solves for the competition (`findByCompetitionIdOrderBySolvedAtAsc`) — 1 query, returns N rows.
2. Load ALL challenges for the competition (`findByCompetitionIdAndDeletedFalse`) — 1 query.
3. Load ALL hint awards for the competition — 1 query.
4. Compute scoring in Java memory (no DB) — correct.
5. Load ALL teams (`findByCompetitionId`) — 1 query.
6. **For each team**: `memberRepo.countByIdTeamId(team.getId())` — **1 DB query per team**. With 50 teams = 50 extra queries.

Total per uncached scoreboard load: **54 DB queries** for 50 teams. Each query is fast (indexed) but 54 round-trips is 54× the latency of a single batch.

**Does it recalculate on every load?**

No — `@Cacheable(value="scoreboard", key="#competitionId")` with 30s TTL. Cache is evicted by `submitFlag()`. During high activity (many solves), cache churn is high: every correct solve evicts and the next request recomputes all 54 queries.

**With 100 teams and 50 challenges all updating**

- Each correct submission evicts the scoreboard cache.
- Under extreme load (e.g., 20 teams solve simultaneously): 20 cache evictions in quick succession, potentially 20 simultaneous `buildScoreboard()` calls before any one finishes → 20 × 54 = 1080 DB queries in a burst.
- The challenges cache is keyed per-user (`competitionId:userId`), so each eviction only clears the submitting user's cache. Other users see stale solve counts for up to 60s — **stale challenge list displayed to most users**.

---

### 3D — Database Design Analysis

**N+1 query patterns**

1. `buildScoreboard()` in `CTFCompetitionService`: calls `memberRepo.countByIdTeamId(team.getId())` inside a `for (CTFTeam team : teams)` loop. **Fix**: add a native query `SELECT team_id, COUNT(*) FROM ctf_team_members WHERE team_id IN (:ids) GROUP BY team_id` and join results in Java.

2. `buildChallengeDTO()` in `CTFCompetitionService`: calls `solveRepo.countByCompetitionIdAndChallengeId(comp.getId(), c.getId())` or `countByCompetitionIdAndChallengeIdAndSolvedAtLessThanEqual()` for **each challenge** inside `visible.stream().map(c -> buildChallengeDTO(...))`. With 30 challenges = 30 DB queries per cache miss. **Partially mitigated** by 60s per-user challenge cache, but still N+1 on cold load.

3. In `CTFCompetitionService.submitFlag()` retroactive decay correction: `awardRepo.findByCompetitionIdAndReason(competitionId, solveReason)` returns ALL prior solve awards, then loops over them calling `awardRepo.save()` for each correction. With 50 prior solvers = 50 individual INSERT statements. **Fix**: batch insert.

**Full table scans (likely)**

No explicit `@Index` annotations found in any `@Entity` class reviewed. JPA creates indexes only for `@Id` and columns with `unique=true`. The following queries likely lack indexes:
- `findByUserIdAndStatusIn(userId, statuses)` on `ctf_instances` — no index on `(user_id, status)`.
- `findAllByExpiresAtBeforeAndStatus(time, status)` on `ctf_instances` — no index on `(expires_at, status)`.
- `countByChallengeIdAndTeamId()` on `ctf_submissions` — no index on `(challenge_id, team_id)`.
- `existsByCompetitionIdAndChallengeIdAndTeamId()` on `ctf_competition_solves` — composite index missing.
- `findByCompetitionIdAndReason()` on `ctf_awards` — `reason` column likely not indexed; with `LIKE 'hint:%'` prefix scan possible but slow.

**DB hits on every request without caching**

- `getStatus()` in `CTFCompetitionService`: calls `memberRepo.countParticipantsByCompetition()` + `teamRepo.countByCompetitionId()` on every status poll. With `competition-status` cached 10s and polling at 300 req/min bucket, this hits DB up to 6 times per minute per user. Acceptable but could be worse under load.
- `listForUser()`: calls `teamService.getMyTeam()` for each active competition inside a stream — uncached.

---

## Phase 4 — Performance and Scalability Audit

### 4.1 Behavior at 50 Concurrent Users

- **Normal browsing**: Fine. Challenges and scoreboards are cached. HikariCP pool (50 connections) can handle 50 concurrent users if each transaction is fast.
- **50 simultaneous flag submissions**: DB connection pool fully saturated. Transactions in queue. Burst of 50+ award writes on correct solves. Scoreboard cache evicted and rebuilt. Functional but slow (~1-3s latency).
- **WebSocket**: 50 concurrent STOMP connections are trivially handled by Spring's WebSocket layer.

### 4.2 Behavior at 200 Concurrent Users

- **DB connection exhaustion**: Pool max is 50. 200 concurrent requests needing a DB connection → 150 wait in queue. `connection-timeout: 3000ms` → after 3 seconds, waiting requests fail with `SQLTransientConnectionException`. Users see HTTP 500.
- **Scoreboard recalculation storms**: 20 simultaneous correct submissions = 20 scoreboard evictions = 20 concurrent `buildScoreboard()` calls → spike of ~1000 DB queries.
- **Rate limiter state**: Bucket4j `ConcurrentHashMap` at 200 users grows to 200+ entries — fine for memory, but not distributed.
- **Tomcat thread pool**: max 200 threads, accept-count 100. Under 200 concurrent users, threads are near saturation. Build overflow (CallerRunsPolicy) could steal HTTP threads for 10-minute builds.

### 4.3 What Will Crash First and Why

1. **HikariCP pool exhaustion (DB connections)** — first failure point at ~50 concurrent DB-hitting requests. Requests start failing after 3s wait. Increase `DB_POOL_SIZE` or optimize queries.
2. **CORS in production** — if deployed to a real hostname, 100% of frontend requests fail immediately because CORS only allows `http://localhost:*`. This is the first thing that breaks in any real deployment.
3. **Build queue overflow with CallerRunsPolicy** — if 26+ challenge ZIPs are uploaded simultaneously, HTTP threads block for up to 600 seconds. Server appears hung to all other users sharing those threads.
4. **Double-solve race condition** — two team members submitting the same flag within milliseconds can both receive credit if the `existsByCompetitionId...` check returns false before either commits.
5. **Memory growth from `wrongAttempts` map** — not a crash at event scale but degrades over long-running servers.

---

### 4.4 Missing Rate Limiting

| Check | Result | Evidence |
|-------|--------|----------|
| Rate limiting on flag submissions | **YES** — 10 req/min global + 5 wrong/5min per challenge | `RateLimitInterceptor.isStrictEndpoint()` + `CTFCompetitionService.isRateLimited()` |
| Rate limiting on login attempts | **YES** — 10 req/min on `/auth/` | `RateLimitInterceptor.isStrictEndpoint()` matches `/auth/` |
| Rate limiting on instance starts | **PARTIAL** — per-user max instances checked but no time-based rate limit on start requests | `CTFInstanceService.requestInstance()` checks `maxInstancesPerUser` but no Bucket4j rate limit on the `/start` endpoint |
| Can one team spam-start 100 instances | **NO** — `maxInstancesPerUser` enforced in `CTFInstanceService:149-153`; global capacity check via `configService.isInstanceCapacityAvailable()` | `CTFResourceConfigService.isInstanceCapacityAvailable()` |

**Gap**: There is no rate limit on how frequently a user can *request* instance starts (start → fail → start → fail loop). A team could spam `/instance/start` up to the Bucket4j general limit (120 req/min), creating 120 DB writes per minute per user before hitting the max-instances guard.

---

### 4.5 Blocking Operations

| Operation | Blocking? | Evidence |
|-----------|-----------|----------|
| Docker build | **NO** — `@Async("ctfBuildExecutor")` | `CTFBuildService.buildFromZip()` annotated `@Async` |
| Docker build overflow | **YES** — CallerRunsPolicy when queue full (>25 builds) | `CTFDockerConfig:57` `setRejectedExecutionHandler(new CallerRunsPolicy())` |
| ZIP extraction | **NO** — happens on the build executor thread post-HTTP-response | Inside `doBuildFromZip()` on async thread |
| Instance spawn | **NO** — `@Async` via `ctfInstanceExecutor` | `exec.execute(() -> spawnDockerAsync(...))` at `CTFInstanceService:184` |
| Port reservation | **YES** — `synchronized` method + `ServerSocket` bind attempt per port | `CTFInstanceService.reservePort()` — synchronized, up to 1001 iterations in worst case |
| `waitForPort()` | **PARTIAL** — blocks async thread (not HTTP thread), but can delay 15s per spawn | Inside `spawnDockerAsync()`, 20 × 750ms |
| Email sending | **NO** — on `mailExecutor` separate thread pool | `AsyncConfig.mailExecutor()` |

---

### 4.6 Database Bottlenecks

| Pattern | Location | Description |
|---------|----------|-------------|
| **N+1: member count** | `CTFCompetitionService.buildScoreboard()` ~line 421 | `memberRepo.countByIdTeamId(team.getId())` called for each team in a loop |
| **N+1: solve count per challenge** | `CTFCompetitionService.buildChallengeDTO()` ~line 786 | `solveRepo.countByCompetitionIdAndChallengeId()` per challenge in stream |
| **N+1: retroactive decay** | `CTFCompetitionService.submitFlag()` ~line 621 | `awardRepo.save()` in a loop for each prior solver |
| **Possible table scan** | `CTFInstanceService.cleanupExpiredInstances()` | `findAllByExpiresAtBeforeAndStatus(now, "RUNNING")` — likely no index on `(expires_at, status)` |
| **Possible table scan** | `CTFInstanceService.requestInstance()` | `findByUserIdAndStatusIn(userId, statuses)` — likely no index on `(user_id, status)` |
| **Missing composite index** | `CTFCompetitionSolveRepository` | `existsByCompetitionIdAndChallengeIdAndTeamId()` — needs composite index on `(competition_id, challenge_id, team_id)` |
| **Stale challenge cache per-user** | `CTFCompetitionService.submitFlag()` | Cache evict `key="#competitionId + ':' + #userId"` only clears submitting user's view; all other users see stale solve counts for up to 60s |

---

### 4.7 Memory and Resource Limits

**Container cleanup reliability**: Yes — `@Scheduled(fixedDelay=60000)` in `cleanupExpiredInstances()` + orphan janitor every 5 minutes. Teardown includes retry logic for network removal (4 attempts). Force-disconnect on stuck containers. Stale STARTING instances reconciled to FAILED on startup.

**Container timeout**: Containers expire at `expiresAt` (configurable duration from `CTFResourceConfig`), maximum 3 renewals. After 3 renewals, no extension possible. Janitor catches containers whose teardown failed.

**Max instances per team**: `maxInstancesPerUser` from `CTFResourceConfigService`. Checked at `requestInstance()` line 149. There is no separate per-team limit distinct from per-user.

**Total instances limit**: `configService.isInstanceCapacityAvailable()` — likely checks total RUNNING count against a configured max. Enforced at line 142 before any port reservation.

**Gap**: No hard limit on total Docker image disk usage. A teacher uploading 50 × 1 GB images could exhaust host disk.

---

### 4.8 Docker Build Queue

**Build queue**: `ctfBuildExecutor` — core=2, max=5, queue=20 (`CTFDockerConfig:65-77`). Maximum 25 concurrent/queued builds before `CallerRunsPolicy` triggers.

**25 simultaneous uploads**: First 5 start immediately (core threads). Next 20 enter the queue. The 26th request blocks the HTTP servlet thread for the full build duration. The 27th+ also block. If build takes 5 minutes, those HTTP threads are frozen for 5 minutes, degrading server responsiveness for all users.

**No deduplication**: Two uploads of the same challenge ZIP start two separate builds.

**Recommendation**: Increase queue capacity; switch to `AbortPolicy` with a 503 response so the HTTP thread is freed; or use a proper job queue (e.g., Spring Batch, Redis queue).

---

### 4.9 Caching Audit

**What is cached**:

| Cache name | TTL | Key | Eviction trigger |
|------------|-----|-----|-----------------|
| `scoreboard` | 30s | `competitionId` | `submitFlag()` |
| `challenges` | 60s | `competitionId:userId` | `submitFlag()` (submitting user only) |
| `competition-status` | 10s | not visible in code reviewed | time-based only |
| `user-profile` | 5min | not visible in code reviewed | time-based only |
| `leaderboard` | 2min | not visible in code reviewed | time-based only |
| `hint-unlocks` | 5min | not visible in code reviewed | time-based only |

**What should be cached but isn't (top 5)**:

1. **`memberRepo.countByIdTeamId(teamId)`** — called per team in scoreboard builder; should be batch-fetched and cached or included in the scoreboard query.
2. **`teamService.getMyTeam()` in `listForUser()`** — called per active competition per user, uncached; could be short-lived (30s) to reduce load on competition listing page.
3. **`configService.getConfig()`** — `CTFResourceConfigService.getConfig()` reads from DB; called on every instance request; should be cached (5-10s).
4. **`challengeRepo.findDistinctDockerImages()`** — called at startup for image prewarming; fine as a one-time call but if exposed via API, needs cache.
5. **`memberRepo.findByCompetitionIdAndUserId()`** — called on every flag submit to get team membership; no cache, pure DB round-trip.

---

## Phase 5 — Security Audit

| Finding | Status | Evidence |
|---------|--------|----------|
| **Flag answers stored in plaintext returned to frontend** | **NOT FOUND** | `flagHash` and `flagValue` never appear in any DTO builder; `getMyAttempts()` masks submitted values with `maskFlag()`; `CTFChallengeDTO` does not include flag fields |
| **Admin routes without proper auth guard** | **NOT FOUND** | `/api/admin/ctf/**` requires `hasRole("ADMIN")` in `SecurityConfig:47`; `CTFChallengeUploadController.requireAdmin()` double-checks role from JWT claims |
| **File upload without type/size validation** | **NOT FOUND** | `CTFChallengeUploadController:69-77` validates `.zip` extension and size ≤ 100 MB before processing |
| **Docker socket without TLS** | **PRESENT** — `application.yml:109`: `DOCKER_TLS_VERIFY: false` by default; `DOCKER_CERT_PATH` empty | Default configuration uses Unix socket without TLS. Acceptable on a single-host deployment where the socket is filesystem-protected, but needs documentation |
| **No CSRF protection** | **NOT APPLICABLE** | App uses stateless JWT; CSRF tokens are not needed for `Authorization: Bearer` header-based auth; Spring Security CSRF explicitly disabled (`AbstractHttpConfigurer::disable`) — correct for JWT APIs |
| **SQL injection** | **NOT FOUND** | All DB access via Spring Data JPA (parameterized queries); no native SQL with string concatenation found in reviewed files |
| **Sensitive data in logs** | **PARTIAL** | `CTFCompetitionService:539`: logs `"Cheat detected: team {} submitted team {} flag for challenge {}"` — does NOT log the flag string (commented "Never log the flag string"). However `RequestLoggingFilter` may log request bodies including submitted flags — not reviewed |
| **CORS hardcoded to localhost** | **CRITICAL — PRESENT** | `SecurityConfig:92`: `setAllowedOriginPatterns(Arrays.asList("http://localhost:*"))` — all cross-origin requests from any non-localhost hostname are blocked |
| **Default JWT secret** | **CRITICAL** | `application.yml:83`: `JWT_SECRET: CHANGE_ME_TO_A_256_BIT_BASE64_ENCODED_SECRET_KEY` — if `JWT_SECRET` env var not set, tokens can be forged by anyone who reads this file |
| **Default CTF flag secret** | **CRITICAL** | `application.yml:87`: `CTF_FLAG_SECRET: CHANGE_ME` — dynamic flag derivation is predictable if this is not overridden |
| **Email verification disabled** | **HIGH** | `application.yml:80`: `disable-verification: true` — no email OTP required for registration; anyone can create an account without verification |
| **Double-solve race condition** | **HIGH** | `submitFlag()` has a TOCTOU gap between `existsByCompetitionId...` check and `solveRepo.save()` — two concurrent submissions from the same team can both register a solve |

---

## Phase 6 — Rating

| Dimension | Score | Justification |
|-----------|-------|---------------|
| Feature completeness | **8/10** | Multi-competition, teacher library, Docker instances, cheat detection, blood bonus, score timeline, freeze, pause — exceeds CTFd in many areas. Gaps: no export/import, no user ban/hide, OAuth missing, no S3 |
| Code architecture | **7/10** | Clean layered architecture (controller → service → repository), well-typed DTOs, event-sourced scoring is elegant. Issues: N+1 query patterns, in-memory state in long-lived service beans (`wrongAttempts`), some services too large (CTFCompetitionService is 835 lines) |
| Performance readiness | **4/10** | N+1 queries in hot path (scoreboard), CallerRunsPolicy on build threads, HikariCP pool saturates at 50 concurrent users, Caffeine cache doesn't survive restarts and isn't shared across nodes, CORS breaks production immediately |
| Security | **6/10** | Timing-safe flag comparison, JWT auth, BCrypt, capability-dropped containers, rate limiting — fundamentally sound. Loses points for: default secrets in config, CORS localhost-only, email verification disabled, double-solve race condition |
| Scalability | **3/10** | Caffeine (single JVM), Bucket4j (single JVM), port reservation synchronized in-memory — none of these scale horizontally; running a second backend node creates inconsistent caches, inconsistent rate limits, and port conflicts |
| Compared to CTFd (10 = matches CTFd) | **7/10** | Exceeds CTFd in Docker/instance management and multi-competition; lags in production hardening, distributed state, file storage, and ecosystem maturity |
| Overall | **5/10** | A feature-rich academic platform that would work well for a small-scale event on a single server with careful pre-event configuration. Not production-ready for a large event (200+ participants) without the CORS fix, secret rotation, and DB index additions |

---

## Phase 7 — Priority Fix List

---

```
1. CORS hardcoded to localhost
   PRIORITY: CRITICAL
   PROBLEM:  SecurityConfig.java:92 — setAllowedOriginPatterns(Arrays.asList("http://localhost:*"))
             blocks ALL requests from any non-localhost origin.
   IMPACT:   100% of frontend requests fail in any real deployment where the frontend
             is served from a hostname (e.g., ctf.myuniversity.ma). The platform
             cannot be used at all in production as configured.
   FIX:      Add an env var (e.g., CORS_ALLOWED_ORIGINS) and change to:
             configuration.setAllowedOriginPatterns(
                 Arrays.asList(env.getProperty("CORS_ALLOWED_ORIGINS", "http://localhost:*").split(",")));
             Update application.yml: cors.allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:*}
   EFFORT:   small (< 1hr)
```

---

```
2. Default JWT secret allows token forgery
   PRIORITY: CRITICAL
   PROBLEM:  application.yml:83 — jwt.secret: ${JWT_SECRET:CHANGE_ME_TO_A_256_BIT_BASE64_ENCODED_SECRET_KEY}
             If JWT_SECRET env var is not set, the signing key is the hardcoded fallback string.
             Anyone who reads the config can forge admin JWTs.
   IMPACT:   Full authentication bypass; anyone can become ADMIN and stop/read all instances.
   FIX:      Remove the fallback value. On startup, fail fast if JWT_SECRET is not set:
             @Value("${jwt.secret}") — no default. Add a startup check in StartupLogger.java
             that throws if the value equals the placeholder string.
   EFFORT:   small (< 1hr)
```

---

```
3. Default CTF flag secret leaks dynamic flag derivation
   PRIORITY: CRITICAL
   PROBLEM:  application.yml:87 — ctf.flag-secret: ${CTF_FLAG_SECRET:CHANGE_ME}
             Dynamic per-team flags are derived from this secret + competition/challenge/team IDs.
             If the secret is "CHANGE_ME", any student who reads this file (or guesses it)
             can precompute all other teams' flags and cheat with no detection.
   IMPACT:   Entire dynamic-flag anti-cheat system is bypassed; cheat detection becomes useless.
   FIX:      Same as above — remove the fallback, require env var, fail fast on startup.
   EFFORT:   small (< 1hr)
```

---

```
4. Double-solve race condition on flag submission
   PRIORITY: CRITICAL
   PROBLEM:  CTFCompetitionService.submitFlag() — the sequence:
               (1) existsByCompetitionIdAndChallengeIdAndTeamId() → false
               (2) [another thread does the same, also gets false]
               (3) both threads call solveRepo.save()
             Two members of the same team submitting simultaneously can both receive credit.
   IMPACT:   Team earns double points for one challenge; scoreboard corrupted.
   FIX:      Add a UNIQUE constraint on ctf_competition_solves(competition_id, challenge_id, team_id)
             in the DB schema. Catch the DataIntegrityViolationException in submitFlag() and
             return "already solved". No code changes beyond constraint + exception handling.
   EFFORT:   small (< 1hr)
```

---

```
5. Email verification disabled by default
   PRIORITY: HIGH
   PROBLEM:  application.yml:80 — app.security.disable-verification: true
             Any person can register without a valid email address. Bots can create
             unlimited accounts. No identity verification for students.
   IMPACT:   Account spam; students can create multiple accounts to bypass per-user rate limits.
   FIX:      Change default to false. Document that disable-verification: true is for
             development only. Add an env override (APP_SECURITY_DISABLE_VERIFICATION).
   EFFORT:   small (< 1hr)
```

---

```
6. N+1 query in scoreboard: member count per team
   PRIORITY: HIGH
   PROBLEM:  CTFCompetitionService.buildScoreboard() ~line 421:
               for (CTFTeam team : teams) {
                   memberRepo.countByIdTeamId(team.getId())  // 1 query per team
               }
             With 50 teams = 50 extra DB round-trips per scoreboard rebuild.
             Scoreboard is cached 30s but evicted on every correct submission.
   IMPACT:   Scoreboard rebuild takes 50× longer than necessary; during solve bursts,
             DB is hit with hundreds of small queries.
   FIX:      Add to CTFTeamMemberRepository:
               @Query("SELECT m.id.teamId, COUNT(m) FROM CTFTeamMember m WHERE m.id.teamId IN :teamIds GROUP BY m.id.teamId")
               Map<UUID, Long> countByTeamIdIn(@Param("teamIds") List<UUID> teamIds);
             Fetch once before the loop, look up in the map.
   EFFORT:   small (< 1hr)
```

---

```
7. N+1 query in challenge list: solve count per challenge
   PRIORITY: HIGH
   PROBLEM:  CTFCompetitionService.buildChallengeDTO() line ~786:
               int solveCount = solveRepo.countByCompetitionIdAndChallengeId(comp.getId(), c.getId());
             Called inside visible.stream().map(...). With 30 challenges = 30 queries per cache miss.
   IMPACT:   30 DB queries on every challenge list cache miss (60s TTL per user).
             With 50 users = up to 50 simultaneous cache misses each firing 30 queries = 1500 queries.
   FIX:      Pre-load solve counts as a bulk query before the stream:
               Map<UUID, Integer> solveCounts = solveRepo.countsByCompetitionId(competitionId);
             Add to CTFCompetitionSolveRepository:
               @Query("SELECT s.challengeId, COUNT(s) FROM CTFCompetitionSolve s WHERE s.competitionId=:compId GROUP BY s.challengeId")
               List<Object[]> countsByChallengeInCompetition(@Param("compId") UUID compId);
   EFFORT:   medium (half day)
```

---

```
8. CORS / in-memory caching / rate limiting not multi-node safe
   PRIORITY: HIGH
   PROBLEM:  Caffeine (JVM-local), Bucket4j (ConcurrentHashMap in JVM), and port reservation
             (USED_PORTS static ConcurrentHashMap) cannot be shared across multiple backend nodes.
             If two backend nodes are deployed, they have independent caches, independent rate
             limiters, and could assign the same port to different instances.
   IMPACT:   Horizontal scaling is impossible without introducing inconsistent state.
   FIX:      Replace Caffeine with Redis (Spring Cache + Lettuce).
             Replace Bucket4j in-memory with Bucket4j-Redis ProxyManager.
             Replace USED_PORTS with a Redis SET (SETNX for atomic port reservation).
             Add Redis connection config to application.yml.
   EFFORT:   large (1-2 days)
```

---

```
9. Build executor CallerRunsPolicy blocks HTTP threads
   PRIORITY: HIGH
   PROBLEM:  CTFDockerConfig.ctfBuildExecutor() uses CallerRunsPolicy. When queue is full
             (core=2, max=5, queue=20 → overflow at 26th concurrent upload), the HTTP
             servlet thread that submitted the upload runs the Docker build itself, blocking
             for up to 600 seconds.
   IMPACT:   Server appears hung to all other users sharing that Tomcat thread during build.
   FIX:      Change to AbortPolicy (throws RejectedExecutionException) and catch it in
             CTFChallengeUploadController.uploadZip() to return HTTP 503:
               "Build queue is full. Please try again in a few minutes."
             Increase queue capacity from 20 to 50 as a secondary improvement.
   EFFORT:   small (< 1hr)
```

---

```
10. Missing database indexes on hot query columns
    PRIORITY: HIGH
    PROBLEM:  No @Index annotations found in any reviewed @Entity class. The following
              queries very likely perform sequential scans:
              - ctf_instances: (user_id, status), (expires_at, status)
              - ctf_submissions: (challenge_id, team_id), (competition_id)
              - ctf_competition_solves: (competition_id, challenge_id, team_id) — composite
              - ctf_awards: (competition_id, reason)
    IMPACT:   As data grows, these queries go from milliseconds to seconds.
              At 10k submissions, the cleanup scheduler and flag-submit path slow significantly.
    FIX:      Add explicit indexes in the DB migration scripts (already using Flyway/Liquibase
              based on the /resources/db directory). Example:
                CREATE INDEX idx_ctf_instances_user_status ON ctf_instances(user_id, status);
                CREATE INDEX idx_ctf_instances_expires_status ON ctf_instances(expires_at, status);
                CREATE UNIQUE INDEX uq_comp_solve ON ctf_competition_solves(competition_id, challenge_id, team_id);
                CREATE INDEX idx_ctf_submissions_chal_team ON ctf_submissions(challenge_id, team_id);
                CREATE INDEX idx_ctf_awards_comp_reason ON ctf_awards(competition_id, reason);
    EFFORT:   medium (half day)
```

---

```
11. File storage in /tmp is ephemeral
    PRIORITY: MEDIUM
    PROBLEM:  application.yml:97 — ctf.upload.path: ${CTF_UPLOAD_PATH:/tmp/ctf-uploads}
              ZIPs uploaded by teachers are stored in /tmp by default. On container restart,
              /tmp is cleared. Rebuilt Docker images may be orphaned.
    IMPACT:   Teacher uploads lost on server restart; rebuild required after any restart.
    FIX:      Configure CTF_UPLOAD_PATH to a persistent volume path (e.g., /data/ctf-uploads).
              Document this as required for production. Optionally add S3 support for ZIP storage.
   EFFORT:   small (< 1hr — config change + documentation)
```

---

```
12. wrongAttempts ConcurrentHashMap memory leak
    PRIORITY: MEDIUM
    PROBLEM:  CTFCompetitionService field: ConcurrentHashMap<String, List<Long>> wrongAttempts
              is never pruned of expired competition entries. After a competition ends, all
              teamId:challengeId → [timestamps] entries remain in memory indefinitely.
              Over multiple competitions, this grows without bound.
    IMPACT:   Slow memory leak. With 50 teams × 30 challenges × 5 attempts each = 1500 entries.
              Minor per competition, but cumulative across many competitions.
    FIX:      Schedule a cleanup task that removes entries with all timestamps older than
              RATE_LIMIT_WINDOW + competition.endTime, or use Caffeine's own expiry for this map.
   EFFORT:   small (< 1hr)
```

---

```
13. Challenge cache eviction only clears submitting user's view
    PRIORITY: MEDIUM
    PROBLEM:  submitFlag() evicts: @CacheEvict(value="challenges", key="#competitionId + ':' + #userId")
              This key includes userId — it only removes the submitting user's cached challenge list.
              All other users continue to see the stale solve count for up to 60 seconds.
    IMPACT:   After a team solves a challenge, all other users see the wrong solve count on the
              challenge card for up to 60s. Minor but visible inconsistency.
    FIX:      Change the challenges cache key to exclude userId:
                @Cacheable(value="challenges", key="#competitionId")
              And evict with the same key. Accept that all users share one challenge list,
              with isSolvedByMe computed separately (outside the cache) per user.
   EFFORT:   medium (half day — requires refactoring challenge DTO to separate solved state)
```

---

```
14. No rate limit on instance start frequency
    PRIORITY: MEDIUM
    PROBLEM:  CTFInstanceService.requestInstance() has a max-instances-per-user guard but no
              time-based rate limit on how frequently a user can call the endpoint. A user
              can call start → (fail/stop) → start → ... at 120 req/min (the general Bucket4j
              limit), creating a CPU + DB spam.
    IMPACT:   DB spam from instance lookups; CPU spike from Docker API calls; logs flooded.
    FIX:      Add the instance-start endpoint to the strict bucket in RateLimitInterceptor:
                private boolean isStrictEndpoint(String uri) {
                    return uri.contains("/submit") || uri.contains("/auth/") ||
                           uri.contains("/register") || uri.contains("/instance/start");
                }
   EFFORT:   small (< 1hr)
```

---

```
15. TEACHER role cannot upload challenge ZIPs
    PRIORITY: MEDIUM
    PROBLEM:  CTFChallengeUploadController.requireAdmin() only allows role="ADMIN":
                if (!"ADMIN".equals(role)) throw new AccessDeniedException(...)
              The Javadoc comment says "asserts TEACHER or ADMIN role" but the code only
              accepts ADMIN. If teachers are intended to upload their own challenge ZIPs,
              this blocks them entirely.
    IMPACT:   Teachers cannot self-manage Docker challenges; all uploads require admin intervention.
    FIX:      Change check to:
                if (!"ADMIN".equals(role) && !"TEACHER".equals(role)) ...
              And keep the existing verifyOwnership() check so teachers can only upload
              their own challenges.
   EFFORT:   small (< 1hr)
```

---

*End of CTF_AUDIT_REPORT.md*
