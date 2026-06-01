# Deployment Fix Guide — icode-ctf
*Read this before you deploy anything.*

> **Implementation status — 2026-05-31**
> All fixes below have been implemented. Files changed:
> - `Backend/src/main/resources/application.yml` — FIX 1, 2, 3, 5, 10, 13, 15, 17
> - `Backend/.../config/SecurityConfig.java` — FIX 1, 17
> - `Backend/.../config/StartupLogger.java` — FIX 2+3 (fail-fast @PostConstruct)
> - `Backend/src/main/resources/db/schema.sql` — FIX 4+8 (constraint + indexes, fresh installs)
> - `Backend/src/main/resources/db/patches.sql` — FIX 4+8 (constraint + indexes, existing DBs)
> - `Backend/.../ctf/service/CTFCompetitionService.java` — FIX 4, 6, 7, 8, 13
> - `Backend/.../ctf/repository/CTFTeamMemberRepository.java` — FIX 6
> - `Backend/.../ctf/repository/CTFCompetitionSolveRepository.java` — FIX 7
> - `Backend/.../ctf/config/CTFDockerConfig.java` — FIX 9
> - `Backend/.../ctf/controller/CTFChallengeUploadController.java` — FIX 9, 12
> - `Backend/.../config/RateLimitInterceptor.java` — FIX 11
> - `.env.example` — updated with all required vars and deployment checklist

---

## Can you deploy right now?

**NO.** Three issues will make the platform completely broken or completely insecure the moment you deploy to a real server. Fix these three first, then you can run a small event. The rest can be fixed progressively.

---

## The Absolute Blockers (fix before anything else)

---

### FIX 1 — CORS will break 100% of frontend requests

**What is CORS?**
When your frontend (Next.js running on e.g. `ctf.myuniversity.ma`) makes an HTTP request to your backend (running on `api.myuniversity.ma`), the browser first asks the backend "are you okay with requests from `ctf.myuniversity.ma`?" This is called a CORS preflight check. If the backend says no, the browser blocks the request entirely — the user sees nothing.

**What's wrong right now?**
Your backend only says "yes" to `http://localhost:*`. Every other origin — including your real domain — gets a silent block.

**File:** `Backend/src/main/java/com/university/platform/config/SecurityConfig.java`

**Line 92 — current code:**
```java
configuration.setAllowedOriginPatterns(Arrays.asList("http://localhost:*"));
```

**What to change it to:**
```java
configuration.setAllowedOriginPatterns(
    Arrays.asList(
        corsAllowedOrigins.split(",")  // read from env
    )
);
```

Then add a field at the top of the class:
```java
@Value("${cors.allowed-origins:http://localhost:*}")
private String corsAllowedOrigins;
```

**In `application.yml`, add:**
```yaml
cors:
  allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:3000}
```

**When you deploy, set the env var:**
```
CORS_ALLOWED_ORIGINS=https://ctf.myuniversity.ma,http://ctf.myuniversity.ma
```

**Risk if you don't fix this:** Platform appears to work on localhost during development, but the moment any user opens it from a real domain, every API call silently fails. Users see blank pages or "network error". Everything is broken.

---

### FIX 2 — The JWT secret is a hardcoded string that anyone can guess

**What is a JWT secret?**
Your backend signs every login token with a secret key. If someone knows the secret, they can fabricate their own tokens and claim to be any user — including admin.

**What's wrong right now?**

**File:** `Backend/src/main/resources/application.yml`

**Lines 83-84 — current:**
```yaml
jwt:
  secret: ${JWT_SECRET:CHANGE_ME_TO_A_256_BIT_BASE64_ENCODED_SECRET_KEY}
```

The `:CHANGE_ME_TO_A_256_BIT_BASE64_ENCODED_SECRET_KEY` part is a **fallback default**. If you forget to set the `JWT_SECRET` environment variable when deploying, Spring uses this string as the signing key. It is public knowledge — it's in your source code.

**What to do — in `application.yml`, remove the fallback:**
```yaml
jwt:
  secret: ${JWT_SECRET}   # no default — will crash at startup if missing
```

