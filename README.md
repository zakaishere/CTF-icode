# icode-ctf

Standalone Capture The Flag platform extracted from the PSP academic platform.

## Architecture

```
icode-ctf/
├── Backend/   Spring Boot 3.2.4 + PostgreSQL
└── Frontend/  Next.js 16 + React 19
```

**Two roles:** `ADMIN` (creates/manages competitions & challenges) · `PLAYER` (registers, forms a team, submits flags)

---

## Run it (that's it)

```bash
git clone <repo>
cd CTF-icode
docker compose up -d
```

Open **http://localhost** and log in:

```
admin@icode-ctf.local / Admin123!
```

That's the whole setup — no `.env`, no manual database, no secret generation.
Everything has a safe default. The database schema and default admin are
created automatically on first boot, and email verification is disabled by
default so you can register players without SMTP.

> First build takes a few minutes. Needs Docker + Docker Compose, ~2 GB RAM,
> and ports `80` and `32000–33000` open.

### Common commands

| Command | What it does |
|---|---|
| `docker compose up -d` | Start everything |
| `docker compose logs -f` | Watch live logs |
| `docker compose down` | Stop everything |
| `docker compose up -d --build` | Update after `git pull` |
| `docker compose down -v` | ⚠ Stop **and delete all data** |

(`make up`, `make logs-b`, `make down`, etc. are shortcuts for the same.)

### Production deployment

Copy `.env.example` to `.env` and set at least your public IP so challenge
instances are reachable, plus strong secrets:

```bash
cp .env.example .env
nano .env        # set CTF_INSTANCE_HOST, JWT_SECRET, CTF_FLAG_SECRET, DB_PASSWORD
docker compose up -d --build
```

Then change the default admin password immediately after first login.

---

## Local development (without Docker)

Prerequisites: Java 17+, PostgreSQL 16, Node.js 20+, Docker (for challenge
instances).

```bash
# Backend  → http://localhost:8080
cd Backend && ./mvnw spring-boot:run

# Frontend → http://localhost:3000
cd Frontend && npm install && npm run dev
```

The backend reads config from environment variables (see `.env.example`); the
defaults in `application.yml` point at a local Postgres on `localhost:5432`.

---

## Player Flow

1. `/auth` → Register or Sign in  
2. `/welcome` → Browse competitions  
3. `/ctf/competitions/:id` → Join / create a team → solve challenges → scoreboard

## Admin Flow

1. `/auth` → Sign in as ADMIN  
2. `/admin` → Dashboard  
3. `/admin/ctf/competitions/new` → Create competition  
4. `/admin/ctf/competitions/:id/edit` → Add challenges, manage lifecycle (start / pause / freeze / end)

---

## Environment Variables

See `.env.example` for the full list.

| Variable | Description |
|----------|-------------|
| `DB_URL` | JDBC URL with `currentSchema=icode_ctf` |
| `JWT_SECRET` | 256-bit Base64 secret |
| `CTF_FLAG_SECRET` | HMAC key for dynamic flags |
| `DOCKER_HOST` | Docker socket path |
| `MAIL_USERNAME/PASSWORD` | SMTP credentials for email OTP |
