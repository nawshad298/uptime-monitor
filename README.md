# Uptime & Incident Monitoring API

A self-hosted, minimal version of UptimeRobot / Better Stack. You register
services (a name + URL), a background worker pings them on a schedule,
incidents auto-open after 3 consecutive failures and auto-resolve on the
next success, and a public status page shows uptime % over 24h/7d/30d.

This app is the "real application" running inside the 3 DevOps projects
(CI/CD pipeline, blue-green deployment, IaC + monitoring) — it exists so
those projects have real database logic, real security surface, and real
metrics to work with, instead of a hello-world route.

## Architecture

Two processes, one codebase, sharing one Postgres database:
- **API** (`src/server.js`) — stateless, safe to run multiple replicas of (this is what gets blue-green deployed in Project 2)
- **Worker** (`src/worker.js`) — polls services and writes checks/incidents. Runs as **exactly one instance** — running two would double-ping every service and double-fire incidents. This asymmetry is worth mentioning in an interview: not everything in a system can be horizontally scaled the same way.

## Data model
- `users` — email + bcrypt password hash
- `services` — a URL to watch, owned by a user
- `checks` — one row per ping: status, status code, response time, error
- `incidents` — auto-opened/resolved based on consecutive check results

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create an account |
| POST | `/api/auth/login` | — | Get a JWT (rate-limited: 10/15min) |
| POST | `/api/services` | required | Register a URL to monitor |
| GET | `/api/services` | required | List your services + latest status |
| GET | `/api/services/:id` | required | Get one service |
| DELETE | `/api/services/:id` | required | Stop monitoring a service |
| GET | `/api/services/:id/checks` | required | Recent check history |
| GET | `/api/services/:id/incidents` | required | Incident history |
| GET | `/api/status/:serviceId` | — (public) | Public status page: uptime % + current status |
| GET | `/health` | — | Liveness probe |
| GET | `/metrics` | — | Prometheus metrics |

## Running locally

```bash
cp .env.example .env
docker compose up -d --build postgres
docker compose run --rm migrate   # apply schema before starting the app
docker compose up -d --build
```

Register a user and add a service:
```bash
curl -X POST localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"supersecret123"}'

TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"supersecret123"}' | jq -r .token)

curl -X POST localhost:3000/api/services \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My Site","url":"https://example.com","check_interval_seconds":30}'
```

Wait ~30s for the worker to check it, then:
```bash
curl localhost:3000/api/status/<service-id>
```

## Running tests

Tests hit a **real Postgres**, not a mock:
```bash
docker compose up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/uptime_monitor \
JWT_SECRET=test-secret \
npm test
```
In CI, GitHub Actions spins up its own throwaway Postgres via a `services:`
block in the workflow — see `.github/workflows/pipeline.yml`.

## Security measures already in place
- Passwords hashed with bcrypt (cost factor 12)
- JWT with a 2-hour expiry
- Login endpoint rate-limited (10 attempts / 15 min per IP) — brute-force protection
- Generic "Invalid email or password" on login failure — no user enumeration
- `helmet` for standard security headers
- All SQL is parameterized — no injection surface
- Request body size capped at 10kb
- Stack traces never sent to clients

## Stretch goals (good "future work" talking points)
- Slack/webhook alerts on incident open/close
- Multi-tenant organizations instead of single-owner services
- Redis-backed job queue for the worker instead of a simple polling loop
- Distributed lock so the worker *could* safely run more than one replica