Then add a startup check in `Backend/src/main/java/com/university/platform/config/StartupLogger.java` (or wherever your startup runs):
```java
@Value("${jwt.secret}")
private String jwtSecret;

@PostConstruct
public void validateSecrets() {
    if (jwtSecret.isBlank() || jwtSecret.startsWith("CHANGE_ME")) {
        throw new IllegalStateException(
            "FATAL: JWT_SECRET environment variable is not set or is a placeholder. " +
            "Generate one with: openssl rand -base64 32"
        );
    }
}
```

**How to generate a real secret:**
```bash
openssl rand -base64 32
```
Copy the output, set it as your `JWT_SECRET` environment variable.

**Risk if you don't fix this:** An attacker sets their JWT subject to an admin user UUID and role to "ADMIN". They craft this token using the known secret. They now have full admin access to your platform — can read flags, stop instances, delete challenges, see all submissions.

---

### FIX 3 — The dynamic flag secret is hardcoded

**What is the flag secret?**
For Docker challenges, each team gets a different flag (DYNAMIC mode) so teams can't just copy each other's flags. These per-team flags are derived from a secret key. If someone knows the secret, they can compute any team's flag before solving the challenge.

**What's wrong right now?**

**File:** `Backend/src/main/resources/application.yml`

**Lines 87-88 — current:**
```yaml
ctf:
  flag-secret: ${CTF_FLAG_SECRET:CHANGE_ME}
```

Same problem — `CHANGE_ME` is the fallback if `CTF_FLAG_SECRET` env var is not set.

**What to do:**
```yaml
ctf:
  flag-secret: ${CTF_FLAG_SECRET}   # no default
```

Add the same startup validation (alongside the JWT check above):
```java
@Value("${ctf.flag-secret}")
private String flagSecret;

@PostConstruct
public void validateSecrets() {
    if (jwtSecret.isBlank() || jwtSecret.startsWith("CHANGE_ME")) {
        throw new IllegalStateException("FATAL: JWT_SECRET is not set.");
    }
    if (flagSecret.isBlank() || flagSecret.startsWith("CHANGE_ME")) {
        throw new IllegalStateException("FATAL: CTF_FLAG_SECRET is not set.");
    }
}
```

**Generate one:**
```bash
openssl rand -base64 32
```

**Risk if you don't fix this:** Any student who reads your source code (it's probably on GitHub) can compute every team's dynamic flag for every challenge. The cheat-detection system (which cost you significant dev time) becomes completely useless.

---

## High Priority — Fix Before or Right After First Event

---

### FIX 4 — Two people on the same team can both solve the same challenge (race condition)

**What happens?**
When two teammates submit the correct flag at almost exactly the same moment (within milliseconds), both requests go through this check:
```
Does a solve already exist for this team+challenge? → NO (not yet committed)
→ Record the solve!
```
Both threads answer "no" before either one finishes saving. Both get recorded as correct. The team earns double points.

**How likely is this?** In practice, only if two teammates submit within the same 10-20ms window. Rare, but at a competitive event with excited students it will happen.

**The fix is a database constraint, not code.**

Find your DB migration files in `Backend/src/main/resources/db/`. Add a new migration file (e.g., `V10__add_solve_unique_constraint.sql`):

```sql
-- Prevent double-solve race condition
ALTER TABLE ctf_competition_solves
ADD CONSTRAINT uq_comp_solve
UNIQUE (competition_id, challenge_id, team_id);
```

Then in `Backend/src/main/java/com/university/platform/ctf/service/CTFCompetitionService.java`, in the `submitFlag()` method, wrap the solve save in a try/catch:

```java
try {
    solveRepo.save(solve);
} catch (org.springframework.dao.DataIntegrityViolationException e) {
    // Another thread beat us to it — treat as already solved
    return CTFCompetitionSubmitResponse.builder()
        .correct(false)
        .message("Your team already solved this challenge.")
        .build();
}
```

**Risk if you don't fix this:** Team gets double points. Scoreboard is wrong. You have to manually fix the database during the event, which is stressful and error-prone.

---

### FIX 5 — Email verification is disabled

**What's wrong?**

**File:** `Backend/src/main/resources/application.yml`

**Line 80:**
```yaml
app:
  security:
    disable-verification: true   # <── THIS
```

