# How Ports Work in iCODE CTF Challenges

## The simple version

When a player starts your challenge, they get a unique random port to connect
to. You do not need to worry about that port — the platform handles it.

The only thing you need to do is tell the platform which port your program
listens on **inside its container**. You do this with one line in your Dockerfile:

```dockerfile
EXPOSE 4444
```

That's it. The platform reads that number automatically when you upload your
ZIP. You do not type it anywhere in the form.

---

## The two ports explained

Every running challenge has exactly **two** port numbers in play at the same time.
They are completely different things.

```
┌─────────────────────────────────────────────────────────────────┐
│                         HOST MACHINE                            │
│                                                                 │
│   Player connects to:                                           │
│   localhost : 32847   ◄── random host port (platform picks it) │
│        │                                                        │
│        │  (Docker forwards traffic)                             │
│        ▼                                                        │
│   ┌─────────────────────────────────┐                          │
│   │       DOCKER CONTAINER          │                          │
│   │                                 │                          │
│   │   your program listens on:      │                          │
│   │   0.0.0.0 : 4444  ◄── container port (you set with EXPOSE) │
│   └─────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

| Port | Who picks it | Where it lives | What it's for |
|---|---|---|---|
| **Host port** (e.g. `32847`) | Platform — random, different per player | Outside the container, on the server | What the player types into `nc` or their browser |
| **Container port** (e.g. `4444`) | You — written in your `EXPOSE` line | Inside the container | Where your binary/app actually listens |

The platform maps `32847 → 4444` automatically so that when the player connects
to `32847`, their traffic arrives at your program's `4444`.

---

## What you must do

### 1. Add an EXPOSE line to your Dockerfile

```dockerfile
EXPOSE 4444        # for a pwn binary using socat
EXPOSE 8080        # for a web app
EXPOSE 1337        # any port you like — just be consistent
```

The number in `EXPOSE` must match the port your program actually listens on
inside the container.

### 2. Make your program listen on `0.0.0.0`, not `127.0.0.1`

`127.0.0.1` means "loopback — only accept connections from processes running
inside the same container". The platform connects from outside the container,
so `127.0.0.1` makes the challenge unreachable.

`0.0.0.0` means "accept connections from anywhere". Use this.

**socat (pwn):**
```dockerfile
CMD ["socat", "TCP-LISTEN:4444,reuseaddr,fork", "EXEC:./challenge,pty,stderr"]
#                              ^^^^
#                              This binds to 0.0.0.0 by default
```

**Python Flask (web):**
```python
app.run(host="0.0.0.0", port=8080)
#             ^^^^^^^
#             required — not "127.0.0.1"
```

**Node.js (web):**
```javascript
server.listen(8080, "0.0.0.0");
//                   ^^^^^^^
//                   required
```

### 3. Do nothing else for ports

You do not fill in a port number in the challenge creation form. The platform
reads `EXPOSE` from your Dockerfile when you upload the ZIP and saves the
value automatically.

---

## What the platform does automatically

When you upload a ZIP:

1. Extracts the Dockerfile.
2. Reads the first `EXPOSE <port>` line.
3. Saves that port to the challenge's database record immediately.
4. Builds the Docker image.
5. After the build, inspects the built image's metadata to confirm the port
   (the post-build value takes precedence — this catches edge cases like
   multi-stage Dockerfiles where the final stage's EXPOSE differs from earlier
   stages).

When a player requests an instance:

1. Picks a free random host port (between `32000` and `33000`).
2. Runs: `docker run -p <randomHostPort>:<containerPort> ...`
3. Waits for `<randomHostPort>` to accept connections (up to 15 seconds).
4. Tells the player: `connect to localhost:<randomHostPort>`.

---

## Edge cases

### I forgot to add EXPOSE

The platform falls back to port `1337`. Your challenge will only work if your
program also happens to listen on `1337`. If not, the instance will fail with:

> port 1337 is not accepting connections after 15 s

**Fix:** Add `EXPOSE <port>` to your Dockerfile matching what your program uses,
then re-upload the ZIP (a rebuild is triggered automatically).

### My Dockerfile has multiple EXPOSE lines

The platform uses the **first** one. Example:

```dockerfile
EXPOSE 8080    ← this one is used
EXPOSE 8443
```

If you need to expose multiple ports, put the main challenge port first.

### My challenge is HTTP (web), not TCP (pwn)

The `EXPOSE` + `0.0.0.0` rules are identical. The difference is only in how
the player connects:

- **TCP** → player runs `nc localhost 32847`
- **HTTP** → player opens `http://localhost:32847` in a browser

You set the connection type in the challenge form (HTTP or TCP). The port
handling is the same for both.

### The port badge in the admin panel shows the wrong number

The badge shows the value currently stored in the database. If you just
re-uploaded a ZIP with a different `EXPOSE`, wait for the build to finish —
the badge updates when the build completes. Refresh the page if it doesn't
update automatically.

---

## Quick checklist before uploading

- [ ] `EXPOSE <port>` is in my Dockerfile
- [ ] The port in `EXPOSE` matches the port my program binds to
- [ ] My program binds to `0.0.0.0`, not `127.0.0.1` or `localhost`
- [ ] For pwn: `socat` uses `,fork` (without it, only one player can ever connect)
- [ ] `Dockerfile` is at the root of the ZIP, not inside a sub-folder

---

## Example: minimal pwn Dockerfile

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends socat \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m ctf
WORKDIR /home/ctf
COPY --chown=ctf:ctf challenge ./challenge
RUN chmod +x ./challenge

ENV FLAG="CTF{PLACEHOLDER}"

EXPOSE 4444

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
    CMD socat /dev/null TCP:localhost:4444 || exit 1

USER ctf
CMD ["socat", "TCP-LISTEN:4444,reuseaddr,fork", "EXEC:./challenge,pty,stderr,setsid,sigint,sane"]
```

## Example: minimal web Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV FLAG="CTF{PLACEHOLDER}"

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
```

The server **must** listen on `0.0.0.0:3000`:

```javascript
// server.js
const FLAG = process.env.FLAG ?? "CTF{PLACEHOLDER}";
app.listen(3000, "0.0.0.0");   // ← 0.0.0.0, not localhost
```
