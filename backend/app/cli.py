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
from app.services.importer import ImportReport, import_episodes, reason_label
from app.services.users import SeedUser, seed_users

logger = logging.getLogger("robodesk.cli")


def _seed_users(path: Path) -> None:
    entries = TypeAdapter(list[SeedUser]).validate_json(path.read_bytes())
    with SessionLocal() as db:
        created, existing = seed_users(db, entries)
    logger.info("seed users finished", extra={"users_created": created, "users_already_present": existing})


def format_report(report: ImportReport) -> str:
    lines = [
        f"Processed:          {report.processed}",
        f"Imported:           {report.imported}",
        f"Skipped duplicates: {report.skipped_duplicates}",
        f"Rejected:           {report.rejected}",
        f"Normalised:         {report.normalized}  (imported after whitespace/case/date-layout clean-up)",
        f"Blank lines:        {report.blank_lines}  (ignored)",
    ]
    if report.reasons:
        lines += ["", "Reasons:"]
        lines += [f"  - {reason_label(code)}: {count}" for code, count in report.reasons.most_common()]
    if report.issues:
        lines += ["", "Rejected rows:"]
        lines += [f"  line {i.line:>6}  {i.episode_id or '(no id)':<12} {i.message}" for i in report.issues]
        if report.issues_truncated:
            lines.append(f"  ... and {report.rejected - len(report.issues)} more")
    return "\n".join(lines)


def _import_episodes(path: Path) -> None:
    with path.open(encoding="utf-8-sig", newline="") as source, SessionLocal() as db:
        report = import_episodes(db, source)
    print(format_report(report), flush=True)


def main(argv: list[str] | None = None) -> int:
    configure_logging(get_settings().log_level)
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="RoboDesk operational commands")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("seed-users", help="Create the users listed in a users.json file (idempotent)").add_argument(
        "path", type=Path
    )
    commands.add_parser(
        "import-episodes", help="Import an episodes CSV (idempotent; no upload size limit)"
    ).add_argument("path", type=Path)
    args = parser.parse_args(argv)

    if args.command == "seed-users":
        _seed_users(args.path)
    elif args.command == "import-episodes":
        _import_episodes(args.path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
