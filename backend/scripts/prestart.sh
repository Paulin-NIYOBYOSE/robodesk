#!/bin/sh
# One-shot setup run by the `migrate` service before the API starts.
# Every step is idempotent, so restarting the stack is always safe.
set -eu

alembic upgrade head
python -m app.cli seed-users /seed/users.json

if [ "${SEED_EPISODES:-true}" = "true" ]; then
  python -m app.cli import-episodes /seed/episodes.csv
fi
