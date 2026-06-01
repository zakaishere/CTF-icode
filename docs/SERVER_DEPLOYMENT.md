# icode-ctf — Server Deployment Guide

This document covers everything you need to go from a blank Ubuntu server to a
running icode-ctf instance. Follow the steps in order.

---

## 1. Server Requirements

| Resource | Minimum | Recommended (100 users) |
|----------|---------|------------------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 30 GB | 80 GB (Docker images + DB) |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Open ports | 80, 443 (optional), 32000–33000 | same |

Port **32000–33000** must be open in your firewall — challenge containers
bind to this range and students connect to them directly.

---

## 2. Install Dependencies (once, on a fresh server)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker (official method)
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
newgrp docker                          # apply group without logout

# Verify Docker works
docker run --rm hello-world

# Install make (for Makefile shortcuts)
sudo apt install -y make git
```

> After `newgrp docker` you must open a **new terminal** for the docker group
> to take effect. You should be able to run `docker ps` without sudo.

---

## 3. Clone the Repository

```bash
# Clone to your home directory (or /opt/icode-ctf for a shared install)
git clone <your-repo-url> ~/icode-ctf
cd ~/icode-ctf
```

---

## 4. Create the Upload Directory

The backend and the HOST Docker daemon must share the same absolute path for
challenge ZIP uploads. This directory must exist on the server BEFORE you start
the containers.

```bash
sudo mkdir -p /data/ctf-uploads
sudo chown $USER:$USER /data/ctf-uploads
chmod 755 /data/ctf-uploads
```

> **Why this matters:** When a teacher uploads a challenge ZIP, the backend
> saves it to `/data/ctf-uploads/` inside the container. When it tells the
> HOST Docker daemon to `docker build` that ZIP, the daemon looks for the path
> on the HOST filesystem. If the paths don't match, the build fails with
> "no such file or directory".

---

## 5. Configure the Environment

```bash
cd ~/icode-ctf
cp .env.example .env
nano .env          # or vim, your choice
```

Fill in every field marked below. The others have safe defaults.

### 5.1 Required — app will not start without these

```env
# Generate with:  openssl rand -base64 32
JWT_SECRET=<paste generated value here>
CTF_FLAG_SECRET=<paste generated value here>

# Set a real password
DB_PASSWORD=<choose a strong password>
```

Generate secrets right now:
```bash
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "CTF_FLAG_SECRET=$(openssl rand -base64 32)"
```

### 5.2 Required — set to your server's real values

```env
# Your server's public IP or domain name
# Students connect to challenge containers at this address
CTF_INSTANCE_HOST=YOUR_SERVER_IP_OR_DOMAIN

# The domain (or IP) your frontend will be served from
# Used by the browser to allow API requests
CORS_ALLOWED_ORIGINS=http://YOUR_SERVER_IP_OR_DOMAIN

# Path for challenge ZIPs — must match the mkdir you did above
CTF_UPLOAD_PATH=/data/ctf-uploads
```

### 5.3 Email verification (set to false for real events)

```env
# false = students must verify email after registration (recommended)
# true  = skip verification (use only for testing)
APP_SECURITY_DISABLE_VERIFICATION=false

# SMTP credentials (needed when disable-verification=false)
MAIL_HOST=smtp.gmail.com
MAIL_USERNAME=your-event-email@gmail.com
MAIL_PASSWORD=your-gmail-app-password
```

> To get a Gmail app password: Google Account → Security → 2-Step Verification
> → App passwords → generate one for "Mail".

### 5.4 Performance tuning for 100 users

```env
# Raise from default 20 to handle simultaneous flag submissions
DB_POOL_SIZE=50
```

### 5.5 Complete .env example for a real server

```env
# ── SECRETS (REQUIRED) ───────────────────────────────────────────────────────
JWT_SECRET=<openssl rand -base64 32>
CTF_FLAG_SECRET=<openssl rand -base64 32>

# ── CORS ─────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS=http://192.168.1.100

# ── DATABASE ─────────────────────────────────────────────────────────────────
DB_NAME=icode_ctf
DB_USERNAME=icode_user
DB_PASSWORD=SomethingStrong123!
DB_URL=jdbc:postgresql://db:5432/icode_ctf?currentSchema=icode_ctf
DB_POOL_SIZE=50

