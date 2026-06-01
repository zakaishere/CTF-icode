#!/usr/bin/env bash
# icode-ctf — first-time setup
# Run once on a fresh server: bash setup.sh
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo ""
echo "  icode-ctf setup"
echo "=================="
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo -e "${RED}❌  Docker is not installed.${NC}"
  echo "    curl -fsSL https://get.docker.com | sh"
  exit 1
fi

# ── Upload directory ──────────────────────────────────────────────────────────
echo -e "${YELLOW}→ Creating /data/ctf-uploads...${NC}"
mkdir -p /data/ctf-uploads && chmod 777 /data/ctf-uploads
echo -e "${GREEN}✅ /data/ctf-uploads ready${NC}"
echo ""

# ── .env ──────────────────────────────────────────────────────────────────────
if [ -f .env ]; then
  echo -e "${YELLOW}→ .env already exists — skipping. Delete it to reconfigure.${NC}"
else
  echo "A few questions to generate your .env:"
  echo ""

  # DB password
  read -rp "  DB password (Enter = auto-generate): " DB_PASSWORD
  [ -z "$DB_PASSWORD" ] && DB_PASSWORD=$(openssl rand -hex 16) && echo "     → $DB_PASSWORD"

  # Secrets — always auto-generated
  JWT_SECRET=$(openssl rand -base64 32)
  CTF_FLAG_SECRET=$(openssl rand -base64 32)
  echo "  JWT secret:       auto-generated ✓"
  echo "  CTF flag secret:  auto-generated ✓"

  # Server IP
  DETECTED_IP=$(curl -s --connect-timeout 3 ifconfig.me 2>/dev/null \
                || hostname -I 2>/dev/null | awk '{print $1}' \
                || echo "127.0.0.1")
  read -rp "  Server public IP [$DETECTED_IP]: " CTF_INSTANCE_HOST
  CTF_INSTANCE_HOST=${CTF_INSTANCE_HOST:-$DETECTED_IP}

  # Email verification
  read -rp "  Disable email verification for testing? [Y/n]: " DISABLE_VERIFY
  [[ "${DISABLE_VERIFY:-Y}" =~ ^[Nn]$ ]] \
    && APP_SECURITY_DISABLE_VERIFICATION=false \
    || APP_SECURITY_DISABLE_VERIFICATION=true

  cat > .env <<EOF
DB_NAME=icode_ctf
DB_USERNAME=icode_user
DB_PASSWORD=${DB_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY_MS=86400000

CTF_FLAG_SECRET=${CTF_FLAG_SECRET}

CTF_INSTANCE_HOST=${CTF_INSTANCE_HOST}
CTF_UPLOAD_PATH=/data/ctf-uploads
CTF_PORT_MIN=32000
CTF_PORT_MAX=33000

APP_SECURITY_DISABLE_VERIFICATION=${APP_SECURITY_DISABLE_VERIFICATION}

MAIL_HOST=smtp.gmail.com
MAIL_USERNAME=
MAIL_PASSWORD=

CORS_ALLOWED_ORIGINS=http://${CTF_INSTANCE_HOST},http://localhost

HTTP_PORT=80

DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_TLS_VERIFY=false
DOCKER_CERT_PATH=
EOF

  echo ""
  echo -e "${GREEN}✅ .env created${NC}"
fi

# ── Start ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}→ Building and starting the platform...${NC}"
echo "   (first build takes a few minutes)"
echo ""
docker compose up -d --build

echo ""
echo -e "${GREEN}✅ Done! Platform is starting.${NC}"
echo ""
echo "   Logs:    docker compose logs -f"
echo "   Status:  docker compose ps"
echo "   Stop:    docker compose down"
echo ""
