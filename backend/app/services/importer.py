"""Idempotent import of episode metadata from the recording system's CSV export.

Every data row lands in exactly one bucket, and the report says which and why:

* imported            a new, valid episode;
* skipped duplicate   identical to an episode that already exists (earlier in the same
                      file, or from a previous import) — this is what makes re-runs safe;
* rejected            invalid, or reuses an existing episode_id with different values.

Only *safe* normalisation is applied, and it is counted in the report: trimming and
collapsing whitespace, letter case of identifiers/enums/task names, and parsing a
known alternative date layout. Anything questionable is rejected rather than guessed.
Rejected rows are not stored, so once the source data is fixed a re-import picks
them up (accepted rows are never overwritten by a later import).
"""

import csv
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Iterator, Set
from dataclasses import asdict, dataclass, field, fields
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import InvalidInputError
from app.core.text import collapse_whitespace
from app.models import Episode, EpisodeQuality, Robot

EXPECTED_COLUMNS = (
    "episode_id",
    "robot_id",
    "task_name",
    "recorded_at",
    "duration_seconds",
    "operator_name",
    "quality",
)
BATCH_SIZE = 1_000
MAX_REPORTED_ISSUES = 200
# Episodes are short clips; anything above an hour is a broken export, not a recording.
MAX_DURATION_SECONDS = 3_600
# Slack for clock skew between the recording rigs and this server.
FUTURE_TOLERANCE = timedelta(days=1)
MAX_TEXT_LENGTH = {"episode_id": 64, "task_name": 200, "operator_name": 120}
# A single field larger than this makes the row malformed (guards against hostile files).
csv.field_size_limit(10_000)

DUPLICATE = "duplicate"
REASON_LABELS = {
    DUPLICATE: "Duplicate of an existing episode",
    "conflicting_duplicate": "Same episode_id with different values",
    "malformed_row": "Malformed row",
    "invalid_episode_id": "Invalid episode_id",
    "unknown_robot": "Unknown robot",
    "invalid_date": "Invalid date",
    "future_date": "Date in the future",
    "invalid_duration": "Invalid duration",
    "invalid_quality": "Invalid quality",
    "invalid_text": "Invalid text",
}

_EPISODE_ID = re.compile(r"[A-Z0-9][A-Z0-9_-]*")
_ISO_DATETIME = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?")
_CANONICAL_DATETIME = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")
_DAY_FIRST_DATETIME = re.compile(r"(\d{2})/(\d{2})/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?")
_WHOLE_NUMBER = re.compile(r"\d{1,7}")
_QUALITIES = {quality.value for quality in EpisodeQuality}


def reason_label(code: str) -> str:
    if code.startswith("missing_"):
        return f"Missing {code.removeprefix('missing_')}"
    return REASON_LABELS.get(code, code)


@dataclass(frozen=True)
class EpisodeRecord:
    """A validated, normalised row — exactly what would be stored."""

    episode_id: str
    robot_id: str
    task_name: str
    recorded_at: datetime
    duration_seconds: int
    operator_name: str
    quality: EpisodeQuality

    def differences(self, existing: "Episode | EpisodeRecord") -> list[str]:
        return [
            f"{f.name}: '{_display(getattr(existing, f.name))}' vs '{_display(getattr(self, f.name))}'"
            for f in fields(self)
            if getattr(existing, f.name) != getattr(self, f.name)
        ]


@dataclass(frozen=True)
class RowIssue:
    line: int
    episode_id: str | None
    code: str
    message: str


@dataclass
class ImportReport:
    processed: int = 0
    imported: int = 0
    skipped_duplicates: int = 0
    rejected: int = 0
    normalized: int = 0
    blank_lines: int = 0
    reasons: Counter[str] = field(default_factory=Counter)
    # Rejected rows only (duplicates are expected on re-runs and would drown them out).
    issues: list[RowIssue] = field(default_factory=list)

    @property
    def issues_truncated(self) -> bool:
        return self.rejected > len(self.issues)

    def skip_duplicate(self) -> None:
        self.skipped_duplicates += 1
        self.reasons[DUPLICATE] += 1

    def reject(self, line: int, episode_id: str | None, code: str, message: str) -> None:
        self.rejected += 1
        self.reasons[code] += 1
        if len(self.issues) < MAX_REPORTED_ISSUES:
            self.issues.append(RowIssue(line, episode_id, code, message))