This means anyone can register with any email address — real or fake — and immediately log in. No verification required.

**What to do:**
For a real event, change to:
```yaml
app:
  security:
    disable-verification: false
```

Or set env var: `APP_SECURITY_DISABLE_VERIFICATION=false`

**But also make sure your email (SMTP) is configured** in the same file:
```yaml
spring:
  mail:
    host: ${MAIL_HOST:smtp.gmail.com}
    username: ${MAIL_USERNAME:}
    password: ${MAIL_PASSWORD:}
```
Set `MAIL_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD` env vars.

**Risk if you don't fix this:** Students register with fake emails, create multiple accounts, bypass per-user rate limits. In a university setting, students might register as professors or fake other people.

---

### FIX 6 — Scoreboard makes 50+ database queries when it could make 5

**What happens?**
Every time the scoreboard is rebuilt (which happens after every correct submission, because the cache is evicted), it runs one database query PER TEAM just to count how many members that team has. With 50 teams, that's 50 extra DB round-trips.

**Where it is:**
`Backend/src/main/java/com/university/platform/ctf/service/CTFCompetitionService.java`, method `buildScoreboard()`, around line 421:

```java
// THIS runs once per team:
.membersCount(memberRepo.countByIdTeamId(team.getId()))
```

**The fix:**

Step 1 — Add this method to `CTFTeamMemberRepository.java`:
```java
@Query("SELECT m.id.teamId AS teamId, COUNT(m) AS cnt " +
       "FROM CTFTeamMember m WHERE m.id.teamId IN :teamIds " +
       "GROUP BY m.id.teamId")
List<Object[]> countMembersByTeamIds(@Param("teamIds") List<UUID> teamIds);
```

Step 2 — In `buildScoreboard()`, before the loop, build a map:
```java
List<UUID> teamIds = teams.stream().map(CTFTeam::getId).collect(Collectors.toList());
Map<UUID, Long> memberCounts = new HashMap<>();
memberRepo.countMembersByTeamIds(teamIds).forEach(row ->
    memberCounts.put((UUID) row[0], (Long) row[1])
);
```

Step 3 — In the loop, replace the per-team query with the map lookup:
```java
.membersCount(memberCounts.getOrDefault(team.getId(), 0L).intValue())
```

**Risk if you don't fix this:** With 50 teams and 100 correct submissions during an event, you get 50 × 100 = 5,000 extra DB queries just for member counts. Under heavy load this slows scoreboard rebuilds noticeably.

---

### FIX 7 — Challenge list makes 30+ database queries per user (N+1)

**What happens?**
When a user loads the challenge list, the backend calls `solveRepo.countByCompetitionIdAndChallengeId()` once **per challenge** inside a loop. With 30 challenges, that's 30 DB queries. This is called an "N+1 query problem."

**Where it is:**
`CTFCompetitionService.java`, method `buildChallengeDTO()`, line ~786:
```java
int solveCount = solveRepo.countByCompetitionIdAndChallengeId(comp.getId(), c.getId());
```
This is called inside `visible.stream().map(c -> buildChallengeDTO(...))`.

**The fix:**

Step 1 — Add to `CTFCompetitionSolveRepository.java`:
```java
@Query("SELECT s.challengeId AS challengeId, COUNT(s) AS cnt " +
       "FROM CTFCompetitionSolve s WHERE s.competitionId = :compId " +
       "GROUP BY s.challengeId")
List<Object[]> countsByChallengeInCompetition(@Param("compId") UUID compId);
```

Step 2 — In `getCompetitionChallenges()`, before building DTOs, load all counts at once:
```java
Map<UUID, Integer> solveCounts = new HashMap<>();
solveRepo.countsByChallengeInCompetition(competitionId)
    .forEach(row -> solveCounts.put((UUID) row[0], ((Long) row[1]).intValue()));
```

Step 3 — Pass `solveCounts` into `buildChallengeDTO()` and use the map instead of the per-challenge query.

**Risk if you don't fix this:** Every challenge list page load (per user, every 60 seconds when cache expires) triggers 30 queries. With 50 users loading challenges simultaneously = 1,500 DB queries in a burst. Under heavy event load this will slow the platform noticeably.

