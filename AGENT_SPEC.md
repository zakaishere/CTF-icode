# iCODE CTF Worker Agent — Technical Specification

**Base URL:** `http://<HOST_IP>:8000/api/v1`
**Version:** 1.0.0

This document is the complete reference for integrating with the worker agent.
It is generated directly from the source code and reflects exact runtime behaviour.

---

## 1. Authentication

### 1.1 HMAC Authentication (Platform → Agent)

Every request from the CTF platform must include three headers. The agent
verifies all three before processing any request. If any check fails the
response is always a generic `401` — the specific failing check is never
disclosed to the caller (it is logged internally only).

#### Required headers on every platform request

| Header | Type | Description |
|--------|------|-------------|
| `X-Agent-Key` | string | The key ID issued when you created the API key (e.g. `key_abc123`) |
| `X-Timestamp` | string | Current UTC time as a **Unix epoch integer**, e.g. `"1717200000"` |
| `X-Signature` | string | HMAC-SHA256 hex digest (see computation below) |

#### Canonical string — exact format

The string that gets signed is built from four lines joined by **literal newline
characters** (`\n`). There is no trailing newline.

```
{METHOD}\n{PATH}\n{TIMESTAMP}\n{BODY_HASH}
```

Where:
- `{METHOD}` — HTTP method in **uppercase**: `POST`, `GET`, `DELETE`
- `{PATH}` — The **full request path** including `/api/v1`, e.g. `/api/v1/instances/start`
- `{TIMESTAMP}` — The exact string value of the `X-Timestamp` header
- `{BODY_HASH}` — `SHA-256(raw_request_body_bytes).hexdigest()`. For requests with no body (GET, DELETE), compute `SHA-256(b"")`, which is always `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

#### Signature computation

```
canonical = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + SHA256(body).hex()
signature = HMAC-SHA256(key_secret, canonical).hexdigest()
```

Both the key and the canonical string are encoded as UTF-8 bytes before hashing.
The result is a lowercase hex string, e.g. `a3f8b2c1...`.

#### Validation rules (all must pass)

1. All three headers (`X-Agent-Key`, `X-Timestamp`, `X-Signature`) must be present and non-empty
2. `X-Agent-Key` must match an active key in the database
3. `|UTC_now - X-Timestamp| <= 300 seconds` (5-minute replay window)
4. If the key has an IP whitelist configured, the caller's IP must be in it
5. The recomputed signature must match `X-Signature` (compared with `hmac.compare_digest` — constant time)

#### Auth failure response

All auth failures return the same response regardless of which check failed:

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "UNAUTHORIZED",
  "message": "Authentication failed"
}
```

#### Complete signing example (Python)

```python
import hashlib, hmac, time

KEY_ID     = "key_abc123"
KEY_SECRET = "sk_live_your_secret_here"

def sign(method: str, path: str, body: bytes = b"") -> dict:
    ts        = str(int(time.time()))
    body_hash = hashlib.sha256(body).hexdigest()
    canonical = f"{method.upper()}\n{path}\n{ts}\n{body_hash}"
    signature = hmac.new(KEY_SECRET.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    return {
        "X-Agent-Key":   KEY_ID,
        "X-Timestamp":   ts,
        "X-Signature":   signature,
        "Content-Type":  "application/json",
    }
```

---

### 1.2 JWT Authentication (Dashboard → Agent)

The admin dashboard uses JWT bearer tokens. These are only needed if you are
building admin tooling; the CTF platform never uses JWT.

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <access_token>` |

Access tokens expire after **15 minutes**. Obtain one via `POST /auth/login`.

---

## 2. Endpoints

### 2.1 `GET /api/v1/health`

**Auth:** None (public)

Returns the agent's operational status. Use this to verify the agent is
reachable before making other calls.

**Response 200 — normal operation:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "host": "2.11.143.6",
  "uptime_seconds": 3600,
  "docker": {
    "connected": true,
    "version": "29.0.0"
  },
  "instances": {
    "running": 12,
    "starting": 2,
    "capacity_used_pct": 14
  },
  "timestamp": "2026-06-02T17:00:00Z"
}
```

**Response 503 — Docker daemon unreachable:**

```json
{
  "status": "degraded",
  "error": "Docker daemon unreachable"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"ok"` or `"degraded"` |
