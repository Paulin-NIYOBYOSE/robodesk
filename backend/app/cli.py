"""Operational commands.

    python -m app.cli seed-users ../seed/users.json
    python -m app.cli import-episodes ../seed/episodes.csv
"""

import argparse
import json
import logging
import sys
from pathlib import Path

from pydantic import TypeAdapter

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.services.users import SeedUser, seed_users

logger = logging.getLogger("robodesk.cli")


def _seed_users(path: Path) -> None:
    entries = TypeAdapter(list[SeedUser]).validate_json(path.read_bytes())
    with SessionLocal() as db:
        created, existing = seed_users(db, entries)
    logger.info("seed users finished", extra={"users_created": created, "users_already_present": existing})


def main(argv: list[str] | None = None) -> int:
    configure_logging(get_settings().log_level)
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="RoboDesk operational commands")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("seed-users", help="Create the users listed in a users.json file (idempotent)").add_argument(
        "path", type=Path
    )
    args = parser.parse_args(argv)

    if args.command == "seed-users":
        _seed_users(args.path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