class RowRejected(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class _Pending:
    line: int
    record: EpisodeRecord
    normalized: bool


def _display(value: object) -> str:
    return value.astimezone(UTC).isoformat() if isinstance(value, datetime) else str(value)


def _preview(value: str, limit: int = 40) -> str:
    return value if len(value) <= limit else value[: limit - 1] + "…"


def parse_recorded_at(value: str) -> datetime:
    """Accepts ISO 8601 (``T`` or space separator, optional seconds/offset) and the
    day-first ``DD/MM/YYYY HH:MM`` layout. Timestamps without an offset are UTC."""
    if _ISO_DATETIME.fullmatch(value):
        parsed = datetime.fromisoformat(value)
    elif match := _DAY_FIRST_DATETIME.fullmatch(value):
        day, month, year, hour, minute, second = match.groups()
        parsed = datetime(int(year), int(month), int(day), int(hour), int(minute), int(second or 0))
    else:
        raise ValueError(f"unrecognised date: {value!r}")
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def parse_row(raw: dict[str, str], known_robots: Set[str], now: datetime) -> tuple[EpisodeRecord, bool]:
    """Validate and normalise one row. Returns the record and whether it needed normalising.

    Raises RowRejected with the first problem found (one reason per row).
    """
    cleaned = {name: collapse_whitespace(raw[name]) for name in EXPECTED_COLUMNS}
    for name in EXPECTED_COLUMNS:
        value = cleaned[name]
        if not value:
            raise RowRejected(f"missing_{name}", f"{name} is blank")
        if any(unicodedata.category(char) == "Cc" for char in value):
            raise RowRejected("invalid_text", f"{name} contains control characters")
        if len(value) > MAX_TEXT_LENGTH.get(name, 200):
            raise RowRejected("invalid_text", f"{name} is longer than {MAX_TEXT_LENGTH.get(name, 200)} characters")

    episode_id = cleaned["episode_id"].upper()
    if not _EPISODE_ID.fullmatch(episode_id):
        raise RowRejected("invalid_episode_id", f"'{_preview(cleaned['episode_id'])}' is not a valid episode id")

    robot_id = cleaned["robot_id"].lower()
    if robot_id not in known_robots:
        raise RowRejected("unknown_robot", f"'{_preview(cleaned['robot_id'])}' is not a known robot")

    task_name = cleaned["task_name"].lower()

    try:
        recorded_at = parse_recorded_at(cleaned["recorded_at"])
    except ValueError:
        raise RowRejected("invalid_date", f"'{_preview(cleaned['recorded_at'])}' is not a recognised date") from None
    if recorded_at > now + FUTURE_TOLERANCE:
        raise RowRejected("future_date", f"recorded_at {recorded_at:%Y-%m-%d} is in the future")

    duration = cleaned["duration_seconds"]
    if not _WHOLE_NUMBER.fullmatch(duration) or not 1 <= int(duration) <= MAX_DURATION_SECONDS:
        raise RowRejected(
            "invalid_duration",
            f"'{_preview(duration)}' is not a whole number of seconds between 1 and {MAX_DURATION_SECONDS}",
        )

    quality = cleaned["quality"].lower()
    if quality not in _QUALITIES:
        raise RowRejected("invalid_quality", f"'{_preview(cleaned['quality'])}' is not one of good, usable, bad")

    record = EpisodeRecord(
        episode_id=episode_id,
        robot_id=robot_id,
        task_name=task_name,
        recorded_at=recorded_at,
        duration_seconds=int(duration),
        operator_name=cleaned["operator_name"],
        quality=EpisodeQuality(quality),
    )
    normalized = (
        any(raw[name] != cleaned[name] for name in EXPECTED_COLUMNS)  # whitespace
        or (episode_id, robot_id, task_name, quality)
        != (cleaned["episode_id"], cleaned["robot_id"], cleaned["task_name"], cleaned["quality"])  # case
        or not _CANONICAL_DATETIME.fullmatch(cleaned["recorded_at"])  # date layout
    )
    return record, normalized


def _read_header(reader: Iterator[list[str]]) -> list[str]:
    try:
        header = next(reader)
    except StopIteration:
        raise InvalidInputError("The file is empty") from None
    except csv.Error:
        raise InvalidInputError("The header row could not be parsed") from None
    names = [collapse_whitespace(name).lower() for name in header]
    if missing := [column for column in EXPECTED_COLUMNS if column not in names]:
        raise InvalidInputError(f"Missing required column(s): {', '.join(missing)}")
    if len(set(names)) != len(names):
        raise InvalidInputError("The header contains duplicate column names")
    return names


def _data_rows(reader, report: ImportReport) -> Iterator[tuple[int, list[str] | None, str | None]]:
    """Yield ``(line, fields, parse_error)`` for each non-blank row; blank lines are only counted."""
    while True:
        try:
            row = next(reader)
        except StopIteration:
            return
        except csv.Error as exc:
            yield reader.line_num, None, str(exc)
            continue
        if any(value.strip() for value in row):
            yield reader.line_num, row, None
        else:
            report.blank_lines += 1


def _classify_duplicate(report: ImportReport, line: int, record: EpisodeRecord, existing) -> None:
    if differences := record.differences(existing):
        report.reject(
            line,
            record.episode_id,
            "conflicting_duplicate",
            f"{record.episode_id} already exists with different values ({'; '.join(differences)}); "
            "the existing record was kept",
        )
    else:
        report.skip_duplicate()


def _flush(db: Session, first_seen: dict[str, _Pending], repeats: list[_Pending], report: ImportReport) -> None:
    """Insert one batch. ON CONFLICT DO NOTHING makes re-runs (and concurrent runs) safe.

    Every row that was not inserted — because the episode already existed, or because
    the id appeared earlier in this file — is then compared with the row actually stored.
    """
    if not first_seen:
        return
    inserted = set(
        db.scalars(
            pg_insert(Episode)
            .values([asdict(item.record) for item in first_seen.values()])
            .on_conflict_do_nothing(index_elements=[Episode.episode_id])
            .returning(Episode.episode_id)
        )
    )
    report.imported += len(inserted)
    report.normalized += sum(1 for eid, item in first_seen.items() if eid in inserted and item.normalized)

    not_inserted = [item for eid, item in first_seen.items() if eid not in inserted] + repeats
    if not_inserted:
        ids = {item.record.episode_id for item in not_inserted}
        stored = {e.episode_id: e for e in db.scalars(select(Episode).where(Episode.episode_id.in_(ids)))}
        for item in not_inserted:
            _classify_duplicate(report, item.line, item.record, stored[item.record.episode_id])


def import_episodes(db: Session, lines: Iterable[str], *, now: datetime | None = None) -> ImportReport:
    """Import a CSV export. All rows are written in one transaction: if the file turns
    out to be unreadable halfway (e.g. not UTF-8), nothing is stored."""
    now = now or datetime.now(UTC)
    known_robots = set(db.scalars(select(Robot.id)))
    report = ImportReport()
    reader = csv.reader(lines)
    header = _read_header(reader)
    first_seen: dict[str, _Pending] = {}
    repeats: list[_Pending] = []

    for line, row, parse_error in _data_rows(reader, report):
        report.processed += 1
        if row is None or len(row) != len(header):
            detail = parse_error or f"expected {len(header)} fields, found {len(row or [])}"
            report.reject(line, None, "malformed_row", f"Malformed row: {detail}")
            continue
        raw = dict(zip(header, row, strict=True))
        try:
            record, normalized = parse_row(raw, known_robots, now)
        except RowRejected as exc:
            episode_id = collapse_whitespace(raw["episode_id"]).upper() or None
            report.reject(line, episode_id and _preview(episode_id), exc.code, exc.message)
            continue

        item = _Pending(line, record, normalized)
        if record.episode_id in first_seen:
            repeats.append(item)
        else:
            first_seen[record.episode_id] = item
        if len(first_seen) >= BATCH_SIZE:
            _flush(db, first_seen, repeats, report)
            first_seen, repeats = {}, []

    _flush(db, first_seen, repeats, report)
    db.commit()
    report.issues.sort(key=lambda issue: issue.line)
    return report