| `host` | string | The `HOST_IP` this agent is configured with |
| `version` | string | Agent version |
| `uptime_seconds` | integer | Seconds since the process started |
| `docker.connected` | boolean | Whether Docker daemon is reachable |
| `docker.version` | string | Docker daemon version |
| `instances.running` | integer | Containers currently in RUNNING state |
| `instances.starting` | integer | Containers currently in STARTING state |
| `instances.capacity_used_pct` | integer | Percentage of port pool in use |
| `timestamp` | string | ISO-8601 UTC timestamp |

---

### 2.2 `POST /api/v1/instances/start`

**Auth:** HMAC required

Start a Docker challenge container for a team. Returns `202 Accepted`
immediately — the container is still starting. Poll
`GET /instances/{instance_id}/status` to wait for `RUNNING`.

**Request body (JSON):**

```json
{
  "image": "icode-sqli",
  "team_id": "550e8400-e29b-41d4-a716-446655440000",
  "challenge_id": "sqli",
  "duration_minutes": 30,
  "protocol": "http",
  "metadata": {
    "competition_id": "abc123",
    "player_username": "player1"
  }
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `image` | string | Yes | — | Challenge image name, e.g. `icode-sqli`. Matched against `image_name` in the database. |
| `team_id` | string | Yes | max 100 chars | Your team/user identifier. Any string. |
| `challenge_id` | string | Yes | max 50 chars, `[A-Za-z0-9_-]` only | Must match a READY image in the database. |
| `duration_minutes` | integer | Yes | 5–180 | How long before the instance auto-expires. |
| `protocol` | string | No | `"tcp"` or `"http"` | Default: `"tcp"`. Use `"http"` for web challenges — affects the `connection_string` format. |
| `metadata` | object | No | — | Arbitrary key/value pairs. Stored for audit purposes, not acted upon. |

**Response 202 — container is starting:**

```json
{
  "instance_id": "ctf_sqli_550e8400",
  "status": "STARTING",
  "poll_url": "/api/v1/instances/ctf_sqli_550e8400/status",
  "estimated_ready_seconds": 15
}
```

| Field | Type | Description |
|-------|------|-------------|
| `instance_id` | string | Unique identifier for this instance. Use this in all subsequent calls. |
| `status` | string | Always `"STARTING"` on this response |
| `poll_url` | string | Relative URL to poll for status updates |
| `estimated_ready_seconds` | integer | Expected time to RUNNING state (15s typical) |

**Error responses:**

| Status | `error` code | Meaning |
|--------|-------------|---------|
| `401` | `UNAUTHORIZED` | HMAC auth failed |
| `404` | `IMAGE_NOT_FOUND` | No READY image exists for `challenge_id` |
| `409` | `INSTANCE_EXISTS` | Team already has an active instance for this challenge |
| `422` | `VALIDATION_ERROR` | Request field failed validation (duration out of range, invalid challenge_id format, etc.) |
| `503` | `NO_CAPACITY` | Port pool exhausted or max concurrent instances reached |

**409 response body:**

```json
{
  "error": "INSTANCE_EXISTS",
  "message": "Team already has a running instance for this challenge",
  "existing_instance_id": "ctf_sqli_550e8400"
}
```

---

### 2.3 `GET /api/v1/instances/{instance_id}/status`

**Auth:** HMAC required

Poll this endpoint after `POST /instances/start` to wait for the instance
to become ready.

**Path parameter:**

| Param | Description |
|-------|-------------|
| `instance_id` | The `instance_id` returned by `/instances/start` |

**Response 200 while STARTING:**

```json
{
  "instance_id": "ctf_sqli_550e8400",
  "status": "STARTING",
  "host": null,
  "port": null,
  "protocol": null,
  "connection_string": null,
  "started_at": null,
  "expires_at": null,
  "remaining_seconds": null,
  "error": null
}
```

**Response 200 when RUNNING:**

```json
{
  "instance_id": "ctf_sqli_550e8400",
  "status": "RUNNING",
  "host": "2.11.143.6",
  "port": 32001,
  "protocol": "http",
  "connection_string": "http://2.11.143.6:32001",
  "started_at": "2026-06-02T17:00:00",
  "expires_at": "2026-06-02T17:30:00",
  "remaining_seconds": 1800,
  "error": null
}
```

**Response 200 when FAILED:**

```json
{
  "instance_id": "ctf_sqli_550e8400",
  "status": "FAILED",
  "host": null,
  "port": null,
  "protocol": null,
  "connection_string": null,
  "started_at": null,
  "expires_at": null,
  "remaining_seconds": null,
  "error": "Container exited immediately after start"
}
```

| Field | Type | Present when | Description |
|-------|------|-------------|-------------|
| `instance_id` | string | always | Instance identifier |
| `status` | string | always | One of: `STARTING`, `RUNNING`, `EXPIRED`, `FAILED`, `STOPPED` |
| `host` | string | RUNNING only | Public IP players connect to (same as `HOST_IP`) |
| `port` | integer | RUNNING only | Host port the container is mapped to |
| `protocol` | string | RUNNING only | `"tcp"` or `"http"` |
| `connection_string` | string | RUNNING only | Full address: `http://host:port` for HTTP, `host:port` for TCP |
| `started_at` | string | RUNNING only | ISO-8601 UTC datetime when container became RUNNING |
| `expires_at` | string | RUNNING only | ISO-8601 UTC datetime when the instance will be auto-stopped |
| `remaining_seconds` | integer | RUNNING only | Seconds until expiry |
| `error` | string | FAILED only | Human-readable error message |

