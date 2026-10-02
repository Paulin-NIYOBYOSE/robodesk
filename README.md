# RoboDesk

**Robotics Dataset Request & Operations Platform** — an internal tool that replaces the spreadsheet used to track dataset requests for robot teleoperation data.

Clients ask for datasets ("200 episodes of a robot arm picking cups by 30 Oct"). Operators fulfil requests by assigning recorded episodes. Clients then accept or reject each delivery.

Design reasoning, trade-offs and security notes are in **[NOTES.md](NOTES.md)**.

> **Reviewing?** Start with the **[10-minute reviewer guide](docs/REVIEWER_GUIDE.md)**: how to run it, demo videos, a click-through test plan with expected results, and a checklist mapping every requirement to its code and tests.

## Features

- **Roles enforced by the API:** clients see only their own requests; operators run the workflow; admins also manage users.
- **Request workflow** `submitted → in_progress → delivered → accepted | rejected → in_progress`, with every change audited (who, when, why).
- **Assignment rules:** only `good`/`usable` episodes; one request per episode, guaranteed by a database constraint even under concurrent clicks; no delivery until enough episodes are assigned.
- **Idempotent CSV import** (API upload or CLI) that cleans safe formatting issues, rejects questionable rows and reports every row it didn't import, with a reason.
- **Analytics** (episodes per day per robot, requests by status, median time to delivery, top tasks) computed entirely in PostgreSQL.
- **Stretch: background export** of each assigned episode, with retries, leases and per-episode status in the UI.
- A landing page that explains the platform, and role-specific dashboards with a live activity feed.
- Structured JSON request logs, `/health`, consistent JSON errors, responsive UI.

## Architecture

```
browser ──► nginx (frontend container) ──/api──► FastAPI (backend) ──► PostgreSQL
              static React build                    ▲
                                       export worker ┘ (same image, python -m app.worker)
```

