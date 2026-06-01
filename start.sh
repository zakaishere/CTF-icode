#!/usr/bin/env bash
# =============================================================================
#  icode-ctf — start script
#  Loads .env, starts Spring Boot backend + Next.js frontend.
#
#  Usage:  ./start.sh
#  Stop:   ./stop.sh  (or kill PIDs in /tmp/backend.pid and /tmp/frontend.pid)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found at $ENV_FILE"
  echo "Copy .env.example to .env and fill in the required values."
  exit 1
fi

# Export all vars from .env (ignores blank lines and comments)
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  export "$key"="$value"
done < "$ENV_FILE"

# Validate required secrets
if [[ -z "${JWT_SECRET:-}" || "${JWT_SECRET}" == *"CHANGE_ME"* ]]; then
  echo "ERROR: JWT_SECRET is not set or is a placeholder."
  echo "Generate one with: openssl rand -base64 32"
  exit 1
fi
if [[ -z "${CTF_FLAG_SECRET:-}" || "${CTF_FLAG_SECRET}" == *"CHANGE_ME"* ]]; then
  echo "ERROR: CTF_FLAG_SECRET is not set or is a placeholder."
  echo "Generate one with: openssl rand -base64 32"
  exit 1
fi

echo "✓ Secrets validated"

# Ensure upload directory exists
mkdir -p "${CTF_UPLOAD_PATH:-/tmp/ctf-uploads}"

# ── Backend ──────────────────────────────────────────────────────────────────
JAR="$SCRIPT_DIR/Backend/target/icode-ctf-backend-0.0.1-SNAPSHOT.jar"

if [ ! -f "$JAR" ]; then
  echo "JAR not found — building..."
  cd "$SCRIPT_DIR/Backend"
  mvn clean package -DskipTests -q
  cd "$SCRIPT_DIR"
fi

pkill -f "icode-ctf-backend" 2>/dev/null || true
sleep 1

echo "Starting backend on port ${SERVER_PORT:-8080}..."
nohup java -jar "$JAR" \
  --management.health.mail.enabled=false \
  > /tmp/backend.log 2>&1 &
echo $! > /tmp/backend.pid

# Wait for healthy
echo -n "Waiting for backend"
for i in $(seq 1 40); do
  if curl -s "http://localhost:${SERVER_PORT:-8080}/api/actuator/health" 2>/dev/null | grep -q '"UP"'; then
    echo " ✓ UP"
    break
  fi
  echo -n "."
  sleep 1
done

# ── Frontend ──────────────────────────────────────────────────────────────────
pkill -f "next dev\|next start" 2>/dev/null || true
sleep 1

echo "Starting frontend on port 3000..."
cd "$SCRIPT_DIR/Frontend"
nohup npm run dev > /tmp/frontend.log 2>&1 &
echo $! > /tmp/frontend.pid

echo -n "Waiting for frontend"
for i in $(seq 1 30); do
  if curl -s http://localhost:3000 2>/dev/null | grep -q "html"; then
    echo " ✓ UP"
    break
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "════════════════════════════════════════"
echo "  icode-ctf is running"
echo "  Backend  → http://localhost:${SERVER_PORT:-8080}"
echo "  Frontend → http://localhost:3000"
echo "  Logs:    /tmp/backend.log  /tmp/frontend.log"
echo "════════════════════════════════════════"
