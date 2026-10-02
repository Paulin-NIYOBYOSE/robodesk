# RoboDesk

**Robotics Dataset Request & Operations Platform**: an internal web app that replaces the spreadsheet used to track dataset requests for robot teleoperation data.

Clients request datasets ("200 episodes of a robot arm picking cups by 30 Oct"). Operators fulfil them by assigning recorded episodes. Clients then accept or reject the delivery.

- Design decisions, security and scale: **[NOTES.md](NOTES.md)**
- Short demo videos: [docs/demo/](docs/demo/)

---

## 1. Run it

You only need **Docker** (with Docker Compose v2).

```bash
git clone https://github.com/Paulin-NIYOBYOSE/robodesk.git
cd robodesk
docker compose up --build
```

The first build takes a few minutes. Then open:

| | |
|---|---|
| **The app** | <http://localhost:3000> → click **Sign in** |
| API docs (Swagger) | <http://localhost:8000/docs> |
| Health check | <http://localhost:8000/health> |

On startup the database is migrated, the seed users below are created, and the supplied `seed/episodes.csv` is imported. Restarting is safe; nothing is created twice.

- **Stop:** `Ctrl+C`, then `docker compose down`
- **Start again from an empty database:** `docker compose down -v`, then `docker compose up --build`
- **Port 3000 or 8000 already in use:** `FRONTEND_PORT=3001 API_PORT=8001 docker compose up --build`

## 2. Sign in

Test accounts from `seed/users.json`. For development only; passwords are stored hashed (argon2id).

| Role | Email | Password | Can |
|---|---|---|---|
| Admin | admin@example.com | `admin123` | everything an operator can, plus create/deactivate users and change roles |
| Operator | ops1@example.com | `ops123` | see all requests, move them through the workflow, assign episodes, import CSV |
| Operator | ops2@example.com | `ops123` | same as above |
| Client | client-a@example.com | `client123` | Acme Robotics: create requests, see only its own, accept/reject deliveries |
| Client | client-b@example.com | `client123` | Beta Labs: same as above |

**Quick walkthrough:** sign in as a client and create a request → sign in as an operator, open it, click **Start work**, assign episodes, **Mark as delivered** → sign in as the client again and accept or reject it. The request page shows the full history of who changed what, and when.

## 3. Run the tests

```bash
docker compose run --build --rm tests
```

This runs **219 backend tests** against a real PostgreSQL database (a separate `_test` database, so the app's data is untouched). They cover:

- authentication and authorization, including a client trying to reach another client's request, and every endpoint refusing anonymous calls
- every valid and invalid status transition, for every role
- the assignment rules, including two operators assigning the same episode at the same moment
- CSV import edge cases and idempotency (importing the same file twice)
- analytics results and the background export job

GitHub Actions (`.github/workflows/ci.yml`) runs the tests, the frontend lint and build, and a full `docker compose up` check on every push to `main`.

---

## How it works

| Part | What it is |
|---|---|
| `backend/` | Python 3.13 · FastAPI · SQLAlchemy · PostgreSQL · Alembic migrations · pytest. Business rules live in `app/services/` (the status workflow is `services/workflow.py`). |
| `frontend/` | React + TypeScript (Vite) · Tailwind. Served by nginx, which forwards `/api` to the backend. |
| `worker` | Runs the background export jobs (the stretch item). |
| `seed/` | The supplied data files, unchanged. |

**Workflow:** `submitted → in_progress → delivered → accepted`, or `delivered → rejected → in_progress` (rework). Clients accept or reject; operators do the rest. Any other move is refused by the API, and every change is recorded with who made it and when.

**Assignment rules:** only `good` or `usable` episodes; an episode belongs to at most one request (guaranteed by a database constraint); a request can't be delivered until enough episodes are assigned.

### CSV import

In the app: **Episodes → Import CSV**. For large files, use the command line:

```bash
docker compose cp my-episodes.csv backend:/tmp/episodes.csv
docker compose exec backend python -m app.cli import-episodes /tmp/episodes.csv
```

Importing is safe to repeat: `episode_id` is the key, and existing episodes are never duplicated or overwritten. The report lists what was imported, what was skipped and what was rejected, with a reason and line number for each rejected row. The supplied file gives **171 imported, 2 duplicates skipped, 16 rejected**; importing it again adds nothing.

### Analytics, and how it behaves with 5 million episodes

`GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` returns episodes recorded per day per robot, request counts by status with the median time from submitted to delivered, and the top 5 tasks by number of good episodes. PostgreSQL computes all three (`GROUP BY`, `percentile_cont`); the API never loads raw episodes into Python.

Measured on a laptop with 5,000,000 generated episodes (`seed/generate_episodes.py 5000000`):

- 30 days of analytics: **0.28 s**; a full year: **1.2 s**. The queries read an index over the date range only, so cost grows with the range, not the table.
- Importing all 5 million rows: 23 minutes, with constant memory use.

What would change at much larger scale (daily summary tables, different pagination, faster bulk loading) is in [NOTES.md](NOTES.md#5-scale).

### Stretch item: background work

Each assigned episode goes through a simulated export job run by the `worker` service. A job takes 2–5 s and fails about 20% of the time. Failed jobs are retried automatically (up to 3 attempts), and running a job again is harmless. The request page shows each episode's export status live, and operators can retry a failed export.

---

## Development without Docker

With PostgreSQL running locally and an empty `robodesk` database:

```bash
cd backend
python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
echo 'DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/robodesk' > .env   # git-ignored
.venv/bin/alembic upgrade head
.venv/bin/python -m app.cli seed-users ../seed/users.json
.venv/bin/python -m app.cli import-episodes ../seed/episodes.csv
.venv/bin/uvicorn app.main:app --reload --port 8000     # API (terminal 1)
.venv/bin/python -m app.worker                          # export worker (terminal 2)
.venv/bin/pytest                                        # tests

cd ../frontend && npm install && npm run dev            # http://localhost:5173 (terminal 3)
```

The frontend dev server forwards `/api` to port 8000, so start the API first. Otherwise the UI shows "Cannot reach the server".
