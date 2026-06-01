# =============================================================================
#  icode-ctf Frontend — multi-stage Docker build
#  next.config.ts has output: "standalone" → produces a self-contained server
#  Stage 1 (deps):    install npm dependencies
#  Stage 2 (builder): run next build → .next/standalone + .next/static
#  Stage 3 (runner):  minimal node:20-alpine with only the standalone output
# =============================================================================

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

# --legacy-peer-deps: next-themes@0.3.0 hasn't declared React 19 support yet.
# --mount=type=cache: reuses the npm download cache across builds.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: run ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# next build with output:"standalone" produces:
#   .next/standalone/  — self-contained Node server (server.js + node_modules)
#   .next/static/      — static assets (CSS, JS chunks)
#   public/            — public/ files are NOT copied into standalone automatically
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public           ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ || exit 1

# server.js is emitted at the standalone root by Next.js
CMD ["node", "server.js"]