# ── EMAIL ────────────────────────────────────────────────────────────────────
APP_SECURITY_DISABLE_VERIFICATION=false
MAIL_HOST=smtp.gmail.com
MAIL_USERNAME=ctf-event@gmail.com
MAIL_PASSWORD=abcd efgh ijkl mnop

# ── FILE STORAGE ─────────────────────────────────────────────────────────────
CTF_UPLOAD_PATH=/data/ctf-uploads

# ── INSTANCE MANAGEMENT ──────────────────────────────────────────────────────
CTF_INSTANCE_HOST=192.168.1.100
CTF_PORT_MIN=32000
CTF_PORT_MAX=33000

# ── DOCKER ───────────────────────────────────────────────────────────────────
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_TLS_VERIFY=false

# ── SERVER ───────────────────────────────────────────────────────────────────
SERVER_PORT=8080
JWT_EXPIRY_MS=86400000
HTTP_PORT=80

# ── FRONTEND ─────────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_BASE_URL=
```

---

## 6. Start the Platform

```bash
cd ~/icode-ctf
make up
```

This runs `docker compose up -d --build`. First run takes **10–20 minutes**
because it downloads base images and compiles the backend (Maven) and
frontend (Next.js). Subsequent starts take 30 seconds.

Watch the build progress:
```bash
make logs
```

Wait until you see all four containers healthy:
```bash
make ps
```

Expected output:
```
NAME             IMAGE                    STATUS
icode-db         postgres:16-alpine       Up X minutes (healthy)
icode-backend    icode-ctf-backend        Up X minutes (healthy)
icode-frontend   icode-ctf-frontend       Up X minutes (healthy)
icode-nginx      icode-ctf-nginx          Up X minutes (healthy)
```

> The backend takes 60–90 seconds to become healthy because it waits for
> Postgres to be ready before starting, then validates the schema.

---

## 7. Verify Everything Works

Run each of these from the server:

```bash
# 1. nginx is reachable (frontend home page)
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost/
# Expected: HTTP 200

# 2. Backend health
curl -s http://localhost/api/actuator/health
# Expected: {"status":"UP"}

# 3. Login with the default admin account
curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@icode-ctf.local","password":"Admin1234!"}' \
  | python3 -m json.tool
# Expected: {"token":"eyJ...","role":"ADMIN",...}

# 4. All containers on the same network
docker network inspect icode-net --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
# Expected: 4 lines, each with a different IP

# 5. Docker socket accessible from backend (needed for challenge instances)
docker exec icode-backend ls /var/run/docker.sock
# Expected: /var/run/docker.sock

# 6. Upload directory is accessible
docker exec icode-backend ls -la /data/ctf-uploads
# Expected: directory listing (empty or with files)
```

---

## 8. First Login — Change the Admin Password

1. Open `http://YOUR_SERVER_IP` in a browser
2. Log in with `admin@icode-ctf.local` / `Admin1234!`
3. Immediately change the password
4. Create your teacher/admin accounts

---

## 9. Useful Commands

```bash
# Start everything (builds if images are missing)
make up

# Stop everything (keeps data)
make down

# View all logs live
make logs

# View backend logs only
make logs-b

# View frontend logs only
make logs-f

# Show container status
make ps

# Rebuild after code changes
make rebuild

# Open a shell in the backend container
make shell-b

# Open psql in the database container
make shell-db

# DANGEROUS: stop + delete all data (volumes)
make clean
```

---

## 10. Firewall Configuration

Open these ports on your server:

```bash
# For Ubuntu with ufw:
sudo ufw allow 80/tcp        # nginx (HTTP)
sudo ufw allow 22/tcp        # SSH (keep this!)
sudo ufw allow 32000:33000/tcp  # CTF challenge containers

# Verify
sudo ufw status
```

If you use `iptables` directly or a cloud provider's security group, allow
the same ports: **80**, **22**, **32000–33000 TCP**.

> Port **443 (HTTPS)** — not configured yet. If you add an SSL certificate
> later, you need to update `nginx/nginx.conf` and rebuild nginx.