---

### FIX 8 — Missing database indexes

**What is an index?**
Without an index, every query that filters by a column has to read every row in the table to find matches. With an index, the database goes directly to the right rows. The difference is 0.5ms vs 5 seconds as the table grows.

**Which columns are missing indexes?**
No explicit `@Index` annotations were found in any entity class. The following queries are at risk:

Add a migration file (e.g., `V11__add_missing_indexes.sql`):

```sql
-- Instance cleanup: finds all RUNNING instances expiring soon
CREATE INDEX IF NOT EXISTS idx_ctf_instances_expires_status
    ON ctf_instances(expires_at, status);

-- Instance per-user lookup: finds user's active instances
CREATE INDEX IF NOT EXISTS idx_ctf_instances_user_status
    ON ctf_instances(user_id, status);

-- Submission attempt count per team per challenge
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_chal_team
    ON ctf_submissions(challenge_id, team_id);

-- Submission count per competition (for admin/teacher views)
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_competition
    ON ctf_submissions(competition_id);

-- Solve duplicate check (ALSO prevents race condition from Fix 4)
CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_solve
    ON ctf_competition_solves(competition_id, challenge_id, team_id);

-- Award lookup by competition + reason prefix (hint penalty query)
CREATE INDEX IF NOT EXISTS idx_ctf_awards_comp_reason
    ON ctf_awards(competition_id, reason);

-- Team member lookup per competition (used on every flag submit)
CREATE INDEX IF NOT EXISTS idx_ctf_team_members_comp_user
    ON ctf_team_members(competition_id, user_id);
```

**Risk if you don't fix this:** Works fine at small scale (100-500 rows). At 10,000 submissions, the cleanup scheduler and flag-submit path noticeably slow down. At 100,000 submissions, queries that take 0.1ms become 10-second full scans.

---

### FIX 9 — Build queue overflow blocks HTTP threads

**What happens?**
When a teacher uploads a challenge ZIP, the backend starts an async Docker build. There's a queue that holds up to 20 pending builds, with 5 threads running builds simultaneously.

If 26 teachers upload ZIPs at the same time:
- 5 builds start immediately (on background threads)
- 20 go into the queue
- The 26th upload request is forced to run the build **on the HTTP servlet thread** itself

That HTTP thread is now stuck running a Docker build for up to 600 seconds. While it's stuck, that thread can't serve any other user request. If this happens to 10 threads simultaneously, 10 threads are stuck — the server appears to hang for everyone.

**This is the `CallerRunsPolicy`** — a common Java thread pool setting that's safe in some contexts but dangerous here because Docker builds are slow.

**File:** `Backend/src/main/java/com/university/platform/ctf/config/CTFDockerConfig.java`

**Lines 56-57 — current:**
```java
exec.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
```

**Change to:**
```java
exec.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
```

Then in `CTFChallengeUploadController.java`, catch the rejection:
```java
try {
    buildService.buildFromZip(build, zipPath);
} catch (org.springframework.core.task.TaskRejectedException e) {
    buildRepo.delete(build);
    throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
        "Build queue is full. Please wait a few minutes and try again.");
}
```

Also increase the queue size while you're there:
```java
exec.setQueueCapacity(50);  // was 20
```

**Risk if you don't fix this:** During challenge setup (teachers uploading ZIPs), if many do it simultaneously, the server freezes for students trying to load pages, submit flags, etc. During a competitive event this is a very bad experience.

---

### FIX 10 — File uploads are stored in /tmp (lost on restart)

**What happens?**
When a teacher uploads a challenge ZIP, it's saved to `/tmp/ctf-uploads`. The Docker image gets built from it, so the image exists in Docker. But the original ZIP is gone after a server restart.

More importantly: if the server restarts and the Docker image was also lost (Docker prune, disk cleanup, new server), the teacher has to re-upload the ZIP. There's no permanent backup.

**File:** `Backend/src/main/resources/application.yml`

**Line 97 — current:**
```yaml
ctf:
  upload:
    path: ${CTF_UPLOAD_PATH:/tmp/ctf-uploads}
```

