# RoboDesk — design notes

## 1. Design

```
users ─┬─< dataset_requests ──< request_status_history  (previous → new status, by whom, when, comment)
       │          └──< assignments >── episodes >── robots
       └── (changed_by / assigned_by)
```

- **episodes**: `episode_id` is unique (the import's idempotency key); `robot_id` is a foreign key to a seeded `robots` table. Indexes follow the queries: `(recorded_at, robot_id)` for per-day analytics, `(task_name, quality, recorded_at)` for operator filters, and a partial index on good episodes for "top tasks".
- **assignments**: `UNIQUE(episode_id)`, so an episode belongs to at most one request; unassigning deletes the row. The row also carries the export-job state (stretch).
- **users**: role, argon2id hash, `is_active`; emails are stored lowercase (CHECK constraint), which makes the unique index case-insensitive.

**Where state lives.** PostgreSQL is the single source of truth. The JWT carries only the user id; role and active status are re-read on every request. The browser keeps a server-state cache (TanStack Query) and puts list filters in the URL. The only in-process state is the failed-login counter.

**The hardest decisions**

1. **What the importer does with messy rows.** The rule: *normalise only what is unambiguous, reject what is questionable, never overwrite.* Whitespace, letter case (` arm-01`, `PICK CUP`, `Good`, `ep-00003`), ISO-8601 variants and `DD/MM/YYYY` are normalised and counted in the report. `45.5`/`-5`/`N/A`/`999999` seconds, blanks, `excellent`, `not a date`, a 2031 date, `arm-99` and the 5-field row are rejected with a reason and line number. The deciding argument: an accepted row is frozen (re-imports skip existing ids), so a wrong guess is permanent, while a rejection is fixed by correcting the export and re-importing. For the same reason, a *conflicting* duplicate (`EP-00011` as `bad` then `good`) keeps the stored version and is reported. Mechanically, each batch is inserted with `ON CONFLICT (episode_id) DO NOTHING RETURNING`, and every row not inserted is compared with the stored row: identical means "skipped duplicate", different means "rejected". Day-first dates follow the only example (`14/08`) and local convention; timestamps without an offset are UTC.

2. **Assignment rules under concurrency.** A Python "is it free?" check can't stop two operators clicking at once, so the unique constraint is the final arbiter. The service checks first for a friendly message, and maps an `IntegrityError` on that named constraint to a 409. A test reproduces the race with two real transactions. Status and assignment changes also lock the request row (`FOR UPDATE`), so "deliver" (`assigned ≥ requested`) can't interleave with an unassign.

3. **One state machine, enforced once.** `services/workflow.py` is a five-entry table, `(from, to) → roles`, used by `/transition`, `/accept` and `/reject` alike. The API returns `allowed_transitions`, so the UI never re-implements the rules. Clients get **404, not 403**, for others' requests: a single `_visible_to` filter is applied to every request query.

**Other calls:** admins can't accept or reject for a client; episodes change only while `in_progress` and never exceed the requested count; rejection needs a reason; clients see the episodes in their own delivery; analytics days are UTC and the range is inclusive, and request metrics use requests *submitted* in the range, with the median measured to the *first* delivery.

## 2. Deliberately left out

Refresh tokens (one 60-minute token in `localStorage`); a shared rate limiter (in-memory, so one API process); an audit trail of assignment changes (status changes *are* audited); updating existing episodes via import; keyset pagination; a real export target; dark mode; browser tests in CI (I drove every role's journey headlessly, but didn't commit it).

**With two more days:** httpOnly-cookie sessions with refresh and CSRF protection, the limiter in Redis, the analytics roll-up and keyset pagination from §5, Playwright journeys in CI, an assignment audit log, and a warning when delivering with unfinished exports.

## 3. Something that went wrong

The suite was green locally, but the first `docker compose run --rm tests` on a fresh Docker VM failed `test_full_lifecycle_with_rework_is_audited`, and 14 reruns passed. The captured log showed every call in the test returning 200, so the failing assertion had to be the **order** of the status history, which was sorted by `changed_at` (the database's `now()`). The VM journal explained it: Colima re-syncs the guest clock every 10 s, stepping it by up to ±0.5 s ("drift was -513ms"), and journald logged *"Time jumped backwards"* during that run. Seven transitions in ~100 ms were enough for a backwards step to reorder two of them.

The test was right and the code was wrong: real clocks step too (NTP, VM migration). Transitions on a request are serialised by its row lock, so insertion order (`id`) *is* the sequence. History is now ordered by `id`, with `changed_at` used for display only, and analytics picks the first delivery by `id` (`DISTINCT ON`). A regression test simulates the clock step.

A second bug only showed up in the headless-browser run: after a client signed out, the next user (an operator) landed on the *client's* request page. The access log showed `GET /api/requests/2` right after the operator's login. The route guard now records *why* a session ended and only returns users to their page after an expiry, never after a deliberate sign-out.

## 4. Security

- **Passwords:** argon2id. Unknown emails are verified against a dummy hash, so timing reveals nothing. Five failures per account in 5 minutes returns 429. Passwords are capped at 128 characters, and the seed passwords are hashed and never logged.
- **Tokens:** HS256 with the algorithm pinned on decode, carrying only `sub`/`iat`/`exp`, valid for 60 minutes. The secret comes from the environment, and production refuses a weak or default one. Deactivation and demotion take effect on tokens that were already issued.
- **Validation:** Pydantic with `extra="forbid"`, so `status` or `client_id` can't be smuggled into a create, and bounds on every input. CSV uploads get a 50 MB cap, a per-field size limit, header and UTF-8 checks, and control-character rejection. SQL is parameterised throughout; errors never echo SQL or stack traces.
- **Authorization:** everything is enforced server-side (role dependencies plus `_visible_to`). A test walks the OpenAPI schema and asserts that every endpoint except login and health returns 401 without a token.

The two vulnerabilities I'd worry about most:

1. **IDOR**: a client reaching another client's request by id. Mitigated by one visibility filter, 404 responses, and tests covering read, accept, reject and assignments. The residual risk is a *new* endpoint that forgets the filter; next step: a per-role sweep over every endpoint.
2. **Token theft via XSS**: `localStorage` is readable by injected script. React escapes all rendered data (including CSV task names), the CSP disallows inline scripts, and tokens are short-lived. The real fix is an httpOnly SameSite cookie with CSRF protection.

## 5. Scale

Measured on a laptop (local PostgreSQL 14) with **5,000,000** generated episodes, after `VACUUM ANALYZE`:

| Operation | Result |
|---|---|
| CLI import of 5M rows | 23 min (~3,600 rows/s, CPU-bound in Python), flat **146 MB** memory |
| Re-import of 200k existing rows | 44 s, nothing created |
| Analytics: 30 days (~410k episodes) / full year | 0.28 s / 1.2 s |
| Episode browser page incl. `COUNT(*)` · id search · task facets | 0.12–0.34 s · 2 ms · 0.7 ms |

Both analytics scans are **index-only** (0 heap fetches), so cost tracks the rows inside the range, not the table size.

**10× users:** the single API process and its 40-thread pool saturate first, then database connections. Fix: move the limiter to Redis, run several workers, and add PgBouncer. Export polling would move to SSE.

**100× episodes:** a year of analytics would scan ~500M index entries. Fix: a `daily_stats(day, robot, task, quality, count)` roll-up maintained by the import (the only write path), so queries scale with days × robots. Offset pagination and exact counts degrade, so switch to keyset pagination with estimated counts. The import would load through `COPY` into a staging table with per-chunk commits (safe, because it's idempotent), and `episodes` would be partitioned by month.

## 6. AI tooling
This project was developed using an AI-assisted workflow, with Claude Code, GPT-based assistants, and other AI tools supporting different parts of the development process.

### AI-assisted roles

* **Implementation assistance** — helping with selected features, components, APIs, and development tasks.
* **Debugging** — investigating errors, tracing issues, and suggesting fixes during development.
* **Testing** — generating and extending automated tests and helping identify missing test cases.
* **Code review** — reviewing implementation, identifying potential issues, and suggesting improvements.
* **Technical problem-solving** — exploring approaches and alternatives for specific engineering challenges.
* **Documentation** — helping draft and refine README content, technical notes, and project documentation.

I defined the overall product and technical direction, including the technology stack, project structure, domain rules, user roles and permissions, security requirements, and testing approach. Development was carried out iteratively, combining my own engineering work and decisions with AI-assisted development and review.

The project was validated through the automated test suite, clean-clone Docker runs, and browser-based walkthroughs covering the main journeys for each user role. The final repository reflects the resulting implementation, documentation, and engineering decisions.