**Error responses:**

| Status | `error` code | Meaning |
|--------|-------------|---------|
| `401` | `UNAUTHORIZED` | HMAC auth failed |
| `404` | `INSTANCE_NOT_FOUND` | No instance with that ID exists |

---

### 2.4 `POST /api/v1/instances/{instance_id}/stop`

**Auth:** HMAC required

Stop and remove a running instance immediately. Frees the port. Safe to call
on an already-stopped instance (returns 404 only if the ID never existed).

**Request body (JSON):**

```json
{
  "reason": "SOLVED"
}
```

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `reason` | string | No | `SOLVED`, `MANUAL`, `TIMEOUT`, `ADMIN` | Default: `"MANUAL"`. Stored in audit log and on the instance record. |

**Response 200:**

```json
{
  "instance_id": "ctf_sqli_550e8400",
  "stopped": true,
  "stopped_at": "2026-06-02T17:15:00"
}
```

**Error responses:**

| Status | `error` code | Meaning |
|--------|-------------|---------|
| `401` | `UNAUTHORIZED` | HMAC auth failed |
| `404` | `INSTANCE_NOT_FOUND` | No instance with that ID |

---

### 2.5 `POST /api/v1/instances/{instance_id}/extend`

**Auth:** HMAC required

Add more time to a running instance. Can be called up to `MAX_EXTENSIONS_PER_INSTANCE`
times per instance (default: 3).

**Request body (JSON):**

```json
{
  "extend_minutes": 30
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `extend_minutes` | integer | Yes | 5–60 | Minutes to add to current expiry |

**Response 200:**

```json
{
  "instance_id": "ctf_sqli_550e8400",
  "new_expires_at": "2026-06-02T18:00:00Z",
  "remaining_seconds": 3600,
  "extension_count": 1,
  "max_extensions": 3
}
```

| Field | Type | Description |
|-------|------|-------------|
| `new_expires_at` | string | New expiry datetime after extension |
| `remaining_seconds` | integer | Seconds remaining from now to new expiry |
| `extension_count` | integer | How many extensions have been used on this instance |
| `max_extensions` | integer | Maximum allowed (from server config) |

**Error responses:**

| Status | `error` code | Meaning |
|--------|-------------|---------|
| `400` | `MAX_EXTENSIONS_REACHED` | Instance has been extended the maximum number of times |
| `401` | `UNAUTHORIZED` | HMAC auth failed |
| `404` | `INSTANCE_NOT_FOUND` | No instance with that ID |
| `409` | `NOT_RUNNING` | Instance is not in RUNNING state |
| `422` | `VALIDATION_ERROR` | `extend_minutes` out of range |

---

### 2.6 `POST /api/v1/images/build`

**Auth:** HMAC required

Trigger a Docker image build from a challenge ZIP. Returns `202 Accepted`
immediately. Poll `GET /images/build/{build_id}/status` for the result.

Accepts two calling conventions:

#### Option A — JSON with a download URL (recommended for platform integration)

```
POST /api/v1/images/build
Content-Type: application/json
X-Agent-Key: ...
X-Timestamp: ...
X-Signature: ...  ← sign the JSON body bytes