**What to do:**
When deploying, set the environment variable `CTF_UPLOAD_PATH` to a real persistent directory:
```
CTF_UPLOAD_PATH=/data/ctf-uploads
```
Make sure `/data/ctf-uploads` is:
- On a real disk (not tmpfs or /tmp)
- Mounted as a Docker volume if you're running the backend in a container
- Has write permissions for the backend process

**Risk if you don't fix this:** Server restart before or during an event = all uploaded ZIPs gone = teachers must re-upload = Docker images must be rebuilt. During an event this means challenges are unavailable for 5-10 minutes per rebuild.

---

## Medium Priority — Fix During Setup, Before Going Live

---

### FIX 11 — Rate limit on instance start is missing

**What is an instance start rate limit?**
Right now, a student can call "start instance" up to 120 times per minute (the general rate limit). Every call hits the database to check how many instances the user has. Even if they always fail the max-instances check, they're generating 120 DB queries per minute.

**File:** `Backend/src/main/java/com/university/platform/config/RateLimitInterceptor.java`

**Line 73 — current:**
```java
private boolean isStrictEndpoint(String uri) {
    return uri.contains("/submit")
        || uri.contains("/auth/")
        || uri.contains("/register");
}
```

**Add instance start to the strict list:**
```java
private boolean isStrictEndpoint(String uri) {
    return uri.contains("/submit")
        || uri.contains("/auth/")
        || uri.contains("/register")
        || (uri.contains("/instance") && uri.contains("/start"));
}
```

This limits instance start requests to 10 per minute per user instead of 120.

**Risk if you don't fix this:** A bored student or script can hammer instance start requests, generating significant DB + Docker API load.

---

### FIX 12 — Teachers cannot upload challenge ZIPs (blocked by role check)

**What's wrong?**
The upload endpoint checks for ADMIN role only, but the comment in the code says "TEACHER or ADMIN":

**File:** `Backend/src/main/java/com/university/platform/ctf/controller/CTFChallengeUploadController.java`

**Lines 266-270 — current:**
```java
private Claims requireAdmin(String authHeader) {
    Claims claims = jwtService.parseToken(authHeader.substring(7));
    String role = claims.get("role", String.class);
    if (!"ADMIN".equals(role)) {
        throw new AccessDeniedException("Admin role required.");
    }
    return claims;
}
```

**What to do:**
```java
private Claims requireAdmin(String authHeader) {
    Claims claims = jwtService.parseToken(authHeader.substring(7));
    String role = claims.get("role", String.class);
    if (!"ADMIN".equals(role) && !"TEACHER".equals(role)) {
        throw new AccessDeniedException("Teacher or Admin role required.");
    }
    return claims;
}
```

The existing `verifyOwnership()` check below this already ensures teachers can only upload to their own challenges. This change just lets the request through the role check.

**Risk if you don't fix this:** Teachers cannot use the challenge upload feature at all. Only admins can upload ZIPs, which defeats the purpose of the teacher role.

---

### FIX 13 — `wrongAttempts` map never gets cleaned up (slow memory leak)

**What happens?**
Every wrong flag submission records a timestamp in this map:
```java
private final ConcurrentHashMap<String, List<Long>> wrongAttempts = new ConcurrentHashMap<>();
```
The map grows as teams make attempts across competitions. Old timestamps past the 5-minute window stay in the list (the code removes timestamps older than the window from the list, but never removes the key itself). Over multiple competitions with many teams and challenges, this is a slow memory leak.

**File:** `CTFCompetitionService.java`

**The fix** — add a scheduled cleanup method to the service:
```java
@Scheduled(fixedDelay = 600_000) // every 10 minutes
public void pruneWrongAttemptsMap() {
    long windowStart = System.currentTimeMillis() - RATE_LIMIT_WINDOW;
    wrongAttempts.entrySet().removeIf(entry -> {
        List<Long> timestamps = entry.getValue();
        timestamps.removeIf(t -> t <= windowStart);
        return timestamps.isEmpty();
    });
}
```

Also add `@EnableScheduling` is already present (via `SchedulingConfig`), so this method will be picked up automatically.

**Risk if you don't fix this:** Not a crash risk for a single event. For a platform running multiple competitions over a year, JVM heap grows slowly and you may see memory warnings after several months.

