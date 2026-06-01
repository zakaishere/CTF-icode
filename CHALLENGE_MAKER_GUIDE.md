# iCode CTF — Challenge Maker Guide

This guide covers everything a teacher or admin needs to know to create, configure,
and deploy challenges on the iCode CTF platform — from a simple static flag to a
full pwn environment with a per-team Docker container.

---

## Table of contents

1. [Challenge anatomy](#1-challenge-anatomy)
2. [Categories and difficulties](#2-categories-and-difficulties)
3. [Flag types](#3-flag-types)
4. [Static challenges (no Docker)](#4-static-challenges-no-docker)
5. [Dynamic challenges (Docker)](#5-dynamic-challenges-docker)
6. [Web challenge — step-by-step](#6-web-challenge--step-by-step)
7. [Pwn challenge — step-by-step](#7-pwn-challenge--step-by-step)
8. [All Docker parameters](#8-all-docker-parameters)
9. [Resource limits and defaults](#9-resource-limits-and-defaults)
10. [Build pipeline](#10-build-pipeline)
11. [Instance lifecycle](#11-instance-lifecycle)
12. [Hints and blood bonuses](#12-hints-and-blood-bonuses)
13. [Scoring modes](#13-scoring-modes)
14. [Downloadable files and media](#14-downloadable-files-and-media)
15. [Library vs competition challenges](#15-library-vs-competition-challenges)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Challenge anatomy

Every challenge — regardless of type — shares these core fields:

| Field | Required | Description |
|---|---|---|
| `title` | Yes | Short display name shown on the board |
| `description` | Yes | Markdown-formatted problem statement |
| `category` | Yes | One of the values in §2 |
| `difficulty` | Yes | `EASY`, `MEDIUM`, or `HARD` |
| `basePoints` | Yes | Starting point value |
| `plainFlag` | Yes* | The exact flag string. Required for STATIC; ignored for DYNAMIC |
| `flagType` | No | `STATIC` (default) or `DYNAMIC` |
| `flagFormat` | No | Template for DYNAMIC flags — e.g. `FLAG{?}`. Default: `FLAG{?}` |
| `maxAttempts` | No | Max wrong submissions before lock-out. Default: `10` |
| `isActive` | No | Whether the challenge counts for scoring. Default: `true` |
| `isHidden` | No | Whether it appears to students. Default: `true` (hidden) |
| `requiresInstance` | No | `true` for Docker challenges, `false` otherwise |

\* For DYNAMIC challenges the flag is generated automatically per team; you do not
supply a `plainFlag`, but you must set `flagFormat` (see §3).

---

## 2. Categories and difficulties

```
CRYPTO      FORENSICS      REVERSE      WEB      PWN      MISC      OSINT
```

```
EASY        MEDIUM         HARD
```

Use `PWN` for binary exploitation challenges that need a running process. Use `WEB`
for everything HTTP-based. The category is display-only; it does not change how the
platform spawns containers — that is controlled by `requiresInstance` and
`connectionType`.

---

## 3. Flag types

### STATIC

One flag shared by every team. Set `plainFlag` to the exact flag string (e.g.
`FLAG{h3ll0_w0rld}`). The platform hashes and stores it; the plaintext is only
persisted for injection into Docker containers and is never exposed to students.

Use for: crypto, forensics, reverse, OSINT, MISC, and web challenges where the flag
does not need to differ per team.

### DYNAMIC

A unique flag is generated per team using HMAC-SHA256. The formula is:

```
token  = HMAC-SHA256(CTF_FLAG_SECRET, "<competitionId>:<challengeId>:<teamId>")
         first 20 hex characters
flag   = flagFormat with "?" replaced by token
```

Example: `flagFormat = FLAG{?}` → `FLAG{bbfaae63ea8785ad6da3}`

The same deterministic value is injected into the container via the `FLAG` env var
**and** used to validate the student's submission, so the two always match.

Use for: pwn and web challenges where you want each team to have its own flag so
flag-sharing between teams can be detected.

**Tip:** if `flagFormat` contains no `?` placeholder, the platform wraps the token in
`FLAG{...}` automatically.

---

## 4. Static challenges (no Docker)

Set `requiresInstance = false`. The platform does not start any container.

**Typical flow:**

1. Create the challenge with `requiresInstance = false`.
2. Put the flag in `plainFlag` (STATIC) or configure `flagFormat` (DYNAMIC).
3. Optionally attach a downloadable file (see §14) — e.g. a pcap, an ELF binary, an
   encrypted message.
4. Optionally attach a media URL — e.g. an image or GIF shown inside the challenge
   card.
5. Unhide the challenge when the competition begins.

No Dockerfile, no ZIP upload, no build step needed.

---

## 5. Dynamic challenges (Docker)

Set `requiresInstance = true`. Each student (or team) gets their own isolated
container spawned from your Docker image. The platform:

- Picks a free host port in the range **32000–33000**.
- Starts the container with your image, injects the `FLAG` env var, applies resource
  limits, and binds the chosen host port to the container's `EXPOSE` port.
- Waits up to **15 s** for the port to accept TCP connections before declaring the
  instance RUNNING.
- For TCP (pwn) challenges: additionally verifies a **second** connection is possible
  after the first health-check, proving the wrapper is in multi-connection mode.
- Automatically stops the container after the configured duration (default **30 min**,
  renewable up to 3 times).

### Two ways to provide a Docker image

| Method | When to use |
|---|---|
| **ZIP upload** | You built the challenge yourself. Zip the folder contents (Dockerfile at ZIP root) and upload via the admin panel. The platform builds the image. |
| **Registry URL** | The image is already published on Docker Hub or a private registry. Supply the full `image:tag` reference and the platform pulls it. |

---

## 6. Web challenge — step-by-step

### 6.1 Write the app

Any language/framework. The app **must** listen on `0.0.0.0:<port>`, not
`127.0.0.1`. Docker's port-publishing works at the host level; if the app binds only
to loopback inside the container, the platform's health check times out and the
instance is marked FAILED.

### 6.2 Inject the flag

Read the flag from the `FLAG` environment variable at startup:

```python
# Python example
import os
FLAG = os.environ.get("FLAG", "FLAG{PLACEHOLDER}")
```

```javascript
// Node.js example
const FLAG = process.env.FLAG || "FLAG{PLACEHOLDER}";
```

```go
// Go example
flag := os.Getenv("FLAG")
```

Never hard-code the flag into the image. The platform injects the correct value
(static or per-team dynamic) at container start.

### 6.3 Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# ONE consolidated RUN — never split package installs across multiple RUN commands.
# Each RUN is a separate Docker layer; splitting forces a full re-download every build.
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Flag is provided by the platform at runtime
ENV FLAG="CTF{PLACEHOLDER}"

EXPOSE 3000

# Health check — platform waits for this before marking instance RUNNING.
# Any HTTP status code (even 404) is enough to confirm the app is reachable.
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
```

**Key rules:**
- `EXPOSE` must match the port the app actually binds to.
- Bind to `0.0.0.0`, not `127.0.0.1`.
- Include a `HEALTHCHECK` — the platform will detect a ready container faster.
- One `RUN` per logical group of related steps (package install, code copy, etc.).

### 6.4 Challenge settings

| Field | Value |
|---|---|
| `requiresInstance` | `true` |
| `connectionType` | `HTTP` |
| `dockerExposedPort` | The port your app listens on (e.g. `3000`). Leave blank to let the platform auto-detect it from `EXPOSE`. |
| `flagType` | `STATIC` or `DYNAMIC` |
| `dockerFlagEnv` | `FLAG` (default) — or any env var name your app reads |

### 6.5 ZIP structure

```
my-web-challenge.zip
├── Dockerfile          ← must be at root
├── server.js
├── package.json
└── package-lock.json
```

Do **not** zip the folder — zip its **contents** so `Dockerfile` is directly at the
ZIP root. A common mistake is zipping the folder itself, producing
`challenge-folder/Dockerfile`, which the platform can handle one level deep but adds
unnecessary ambiguity.

---

## 7. Pwn challenge — step-by-step

### 7.1 Write the binary

Compile for Linux x86-64 (or the architecture you want to target). Test it locally:

```bash
gcc -o challenge challenge.c -fno-stack-protector -z execstack -no-pie
./challenge
```

### 7.2 Inject the flag

Read from the `FLAG` env var **or** write it to a file that the binary opens. The
platform injects the value via environment variable.

```c
// C example — read flag from env var
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    char *flag = getenv("FLAG");
    if (!flag) flag = "FLAG{PLACEHOLDER}";
    // ... your vulnerable code ...
    // Write flag somewhere the exploit can retrieve it
    printf("You win! %s\n", flag);
    return 0;
}
```

Alternatively, write the flag to `/flag.txt` and let the binary `open("/flag.txt")`.
In that case, copy the file in the Dockerfile (the platform still injects `FLAG` as
an env var — you are responsible for writing it to the file in an entrypoint script
if needed).

### 7.3 Dockerfile

**Download the ready-made template:**

```
GET /api/admin/ctf/challenges/templates/pwn-dockerfile
```

Or use the template below as a starting point:

```dockerfile
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ── ONE consolidated apt-get layer ────────────────────────────────────────────
# Add every package here. NEVER add a second RUN apt-get install.
# After the first build this entire layer is cached — subsequent rebuilds
# (e.g. after changing the binary or the flag format) skip all package
# installation and finish in seconds instead of minutes.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        socat \
    && rm -rf /var/lib/apt/lists/*

# Unprivileged user
RUN useradd -m -s /bin/sh ctf

WORKDIR /home/ctf

# Copy binary and make it executable.
# chmod +x is MANDATORY — Docker does not preserve the executable bit.
# Without it, socat's EXEC: fails with "permission denied".
COPY --chown=ctf:ctf challenge ./challenge
RUN chmod +x ./challenge

# Placeholder — the platform overwrites this at container start with the real flag.
ENV FLAG="CTF{PLACEHOLDER}"

# Must match the port socat listens on below.
# The build pipeline auto-detects this EXPOSE and sets the challenge's connection
# port — no manual port configuration required in the admin panel.
EXPOSE 4444

# Health check — waits for socat to be ready before marking the instance RUNNING.
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
    CMD socat /dev/null TCP:localhost:4444 || exit 1

# socat with fork — CRITICAL.
# Without 'fork', socat exits after the FIRST connection. The platform's own
# health-check counts as that first connection, making the instance permanently
# dead for every player who connects afterward.
# Bind on 0.0.0.0 (all interfaces) — required for the host to reach the port.
USER ctf
CMD ["socat", \
     "TCP-LISTEN:4444,reuseaddr,fork", \
     "EXEC:./challenge,pty,stderr,setsid,sigint,sane"]
```

### Common socat option explanations

| Option | Purpose |
|---|---|
| `TCP-LISTEN:4444` | Listen on port 4444, bound to all interfaces (`0.0.0.0`) |
| `reuseaddr` | Allows fast container restart without `TIME_WAIT` blocking the port |
| `fork` | **Required.** Forks a child per connection; the parent keeps accepting |
| `EXEC:./challenge` | Runs the binary for each new connection |
| `pty` | Allocates a pseudo-terminal (needed for readline/ncurses) |
| `stderr` | Merges stderr into the pty so players see error output |
| `setsid` | Puts the child in a new session (clean signal handling) |
| `sigint` | Forwards Ctrl-C from the player to the child process |
| `sane` | Resets terminal to sane defaults between connections |

### 7.4 Challenge settings

| Field | Value |
|---|---|
| `requiresInstance` | `true` |
| `connectionType` | `TCP` |
| `dockerExposedPort` | The port socat listens on (e.g. `4444`). Leave blank to auto-detect from `EXPOSE`. |
| `flagType` | `DYNAMIC` recommended — unique per team deters flag sharing |
| `flagFormat` | `FLAG{?}` (default) |
| `dockerFlagEnv` | `FLAG` (default) |

### 7.5 Player connection

Once the instance is RUNNING, the platform displays a connection string:

```
localhost:32045   (example — actual port varies)
```

Players connect with:
```bash
nc localhost 32045
# or
python3 -c "from pwn import *; r = remote('localhost', 32045); r.interactive()"
```

### 7.6 ZIP structure

```
my-pwn-challenge.zip
├── Dockerfile          ← must be at root
└── challenge           ← the compiled binary
```

Optionally include additional files the binary needs (e.g. `libc.so.6`, `ld-linux.so`
for ret2libc challenges, or a `flag.txt` placeholder).

---

## 8. All Docker parameters

These fields are set when creating or updating a challenge. All are optional unless
marked Required.

### Connection and routing

| Field | Type | Default | Description |
|---|---|---|---|
| `requiresInstance` | bool | `false` | Enable Docker instance spawning |
| `connectionType` | string | `HTTP` | `HTTP` for web challenges, `TCP` for pwn |
| `dockerExposedPort` | int | auto | Container-side port. If blank, auto-detected from the image's `EXPOSE` instruction after build |
| `dockerImage` | string | — | Set automatically after a successful build/pull. Do not set manually unless using a registry image |

### Flag injection

| Field | Type | Default | Description |
|---|---|---|---|
| `dockerFlagEnv` | string | `FLAG` | Name of the environment variable where the platform injects the flag |
| `dockerEnvVars` | JSON map | `{}` | Additional env vars. Any key named `FLAG` (case-insensitive) is silently dropped — the platform controls that name |

Example `dockerEnvVars`:
```json
{
  "APP_PORT": "3000",
  "DEBUG": "false",
  "CHALLENGE_LEVEL": "hard"
}
```

### Resource limits

These override the platform-wide defaults (see §9) for this specific challenge.
Leave null to use the platform defaults.

| Field | Type | Unit | Description |
|---|---|---|---|
| `dockerMemoryMb` | int | MB | Container memory limit |
| `dockerCpuPercent` | int | % | CPU quota (50 = half a core; 100 = one full core) |
| `dockerPidsLimit` | int | count | Maximum process/thread count. Default: `200` |

---

## 9. Resource limits and defaults

Platform-wide limits are configured by the admin in the resource config panel.
Per-challenge overrides (§8) take precedence.

| Setting | Default | Description |
|---|---|---|
| Max concurrent instances (platform-wide) | 50 | How many containers can run simultaneously |
| Max instances per user | 3 | A single student/team can have at most this many running instances |
| Instance duration | 30 min | How long an instance lives before auto-expiry |
| Max renewals | 3 | How many times a student can extend their instance |
| Default memory limit | 128 MB | Per-container RAM cap |
| Default CPU quota | 50% | Per-container CPU cap |
| Default PID limit | 200 | Per-container process cap |

**Capabilities dropped from every container:** `NET_ADMIN`, `SYS_ADMIN`

**PID 1:** `tini` (`--init` flag) — propagates signals correctly to xinetd/socat
children and reaps zombie processes.

**Isolation:** Each instance gets its own dedicated bridge network (`ctf-net-<id>`),
so containers from different instances cannot reach each other.

### Sizing guidance

| Challenge type | Recommended memory | Recommended CPU |
|---|---|---|
| Simple pwn binary | 64–128 MB | 25–50% |
| Web app (Node/Python) | 128–256 MB | 50% |
| Web app with DB | 256–512 MB | 50–100% |
| Multi-service web | 512 MB+ | 100% |

For pwn challenges that fork many processes (e.g. a server accepting many
connections), raise `dockerPidsLimit` from 200 to 500–1000.

---

## 10. Build pipeline

### What happens after you upload a ZIP

```
Upload ZIP
    │
    ▼
Validate (magic bytes, size ≤ 100 MB, .zip extension)
    │
    ▼
Save to /tmp/ctf-uploads/zips/
    │
    ▼
Compute SHA-256 (duplicate detection)
    │
    ▼
Extract to /tmp/ctf-uploads/extracted/<buildId>/
    │
    ▼
Locate Dockerfile (root first, then one level deep)
    │
    ▼
docker build --tag icode-ctf/challenge-<id>:v<N>
             --build-arg BUILDKIT_INLINE_CACHE=1
             [--cache-from <previous image>]     ← on rebuilds only
    │
    ▼ (up to 600 s)
Auto-detect EXPOSE port → update challenge.dockerExposedPort
    │
    ▼
Status: READY — challenge is ready to spawn instances
    │
    ▼
Cleanup extracted directory
```

### Build statuses

| Status | Meaning |
|---|---|
| `PENDING` | Queued, not yet started |
| `BUILDING` | `docker build` is running |
| `PULLING` | Pulling from a registry URL |
| `READY` | Image built/pulled successfully — instances can be spawned |
| `FAILED` | Build or pull failed — check the build log |

### Viewing the build log

```
GET /api/admin/ctf/challenges/{challengeId}/build-log
```

The log contains the full Docker build output. Look for `apt-get` errors, missing
files, or permission issues.

### Rebuild vs first build

- **First build:** no cache available. Expect 2–5 minutes for a pwn challenge with
  `apt-get install` of standard packages.
- **Rebuild** (re-upload of ZIP): the previous image is passed as `--cache-from`.
  Unchanged layers (including the entire `apt-get` layer if packages did not change)
  are reused. A typical rebuild after changing only the binary takes **under 30 s**.

### Enabling BuildKit (admin, one-time setup)

BuildKit dramatically improves build speed for complex Dockerfiles. Enable it on the
Docker host once:

```bash
echo '{"features":{"buildkit":true}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

Docker Engine 23.0+ has BuildKit enabled by default. The platform logs a warning at
startup if the daemon version is older than API 1.43.

---

## 11. Instance lifecycle

```
requestInstance()
    │
    ▼
STARTING ──── spawnDockerAsync() ────────────────────────────┐
    │                                                          │
    │  docker create → docker start                            │
    │  waitForPort (20 attempts × 750 ms = 15 s max)          │
    │  [TCP only] second connection check (fork detection)     │
    │  inspectContainer (verify still running)                 │
    │  [HTTP only] waitForHttp (12 attempts × 1 s = 12 s max) │
    │                                                          │
    ▼                                                          ▼
RUNNING ──── auto-expires after duration              FAILED (error in errorMessage)
    │
    ▼
EXPIRED / STOPPED
    │
    ▼
container force-removed + per-instance network deleted
```

### Why instances fail

| Error message | Cause | Fix |
|---|---|---|
| `port X not accepting connections after 15 s` | App/socat not listening, wrong port, or bind on 127.0.0.1 | Check `EXPOSE` matches real port; bind on `0.0.0.0` |
| `TCP port stopped accepting after health-check` | socat missing `fork` option | Add `,fork` to `TCP-LISTEN:` |
| `Container exited immediately` | Binary crashed or missing dependency | Check build log; run image locally with `docker run` |
| `HTTP app never answered` | Configured port ≠ port app listens on | Ensure `EXPOSE` and app bind port match |
| `permission denied` (from socat) | Binary not executable | Add `RUN chmod +x ./challenge` in Dockerfile |
| `image not found locally` | Build failed or image was pruned | Re-upload ZIP to trigger a new build |

---

## 12. Hints and blood bonuses

### Hints

Each hint has:
- `text` — the hint content (Markdown supported)
- `cost` — points deducted from the team's score when the hint is purchased

Students can purchase hints voluntarily. Points are deducted immediately on purchase.
Hints are never revealed automatically.

Example hint config:
```json
[
  { "cost": 10, "text": "Try a format string vulnerability." },
  { "cost": 25, "text": "The vulnerable call is in the `parse_input` function." }
]
```

### Blood bonuses

Reward the first teams to solve a challenge with bonus points:

| Field | Description |
|---|---|
| `bloodBonusEnabled` | Enable bonus scoring for this challenge |
| `firstBloodBonus` | Extra points for 1st solve |
| `secondBloodBonus` | Extra points for 2nd solve |
| `thirdBloodBonus` | Extra points for 3rd solve |

Blood bonus points are added on top of the displayed challenge point value and do not
change the leaderboard point display for the challenge itself.

---

## 13. Scoring modes

Set at the competition level. Challenges only need `basePoints` — the competition
mode controls how final scores are calculated.

| Mode | How points work |
|---|---|
| **STATIC** | Every team that solves gets exactly `basePoints` |
| **DYNAMIC** | Points decay as more teams solve — first team gets full `basePoints`, later teams get less |
| **PARTIAL** | Used for exam/TP scenarios — partial credit possible |

For dynamic scoring you can optionally set per-challenge:
- `initialValue` — starting point value (overrides `basePoints` for the decay calculation)
- `minimumValue` — floor; score never drops below this
- `decayValue` — how fast the score falls per solve

---

## 14. Downloadable files and media

| Field | Purpose |
|---|---|
| `downloadableFileUrl` | URL of a file students can download (e.g. a binary, pcap, archive) |
| `downloadableFileName` | Display name shown in the challenge card |
| `mediaUrl` | URL of an image or GIF displayed inside the challenge modal |

Host files on any publicly accessible storage (e.g. the platform's static file
server, S3, or a CDN). Do not put flags inside downloadable files for STATIC
challenges unless that is intentional.

---

## 15. Library vs competition challenges

### Library challenges

A teacher can create challenges in their personal **library** (reusable pool)
independently of any competition. Library challenges:

- Are owned by the creating teacher.
- Are not visible to students until copied into a competition.
- Can be copied into multiple competitions.

### Competition challenges

When a library challenge is copied into a competition, the platform creates a new
independent copy. Changes to the copy do not affect the library original.

Challenges created directly inside a competition are not automatically added to the
library.

---

## 16. Troubleshooting

### Build takes too long / times out

1. Check the build log: `GET /api/admin/ctf/challenges/{id}/build-log`
2. Confirm all `apt-get install` calls are in **one** `RUN` command.
3. Enable BuildKit on the Docker host (see §10).
4. The build timeout is **600 s**. If a build legitimately needs more, ask the admin
   to increase `ctf.build.timeout-seconds` in `application.yml`.

### Instance is FAILED immediately

1. Open the instance error message from the admin panel.
2. Pull and run the image locally to reproduce:
   ```bash
   docker run -e FLAG=test -p 4444:4444 icode-ctf/challenge-<id>:v1
   ```
3. Common causes and fixes are listed in §11.

### Port not reachable after instance is RUNNING

- Confirm the app/socat binds to `0.0.0.0`, not `127.0.0.1`.
- Confirm `EXPOSE` in the Dockerfile matches the port the process actually listens on.
- For pwn: confirm socat includes `fork` — without it the instance dies after the
  platform's own health-check connection.

### Flag not injected into container

- Confirm `requiresInstance = true`.
- Confirm `dockerFlagEnv` matches the env var name the app/binary reads.
- For DYNAMIC challenges, confirm `CTF_FLAG_SECRET` is set to a non-default value
  (see startup log warning).

### Cannot upload ZIP — "file does not appear to be a valid ZIP"

The file must be a real ZIP archive (magic bytes `PK\x03\x04`). Renaming a `.tar.gz`
to `.zip` does not work. Use:
```bash
cd my-challenge-folder
zip -r ../my-challenge.zip .
```
Note: `zip -r . .` (zipping the current directory) is correct — this puts Dockerfile
at the ZIP root.

### Cannot upload ZIP — "ZIP does not contain a Dockerfile"

The Dockerfile must be at the root of the ZIP, not inside a sub-folder. Check with:
```bash
unzip -l my-challenge.zip | grep Dockerfile
```
The path should be `Dockerfile`, not `challenge/Dockerfile`.

### Rebuild is as slow as the first build

This means `--cache-from` could not reuse the previous image. Causes:
- The previous image was pruned (`docker image prune` removes unreferenced images).
  Rebuild from scratch — subsequent rebuilds will be fast again.
- BuildKit is not enabled on the daemon — layers are not stored in the content-
  addressable cache. Enable BuildKit (see §10).

---

## Quick reference card

### Minimal static challenge

```json
{
  "title": "Caesar Cipher",
  "description": "Decode `IFJJ ZRUOG` with a shift of 7.",
  "category": "CRYPTO",
  "difficulty": "EASY",
  "basePoints": 100,
  "plainFlag": "FLAG{hello_world}",
  "flagType": "STATIC",
  "requiresInstance": false
}
```

### Minimal web challenge

```json
{
  "title": "SQL Injection 101",
  "description": "Find the admin flag at `/flag`.",
  "category": "WEB",
  "difficulty": "MEDIUM",
  "basePoints": 250,
  "flagType": "DYNAMIC",
  "flagFormat": "FLAG{?}",
  "requiresInstance": true,
  "connectionType": "HTTP",
  "dockerFlagEnv": "FLAG"
}
```

### Minimal pwn challenge

```json
{
  "title": "Ret2Win",
  "description": "Classic stack overflow. Binary attached.",
  "category": "PWN",
  "difficulty": "HARD",
  "basePoints": 500,
  "flagType": "DYNAMIC",
  "flagFormat": "FLAG{?}",
  "requiresInstance": true,
  "connectionType": "TCP",
  "dockerFlagEnv": "FLAG",
  "dockerMemoryMb": 128,
  "dockerCpuPercent": 50,
  "dockerPidsLimit": 200
}
```

### Dockerfile rules — checklist

- [ ] All `apt-get install` in **one** `RUN` command with `rm -rf /var/lib/apt/lists/*`
- [ ] `EXPOSE <port>` matches the port the process actually listens on
- [ ] App/socat binds to `0.0.0.0`, not `127.0.0.1`
- [ ] `chmod +x` on every binary
- [ ] socat uses `,fork` for multi-connection support
- [ ] `HEALTHCHECK` included
- [ ] Flag read from `$FLAG` env var, not hard-coded
- [ ] Dockerfile is at the **root** of the ZIP, not inside a folder