---

## 11. Data Backup

The only stateful data is in the Postgres database volume (`icode-db-data`)
and the upload directory (`/data/ctf-uploads`).

```bash
# Backup the database
docker exec icode-db pg_dump \
  -U icode_user icode_ctf \
  > ~/backup-$(date +%Y%m%d-%H%M).sql

# Backup the uploads (challenge ZIPs)
tar -czf ~/uploads-$(date +%Y%m%d).tar.gz /data/ctf-uploads/
```

Run these before any `make clean` or `make rebuild`.

---

## 12. Common Problems and Fixes

### Backend stays in "starting" state for more than 3 minutes

```bash
make logs-b
```

Look for one of these:
- `JWT_SECRET is not set` → check your `.env`, re-run `make up`
- `Unable to acquire JDBC Connection` → DB not ready yet, wait 30 more seconds
- `Schema-validation: missing table` → DB init script didn't run, see below

**DB init script didn't run:**
This happens if the volume already exists from a previous run.
```bash
make clean     # ⚠ deletes all data
make up
```

---

### "Connection refused" when accessing the platform

```bash
make ps
# Check that icode-nginx shows "healthy"
docker logs icode-nginx --tail 20
```

If nginx shows an upstream error (`502 Bad Gateway`), the backend or frontend
is not ready yet. Wait 90 seconds and try again.

---

### Challenge instance fails to start

The backend spawns containers on the HOST Docker. Common causes:

1. **Upload path mismatch** — verify the path is the same on host and in container:
   ```bash
   grep CTF_UPLOAD_PATH .env
   docker exec icode-backend env | grep CTF_UPLOAD_PATH
   # Both must show the same path
   ```

2. **Port range blocked** — verify 32000–33000 are open:
   ```bash
   sudo ufw status | grep 32000
   ```

3. **Docker socket permission** — the backend runs as a non-root user:
   ```bash
   docker exec icode-backend ls -la /var/run/docker.sock
   # If permission denied, add the appuser to the docker group:
   # Edit Backend/Dockerfile — add: RUN addgroup appuser docker
   # Then: make rebuild
   ```

---

### Students can't reach challenge containers

Containers bind to ports 32000–33000 on the HOST. The student's browser
connects to `CTF_INSTANCE_HOST:PORT`.

Check:
```bash
# Is CTF_INSTANCE_HOST set to the server's PUBLIC IP?
grep CTF_INSTANCE_HOST .env

# Is the port actually open on the server?
docker ps | grep ctf-     # lists running challenge containers
```

---

### Out of disk space

Docker images + challenge images can fill up fast.
```bash
# See what's using space
docker system df

# Remove unused images (not running containers)
docker image prune -f

# Remove stopped challenge containers
docker container prune -f
```

---

## 13. Pre-Event Checklist

Run through this the day before your CTF:

```
[ ] Server is reachable at your domain/IP
[ ] curl http://YOUR_IP/api/actuator/health returns {"status":"UP"}
[ ] Admin login works and password is changed
[ ] CORS_ALLOWED_ORIGINS matches the URL students will use
[ ] APP_SECURITY_DISABLE_VERIFICATION=false (email required)
[ ] Mail server tested (send a test registration)
[ ] Ports 32000-33000 are open in the firewall
[ ] CTF_INSTANCE_HOST is the PUBLIC IP (not 127.0.0.1)
[ ] /data/ctf-uploads exists and is writable
[ ] Database backup taken
[ ] make ps shows all 4 containers healthy
[ ] At least one challenge is published and visible to a test student account
[ ] Test a full flow: register → join team → open challenge → start instance → submit flag
```

---

## 14. After the Event

```bash
# Export results
make shell-db
# Inside psql:
\COPY (SELECT t.name, SUM(a.value) as score FROM ctf_awards a JOIN ctf_teams t ON t.id=a.team_id WHERE a.competition_id='YOUR_COMP_ID' GROUP BY t.name ORDER BY score DESC) TO '/tmp/results.csv' CSV HEADER;
exit

# Copy the file out
docker cp icode-db:/tmp/results.csv ~/results.csv

# Stop everything
make down
```