---

### FIX 14 — Challenge cache doesn't update for other users when someone solves

**What happens?**
When a team solves a challenge, the solve count shown on the challenge card ("34 teams solved") should go up for everyone. But the cache eviction only clears the cache for the **submitting user**:

```java
@CacheEvict(value = "challenges", key = "#competitionId + ':' + #userId")
```

This key includes `userId`. Other users have their own cached copies keyed by their own userId. They continue to see the old solve count for up to 60 seconds.

**This is a display bug, not a correctness bug** — scores are calculated correctly. Only the solve count badge on the challenge card is temporarily wrong.

**The simplest fix:**
Change the challenge cache to NOT include userId in the key:

In `CTFCompetitionService.java`:
```java
// Was:
@Cacheable(value = "challenges", key = "#competitionId + ':' + #userId")
public CTFChallengeListResponse getCompetitionChallenges(UUID competitionId, UUID userId) {

// Change to:
@Cacheable(value = "challenges", key = "#competitionId")
public CTFChallengeListResponse getCompetitionChallenges(UUID competitionId, UUID userId) {
```

And update the eviction annotation:
```java
// Was:
@CacheEvict(value = "challenges", key = "#competitionId + ':' + #userId")

// Change to:
@CacheEvict(value = "challenges", key = "#competitionId")
```

