# ── iCode CTF — PWN challenge Dockerfile template ────────────────────────────
#
# HOW TO USE
# ----------
# 1. Replace "challenge" with your binary name everywhere it appears.
# 2. Change CHALLENGE_PORT (4444) to your preferred port.
# 3. Zip the folder contents (not the folder itself) so that Dockerfile sits at
#    the ZIP root, then upload via the admin panel.
#
# CRITICAL RULES (read before changing anything)
# -----------------------------------------------
# • ONE RUN for apt-get — Docker caches each RUN as a separate layer.
#   If you split apt-get install across multiple RUN commands, every build
#   re-downloads every package from scratch (no cache hit). Consolidate ALL
#   packages into the single RUN below.
# • socat MUST use the 'fork' option — without it socat exits after the first
#   connection, making the instance permanently dead for every player who
#   connects after the first. The platform detects this and marks the instance
#   FAILED, but only after wasting a port and a container slot.
# • Bind on 0.0.0.0, NOT 127.0.0.1 — the platform connects from the host
#   machine (outside the container). 127.0.0.1 inside the container is
#   unreachable from outside.
# • EXPOSE must match the port socat/xinetd actually listens on — the build
#   pipeline auto-detects this and sets the challenge's connection port.
# • chmod +x your binary — files copied into an image lose their executable
#   bit. Without it the EXEC: in socat fails with "permission denied".

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ── ONE consolidated apt-get layer ───────────────────────────────────────────
# Add every package you need here. Never add a second apt-get install RUN.
# After the build succeeds, this entire layer is cached and subsequent builds
# (or rebuilds after a flag change) skip package installation entirely.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        socat \
    && rm -rf /var/lib/apt/lists/*

# ── Unprivileged user ─────────────────────────────────────────────────────────
RUN useradd -m -s /bin/sh ctf

WORKDIR /home/ctf

# ── Binary + flag ─────────────────────────────────────────────────────────────
# Copy the compiled binary and make it executable.
# chmod +x is mandatory — Docker does not preserve the executable bit.
COPY --chown=ctf:ctf challenge ./challenge
RUN chmod +x ./challenge

# The platform injects the real flag at container start via the FLAG env var.
# This line just sets a placeholder so the binary can be tested locally with
#   docker run -e FLAG=CTF{test} <image>
ENV FLAG="CTF{PLACEHOLDER}"

# ── Network ───────────────────────────────────────────────────────────────────
# Must match the port socat listens on below.
# The build pipeline reads this EXPOSE and sets the challenge connection port
# automatically — no manual port configuration required in the admin panel.
EXPOSE 4444

# ── Health check ──────────────────────────────────────────────────────────────
# The platform waits for this check to pass before marking the instance RUNNING.
# socat probes itself: /dev/null connects to the listening port and disconnects.
# Adjust --start-period if your binary takes longer than 10 s to initialise.
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
    CMD socat /dev/null TCP:localhost:4444 || exit 1

# ── Entrypoint ────────────────────────────────────────────────────────────────
# socat options:
#   TCP-LISTEN:4444  — listen on port 4444, bound to 0.0.0.0 (all interfaces)
#   reuseaddr        — allow fast restart without TIME_WAIT delays
#   fork             — REQUIRED: fork a child for each connection so the
#                      parent keeps accepting; without this only one player
#                      can ever use the instance
#   EXEC:./challenge — run the binary for each connection
#   pty              — allocate a pseudo-terminal (needed for readline/curses)
#   stderr           — merge stderr into the pty so players see error output
#   setsid           — put the child in a new session (clean signal handling)
#   sigint           — forward Ctrl-C from the player to the child process
#   sane             — reset terminal to sane defaults after each connection
USER ctf
CMD ["socat", \
     "TCP-LISTEN:4444,reuseaddr,fork", \
     "EXEC:./challenge,pty,stderr,setsid,sigint,sane"]
