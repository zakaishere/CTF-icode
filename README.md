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

## Quick Start

### Prerequisites

- Java 17+
- PostgreSQL 16
- Node.js 20+
- Docker (for CTF challenge instances)

### 1 — Database

```sql
-- Connect as a superuser
CREATE SCHEMA IF NOT EXISTS icode_ctf;
-- Then run:
psql -U psp_user -d psp_db -f Backend/src/main/resources/db/schema.sql
```

### 2 — Backend

```bash
cd Backend
cp ../../.env.example .env          # fill in secrets
./mvnw spring-boot:run
# → http://localhost:8080
```

Default seed admin (dev profile):  
`admin@icode-ctf.local` / `Admin1234!`

### 3 — Frontend

```bash
cd Frontend
npm install
cp ../.env.example .env.local       # NEXT_PUBLIC_API_BASE_URL usually blank
npm run dev
# → http://localhost:3000
```

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