- **backend/** — FastAPI + SQLAlchemy 2. Routes (`app/api`) stay thin; business rules live in `app/services` (the state machine is `services/workflow.py`). Schemas are Pydantic, and the schema is managed by Alembic (`migrations/`).
- **frontend/** — React + TypeScript (Vite), TanStack Query for server state, Tailwind for styling. nginx serves it and proxies `/api`, so the browser talks to a single origin.
- **seed/** — the supplied `users.json`, `episodes.csv` and generator, used as-is.

## Stack

| | |
|---|---|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, PyJWT, argon2-cffi, pytest |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query, Recharts, lucide-react, sonner |
| Database | PostgreSQL 17 (any version ≥ 14 works) |
| Infrastructure | Docker Compose, nginx, GitHub Actions |

## Running

Requirements: **Docker** with Compose v2.

```bash
docker compose up --build
```

- UI: <http://localhost:3000> (landing page; **Sign in** leads to the app)
- API docs (Swagger): <http://localhost:8000/docs>

On startup a one-shot `migrate` service applies migrations, creates the seed users and imports `seed/episodes.csv`. Every step is idempotent, so restarting is safe. Configuration has development defaults; copy `.env.example` to `.env` to change ports, credentials or the JWT secret. Set `SEED_EPISODES=false` to start with an empty episode table and try the import from the UI.

### Local development (without Docker)

With PostgreSQL running locally and an empty `robodesk` database:

```bash
cd backend
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
echo 'DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/robodesk' > .env   # git-ignored
.venv/bin/alembic upgrade head
.venv/bin/python -m app.cli seed-users ../seed/users.json
.venv/bin/python -m app.cli import-episodes ../seed/episodes.csv
.venv/bin/uvicorn app.main:app --reload --port 8000     # API
.venv/bin/python -m app.worker                          # export worker (second terminal)

cd ../frontend && npm install && npm run dev            # http://localhost:5173, proxies /api to :8000
```

The Vite dev server only proxies, so the API must be running on port 8000 first. Otherwise the UI shows "Cannot reach the server" and Vite logs `ECONNREFUSED`.

## Tests

```bash
docker compose run --build --rm tests
```

This runs 219 pytest tests against a real PostgreSQL database (`<db>_test`, built from the migrations on each run, so your development data is never touched). Without Docker, after the local setup above:

```bash
cd backend && .venv/bin/pytest
```

The tests focus on the rules that matter: authentication, authorization (including IDOR and a sweep asserting that every endpoint requires a token), every valid and invalid status transition for every role, the assignment rules including a real two-transaction race, import edge cases and idempotency, analytics correctness, and the export job's retry and stale-worker handling. CI (`.github/workflows/ci.yml`) also runs a migration drift check, the frontend lint/build, and a full `docker compose up` smoke test.

## Seed credentials

> **Development/test accounts only**, from `seed/users.json`. Passwords are stored as argon2id hashes.

| Role | Email | Password |
|---|---|---|
| Admin | admin@example.com | admin123 |
| Operator | ops1@example.com | ops123 |
| Operator | ops2@example.com | ops123 |
| Client (Acme Robotics) | client-a@example.com | client123 |
| Client (Beta Labs) | client-b@example.com | client123 |

## API

REST under `/api`, documented with OpenAPI at `/docs`. Authenticate with `POST /api/auth/login` and send `Authorization: Bearer <token>`. Errors are always `{"detail": "..."}` (422 validation errors list the fields).

| Endpoint | Who |
|---|---|
| `POST /api/auth/login`, `GET /api/auth/me` | anyone / signed in |
| `GET /api/requests` (filters: status, task, client, deadline; paginated), `GET /api/requests/summary`, `GET /api/requests/activity`, `GET /api/requests/{id}` | clients see their own only |
| `POST /api/requests` | client |
| `POST /api/requests/{id}/transition` | the role that owns that step |
| `POST /api/requests/{id}/accept`, `POST /api/requests/{id}/reject` | owning client |
| `GET /api/requests/{id}/assignments` | staff, owning client |
| `POST /api/requests/{id}/assignments`, `DELETE …/assignments/{episode_id}`, `POST …/{episode_id}/retry-export` | operator, admin |
| `GET /api/episodes` (task, quality, robot, availability, id prefix), `GET /api/episodes/facets`, `POST /api/episodes/import` | operator, admin |
| `GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD`, `GET /api/clients` | operator, admin |
| `GET /api/users`, `POST /api/users`, `PATCH /api/users/{id}` | admin |
| `GET /health` | unauthenticated (probe; reveals nothing) |

## Import

Upload a CSV from **Episodes → Import CSV** (up to 50 MB), or use the CLI, which has no size limit:

```bash
python3 seed/generate_episodes.py 200000 > seed/episodes_large.csv   # optional: a big clean file
docker compose cp seed/episodes_large.csv backend:/tmp/episodes.csv
docker compose exec backend python -m app.cli import-episodes /tmp/episodes.csv
```

`episode_id` (case-insensitive) is the idempotency key. Existing episodes are never duplicated or overwritten, so importing the same file twice is safe. Rows are inserted in batches with `ON CONFLICT DO NOTHING`. Anything that wasn't inserted is compared with the stored episode: an identical row is reported as a *skipped duplicate*, a different one as a *rejected conflict*. Whitespace, letter case and known date layouts are normalised (and counted); questionable values are rejected with a reason and line number. The supplied file gives **171 imported, 2 skipped duplicates, 16 rejected** (plus 2 blank lines ignored); importing it again gives 0 imported, 173 skipped and the same 16 rejected. Each decision is explained in [NOTES.md](NOTES.md#1-design).

## Analytics

`GET /api/analytics` runs three aggregate queries in PostgreSQL and returns only the aggregated rows: a `GROUP BY` UTC day and robot, `percentile_cont(0.5)` over submitted-to-first-delivery times, and a `GROUP BY` task over good episodes. Each is an index-backed range scan on `recorded_at`, using a composite index for per-robot counts and a partial index containing only good episodes for top tasks. The analytics page charts this data and offers a table view; it never computes from raw episodes.

## Scale

Measured on a laptop with **5 million** generated episodes (`seed/generate_episodes.py 5000000`):

- **Analytics:** a 30-day range takes 0.28 s and a full year (all 5M episodes) 1.2 s. Both main queries are index-only scans, so time grows with the rows *in the range*, not with the table.
- **Import:** 5M rows in 23 min with flat 146 MB memory (streamed, batched `ON CONFLICT DO NOTHING`); re-importing is idempotent at that size.
- **Episode browser:** 0.1–0.3 s per page; id search and the task facet list take milliseconds.

What breaks first at 10× users and 100× episodes, and what I'd change (daily roll-ups, keyset pagination, `COPY`-based import, partitioning, Redis for the rate limiter), is in [NOTES.md](NOTES.md#5-scale).

## Stretch item

**Background work.** Each assignment has an export job, and a `worker` service (`python -m app.worker`, safe to scale) claims due jobs with `FOR UPDATE SKIP LOCKED`. It runs the simulated export (2–5 s, about 20% failure) outside any transaction, retries with exponential backoff up to 3 attempts, and reclaims jobs whose lease expired. It only records a result if it still owns that attempt. Exports are idempotent (deterministic destination per request and episode). The request page shows per-episode export status live, and operators can retry a failed export.

## AI tooling

AI coding assistance (Claude Code) was used extensively; what it did and how is described in [NOTES.md](NOTES.md#6-ai-tooling).