**But** — if you do this, the "solved by me" flag on each challenge is now shared across all users (it'll show whoever solved it last as "solved"). You need to separate the per-user solve state from the shared challenge data:

Move the `solvedByMe` computation **outside** the cache:
```java
// In the cached method: compute solvedChallengeIds as an empty set (shared view)
// After the cache returns: overlay the user's personal solved state
Set<UUID> mysolves = ...; // load per user, not cached
dtos.forEach(dto -> dto.setSolvedByMe(mysolves.contains(dto.getId())));
```

This is a medium-effort refactor but makes the challenge view correct for all users in real time.

**Risk if you don't fix this:** Minor display bug — solve counts are stale for 60 seconds per user. Not a correctness issue for scoring.

---

## Low Priority — Nice to Have Before a Large Event

---

### FIX 15 — Caching and rate limiting are single-server only

**What this means:**
All caching (Caffeine) and rate limiting (Bucket4j) live in memory inside the single Java process. If you:
- Restart the server → all caches cleared, rate limit counters reset
- Run two backend servers for load balancing → each has its own cache, rate limits don't coordinate

**For a small event on a single server: this is acceptable.**

**For a larger event or production multi-server: you need Redis.**

Replace Caffeine with Spring Cache + Redis:
```yaml
spring:
  cache:
    type: redis
  redis:
    host: ${REDIS_HOST:localhost}
    port: ${REDIS_PORT:6379}
```

Replace Bucket4j in-memory with Bucket4j-Redis ProxyManager (requires Bucket4j Redis dependency).

Replace the in-memory `USED_PORTS` set in `CTFInstanceService` with a Redis SET.

**Risk if you don't fix this for a single-server event:** Low. Cache just resets on restart, which means a brief scoreboard recalculation delay. Rate limits reset on restart, which is minor. Not a showstopper for one server.

---

### FIX 16 — Docker socket not using TLS

**What this means:**
Your backend communicates with Docker via the Unix socket at `/var/run/docker.sock`. This is normal for single-server setups. TLS would only be needed if the Docker daemon is on a remote server.

**File:** `application.yml`:
```yaml
docker:
  host: ${DOCKER_HOST:unix:///var/run/docker.sock}
  tls:
    verify: ${DOCKER_TLS_VERIFY:false}
```

**For a single-server deployment (backend + Docker on same machine):** This is fine. The Unix socket is protected by filesystem permissions.

**Risk:** Low in single-server setup. Would become important if you split the backend and Docker daemon onto separate servers.

---

### FIX 17 — Actuator metrics endpoint is public

**File:** `application.yml`:
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
      base-path: /api/actuator
```

The `prometheus` and `metrics` endpoints expose internal performance data (request counts, DB pool size, thread counts, JVM heap). This is useful for monitoring but should not be publicly accessible.

**The fix:**
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health  # only expose health publicly
```

Or add `hasRole("ADMIN")` to `/api/actuator/**` in `SecurityConfig.java`.

**Risk if you don't fix this:** Students can see your server's internal metrics. Not a security vulnerability per se, but information leakage.

---

## Checklist Before Deploying

Go through this list. Every item with ❌ means you are not ready.

### Absolute blockers
- [ ] `CORS_ALLOWED_ORIGINS` env var is set to your real domain
- [ ] `JWT_SECRET` env var is set to a real 256-bit random secret (not CHANGE_ME)
- [ ] `CTF_FLAG_SECRET` env var is set to a real random secret (not CHANGE_ME)
- [ ] `CTF_UPLOAD_PATH` env var is set to a persistent directory (not /tmp)
- [ ] Startup validation throws if any of the above are missing

### High priority
- [ ] Double-solve UNIQUE constraint added to database
- [ ] Email verification enabled for production (`disable-verification: false`)
- [ ] MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD env vars configured
- [ ] Missing database indexes added (migration script)
- [ ] Build executor changed to AbortPolicy (not CallerRunsPolicy)

### Medium priority
- [ ] N+1 member count query replaced with bulk query in `buildScoreboard()`
- [ ] N+1 challenge solve count query replaced with bulk query
- [ ] Instance start endpoint added to strict rate limit
- [ ] Teacher role allowed in `requireAdmin()` (if teachers need to upload)
- [ ] `wrongAttempts` map cleanup scheduled

### Before going live with real users
- [ ] Test the full flow end-to-end on the real server with CORS configured
- [ ] Test that `/api/auth/login` returns a token (verifies JWT secret is correct)
- [ ] Test flag submission rejects wrong flags (verifies flag checking works)
- [ ] Test Docker challenge instance starts (verifies Docker socket is accessible)
- [ ] Test scoreboard updates after a solve (verifies cache works)

---

## Estimated Time to Fix Everything

| Priority | Fixes | Time estimate |
|----------|-------|---------------|
| Absolute blockers (1, 2, 3) | CORS + JWT secret + flag secret | **30 minutes** |
| Database constraint (4) | Double-solve race condition | **15 minutes** |
| Email verification (5) | Config change + SMTP config | **20 minutes** |
| Database indexes (8) | Write migration SQL file | **30 minutes** |
| Build executor (9) | Change policy, add catch | **15 minutes** |
| File storage path (10) | Set env var + volume mount | **10 minutes** |
| **Total to be event-safe** | | **~2 hours** |
| N+1 queries (6, 7) | Bulk queries | **2–3 hours** |
| Rate limit instance start (11) | One-line change | **5 minutes** |
| Teacher upload role (12) | One-line change | **5 minutes** |
| Cache eviction fix (14) | Refactor DTO | **3–4 hours** |
| **Total to be production-clean** | | **~8 hours additional** |

---

## Environment Variables Required for Deployment

Copy this to your `.env` file or deployment config. **All of these must be set.**

```env
# Database
DB_URL=jdbc:postgresql://your-db-host:5432/your_db?currentSchema=icode_ctf
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password
DB_POOL_SIZE=50

# Security — REQUIRED, no defaults
JWT_SECRET=<output of: openssl rand -base64 32>
CTF_FLAG_SECRET=<output of: openssl rand -base64 32>

# CORS — set to your real frontend URL
CORS_ALLOWED_ORIGINS=https://ctf.myuniversity.ma

# Email
MAIL_HOST=smtp.gmail.com
MAIL_USERNAME=your-event-email@gmail.com
MAIL_PASSWORD=your-app-password

# File storage — must be a persistent directory
CTF_UPLOAD_PATH=/data/ctf-uploads

# Instance management — set to your server's public IP or hostname
CTF_INSTANCE_HOST=your-server-ip-or-hostname
CTF_PORT_MIN=32000
CTF_PORT_MAX:33000

# Docker
DOCKER_HOST=unix:///var/run/docker.sock

# Server
SERVER_PORT=8080

# Optional
APP_SECURITY_DISABLE_VERIFICATION=false
```

---

*This document was generated from a full read of the icode-ctf source code. All file paths and line numbers reference the current codebase as of the audit date (2026-05-31).*