{
  "challenge_id": "sqli",
  "zip_url": "https://your-platform.com/api/internal/challenges/sqli/zip",
  "zip_auth_token": "eyJ..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge_id` | string | Yes | Alphanumeric + dash/underscore, max 50 chars. Becomes the image name `icode-{challenge_id}:latest`. |
| `zip_url` | string | Yes | Full HTTP/HTTPS URL the agent will GET to download the ZIP |
| `zip_auth_token` | string | No | If provided, sent as `Authorization: Bearer {zip_auth_token}` when downloading the ZIP |

#### Option B — Multipart upload

```
POST /api/v1/images/build
Content-Type: multipart/form-data
X-Agent-Key: ...
X-Timestamp: ...
X-Signature: ...  ← sign b"" (empty bytes) for multipart

Form fields:
  challenge_id: sqli
  zip_file: <binary ZIP file>
```

**Response 202:**

```json
{
  "build_id": "bld_a3f8b200c1",
  "challenge_id": "sqli",
  "status": "QUEUED",
  "poll_url": "/api/v1/images/build/bld_a3f8b200c1/status"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `build_id` | string | Use this to poll build status |
| `challenge_id` | string | Echo of your input |
| `status` | string | Always `"QUEUED"` on this response |
| `poll_url` | string | Relative URL to poll for build status |

**Error responses:**

| Status | `error` code | Meaning |
|--------|-------------|---------|
| `400` | `BAD_REQUEST` | Missing `challenge_id` or no ZIP source provided |
| `401` | `UNAUTHORIZED` | HMAC auth failed |
| `422` | `VALIDATION_ERROR` | `challenge_id` format invalid |

---

### 2.7 `GET /api/v1/images/build/{build_id}/status`

**Auth:** HMAC required

Poll the status of a build job started with `POST /images/build`.

**Response 200 while QUEUED or BUILDING:**

```json
{
  "build_id": "bld_a3f8b200c1",
  "challenge_id": "sqli",
  "status": "BUILDING",
  "started_at": "2026-06-02T17:00:00",
  "finished_at": null,
  "elapsed_seconds": 45,
  "duration_seconds": null,
  "log_lines": 127,
  "log_preview": "Step 3/8 : RUN apt-get install -y python3",
  "image_name": null,
  "image_size_mb": null,
  "container_port": null,
  "error": null
}
```

**Response 200 on SUCCESS:**

```json
{
  "build_id": "bld_a3f8b200c1",
  "challenge_id": "sqli",
  "status": "SUCCESS",
  "started_at": "2026-06-02T17:00:00",
  "finished_at": "2026-06-02T17:02:07",
  "elapsed_seconds": null,
  "duration_seconds": 127.3,
  "log_lines": 243,
  "log_preview": "Successfully tagged icode-sqli:latest",
  "image_name": "icode-sqli:latest",
  "image_size_mb": 245.3,
  "container_port": 9000,
  "error": null
}
```

**Response 200 on FAILED:**

```json
{
  "build_id": "bld_a3f8b200c1",
  "challenge_id": "sqli",
  "status": "FAILED",
  "started_at": "2026-06-02T17:00:00",
  "finished_at": "2026-06-02T17:00:12",
  "elapsed_seconds": null,
  "duration_seconds": 12.1,
  "log_lines": 18,
  "log_preview": "[ERROR] docker build failed: No Dockerfile found in the uploaded ZIP",
  "image_name": null,
  "image_size_mb": null,
  "container_port": null,
  "error": "docker build failed: No Dockerfile found in the uploaded ZIP"
}
```

| Field | Type | Present when | Description |
|-------|------|-------------|-------------|
| `build_id` | string | always | Build job identifier |
| `challenge_id` | string | always | Challenge this build is for |
| `status` | string | always | `QUEUED`, `BUILDING`, `SUCCESS`, or `FAILED` |
| `started_at` | datetime | BUILDING/SUCCESS/FAILED | When the build thread started |
| `finished_at` | datetime | SUCCESS/FAILED | When the build completed |
| `elapsed_seconds` | integer | BUILDING only | Seconds since build started |
| `duration_seconds` | float | SUCCESS/FAILED | Total build time in seconds |
| `log_lines` | integer | always | Number of log lines accumulated |
| `log_preview` | string | always | Last line of the build log |
| `image_name` | string | SUCCESS only | Full image tag: `icode-{challenge_id}:latest` |
| `image_size_mb` | float | SUCCESS only | Compressed image size in megabytes |
| `container_port` | integer | SUCCESS only | Port the container exposes (auto-detected from `EXPOSE` in Dockerfile) |
| `error` | string | FAILED only | Error message |

**Error responses:**

| Status | `error` code | Meaning |
|--------|-------------|---------|
| `401` | `UNAUTHORIZED` | HMAC auth failed |
| `404` | `BUILD_NOT_FOUND` | No build job with that ID |

---

## 3. Instance Lifecycle

### Status values

| Status | Meaning |
|--------|---------|
| `STARTING` | Container created, waiting for it to accept connections |
| `RUNNING` | Container is healthy, player can connect |
| `STOPPED` | Manually stopped via `POST /instances/{id}/stop` |
| `EXPIRED` | Stopped automatically by the cleanup scheduler after `expires_at` |
| `FAILED` | Container crashed, exited immediately, or failed health check |

### Valid transitions

```
STARTING → RUNNING   (background health check passed)
STARTING → FAILED    (container exited or health check timed out)
RUNNING  → STOPPED   (manual stop via API)
RUNNING  → EXPIRED   (cleanup scheduler ran after expires_at)
RUNNING  → FAILED    (container died out-of-band)
```

There is no transition back to STARTING or RUNNING once stopped.

### How long does STARTING take?

The background thread polls the container every 1 second. It accepts the
instance as RUNNING when:
- Docker reports the container status as `running`, **and**
- For `protocol=http`: a real HTTP request to `localhost:{port}` succeeds
- For `protocol=tcp`: a TCP connection to `localhost:{port}` succeeds

The maximum wait is `HEALTHCHECK_TIMEOUT_SECONDS` (default: **60 seconds**).
Typical time is 3–15 seconds depending on the image.

### How to poll correctly

```
1. Call POST /instances/start → get instance_id, status=STARTING
2. Wait 2 seconds
3. Call GET /instances/{instance_id}/status
4. If status == "RUNNING" → read host, port, connection_string → done
5. If status == "FAILED"  → read error field → handle failure
6. If status == "STARTING" → go to step 2
7. If still STARTING after 2 minutes → treat as failure (something is wrong)
```

Recommended poll interval: **2 seconds**. Maximum attempts: **60** (2 min total).

---

## 4. Build Lifecycle

### Status values

| Status | Meaning |
|--------|---------|
| `QUEUED` | Job created, background thread not yet started |
| `BUILDING` | Actively running `docker build` |
| `SUCCESS` | Image built and registered, ready to use |
| `FAILED` | Build failed (see `error` field for reason) |

### How to poll for completion

```
1. Call POST /images/build → get build_id, status=QUEUED
2. Wait 3 seconds
3. Call GET /images/build/{build_id}/status
4. If status == "SUCCESS" → image is ready, save image_name and container_port
5. If status == "FAILED"  → read error field → fix the Dockerfile and retry
6. If status == "QUEUED" or "BUILDING" → go to step 2
```

Recommended poll interval: **3 seconds**. Build times range from 30 seconds
(cached layers) to several minutes (fresh base image pull).

### What image_name looks like on success

```
icode-{challenge_id}:latest
```

Examples:
- `challenge_id=sqli` → `image_name=icode-sqli:latest`
- `challenge_id=web-flag` → `image_name=icode-web-flag:latest`

This is the value to store in your challenge database. Pass it as the `image`
field when calling `POST /instances/start`.

### Container port detection

The agent reads the `EXPOSE` instruction in the Dockerfile to determine
`container_port`. If multiple `EXPOSE` lines exist, the first one is used.
If there is no `EXPOSE`, the agent falls back to inspecting the built image's
metadata. If that also fails, it defaults to `80`.

The `protocol` field is set automatically based on `container_port`:
- Ports `80, 8080, 3000, 5000, 8000, 9000` → `"http"`
- All other ports → `"tcp"`

---

## 5. ZIP File Requirements

### What the ZIP must contain

The ZIP must contain a `Dockerfile`. The agent searches every directory in the
ZIP recursively and uses the first directory that contains a `Dockerfile` as the
Docker build context. All other files in the same directory are available to the
build.

**Minimum valid ZIP:**
```
challenge.zip
└── Dockerfile
```

**Typical ZIP:**
```
challenge.zip
├── Dockerfile
├── app/
│   └── server.py
└── requirements.txt
```

### ZIP URL download (Option A)

When you provide `zip_url`, the agent makes an HTTP GET request to that URL
using `httpx` with:
- Timeout: **60 seconds**
- Redirects: followed automatically
- Auth header: `Authorization: Bearer {zip_auth_token}` if `zip_auth_token` was provided

The URL must be reachable from the worker server. It must respond with the ZIP
file bytes in the response body. The HTTP status must be 2xx.

**Recommended pattern on your platform:**

Create an internal endpoint that issues a short-lived token:

```
GET /api/internal/challenges/{challenge_id}/download
Authorization: Bearer <short_lived_token>
→ Content-Type: application/zip
→ Body: raw ZIP bytes
```

Pass this URL + token to the agent. The token does not need to be a JWT — any
opaque short-lived secret will work, as the agent treats it as an opaque Bearer
string.

### ZIP URL signing (HMAC)

When calling `POST /images/build` with a JSON body containing `zip_url`, sign
the **exact JSON bytes** you send. Example:

```python
body = json.dumps({
    "challenge_id": "sqli",
    "zip_url": "https://platform/api/internal/challenges/sqli/download",
    "zip_auth_token": "short-lived-token-here"
}).encode("utf-8")

headers = sign("POST", "/api/v1/images/build", body)
```

Do not add extra whitespace or re-order keys between signing and sending — the
body bytes must be identical.

---

## 6. Error Response Format

All errors follow this structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

Some errors include additional fields:

```json
{
  "error": "INSTANCE_EXISTS",
  "message": "Team already has a running instance for this challenge",
  "existing_instance_id": "ctf_sqli_550e8400"
}
```

Validation errors (422) include a `details` array:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    {
      "type": "greater_than_equal",
      "loc": ["body", "duration_minutes"],
      "msg": "Input should be greater than or equal to 5"
    }
  ]
}
```

### All error codes

| Code | HTTP Status | When |
|------|-------------|------|
| `UNAUTHORIZED` | 401 | HMAC or JWT auth failed |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Generic resource not found |
| `IMAGE_NOT_FOUND` | 404 | No READY image for challenge_id |
| `INSTANCE_NOT_FOUND` | 404 | No instance with that ID |
| `BUILD_NOT_FOUND` | 404 | No build job with that ID |
| `INSTANCE_EXISTS` | 409 | Team already has active instance |
| `NOT_RUNNING` | 409 | Instance not in RUNNING state |
| `MAX_EXTENSIONS_REACHED` | 400 | Extension limit hit |
| `NO_CAPACITY` | 503 | Port pool or instance limit exhausted |
| `CONTAINER_FAILED` | 503 | Docker failed to start the container |
| `BAD_REQUEST` | 400 | Malformed request body |
| `VALIDATION_ERROR` | 422 | Field validation failed |
| `NO_ZIP_SOURCE` | 400 | Neither ZIP bytes nor zip_url provided |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 7. Quick Reference

### Minimum headers for a HMAC-authenticated POST

```
X-Agent-Key:   key_abc123
X-Timestamp:   1717200000
X-Signature:   a3f8b2c1d4e5f6...
Content-Type:  application/json
```

### Minimum headers for a HMAC-authenticated GET

```
X-Agent-Key:   key_abc123
X-Timestamp:   1717200000
X-Signature:   <sign with body=b"">
```

### Instance ID format

Instance IDs are generated deterministically from `challenge_id` and `team_id`:

```
ctf_{sanitized_challenge_id}_{sanitized_team_prefix}
```

Where `sanitized` means only `[A-Za-z0-9_.-]` characters kept, truncated to 24
chars. If that ID is already taken by a historical record, a 6-hex-char suffix
is appended: `ctf_sqli_550e8400_a1b2c3`.

### Port range

Challenge containers are mapped to host ports in the range `PORT_MIN–PORT_MAX`
(default `32000–33000`). These ports must be open on the worker server's
firewall for player access.
