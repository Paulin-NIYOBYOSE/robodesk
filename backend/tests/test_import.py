import io
from collections import Counter
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.errors import InvalidInputError
from app.models import Episode, EpisodeQuality
from app.services.importer import MAX_REPORTED_ISSUES, import_episodes
from tests.conftest import SEED_DIR
from tests.helpers import auth

NOW = datetime(2026, 10, 2, 12, 0, tzinfo=UTC)
HEADER = "episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality"
VALID = "EP-1,arm-01,pick cup,2026-08-01T10:00:00,30,Aline,good"
SEED_CSV = SEED_DIR / "episodes.csv"


def run(db, *rows: str, header: str = HEADER):
    return import_episodes(db, io.StringIO("\n".join([header, *rows]) + "\n"), now=NOW)


def import_seed(db):
    with SEED_CSV.open(encoding="utf-8-sig", newline="") as source:
        return import_episodes(db, source, now=NOW)


def episode_count(db) -> int:
    return db.scalar(select(func.count(Episode.id)))


# ---------------------------------------------------------------- the supplied messy export


def test_seed_file_is_imported_with_a_full_report(db):
    report = import_seed(db)
    assert (report.processed, report.imported, report.skipped_duplicates, report.rejected) == (189, 171, 2, 16)
    assert report.blank_lines == 2
    assert report.normalized == 8
    assert report.reasons == Counter(
        {
            "duplicate": 2,  # EP-00030, EP-00074 repeated verbatim
            "conflicting_duplicate": 2,  # EP-00011 (bad vs good), ep-00003 vs EP-00003
            "invalid_duration": 4,  # 45.5, -5, N/A, 999999
            "missing_episode_id": 1,
            "missing_robot_id": 1,
            "missing_duration_seconds": 1,
            "missing_operator_name": 1,
            "missing_quality": 1,
            "invalid_quality": 1,  # "excellent"
            "invalid_date": 1,  # "not a date"
            "future_date": 1,  # 2031-01-01
            "unknown_robot": 1,  # arm-99
            "malformed_row": 1,  # 5 fields
        }
    )
    assert episode_count(db) == 171


def test_seed_file_edge_cases_are_resolved_as_documented(db):
    import_seed(db)
    stored = {e.episode_id: e for e in db.scalars(select(Episode))}
    assert stored["EP-00011"].quality == EpisodeQuality.BAD  # first occurrence kept, conflict reported
    assert stored["EP-00003"].robot_id == "humanoid-01"  # "ep-00003" did not overwrite it
    assert stored["EP-00008"].robot_id == "arm-01"  # " arm-01"
    assert stored["EP-00006"].task_name == "pick cup"  # "  Pick Cup "
    assert stored["EP-00007"].task_name == "pick cup"  # "PICK CUP"
    assert stored["EP-00009"].quality == EpisodeQuality.GOOD  # "Good"
    assert stored["EP-00010"].quality == EpisodeQuality.USABLE  # "USABLE"
    assert stored["EP-00014"].recorded_at == datetime(2026, 8, 14, 9, 15, tzinfo=UTC)  # 14/08/2026 09:15
    assert stored["EP-00013"].recorded_at == datetime(2026, 8, 14, 9, 12, tzinfo=UTC)  # space separator
    assert stored["EP-00015"].recorded_at == datetime(2026, 8, 14, 9, 20, tzinfo=UTC)  # trailing Z
    assert stored["EP-90002"].task_name == "pick cup, then place"  # quoted comma


def test_reimporting_the_same_file_creates_nothing(db):
    first = import_seed(db)
    second = import_seed(db)
    assert second.imported == 0
    assert second.skipped_duplicates == first.imported + first.skipped_duplicates
    assert second.rejected == first.rejected
    assert episode_count(db) == first.imported


# ---------------------------------------------------------------- row rules


def test_valid_row_is_normalised(db):
    report = run(db, " ep-1 , ARM-01 ,  Pick   Cup ,14/08/2026 09:15, 42 ,  Aline  , Good ")
    assert (report.imported, report.normalized, report.rejected) == (1, 1, 0)
    episode = db.scalar(select(Episode))
    assert (episode.episode_id, episode.robot_id, episode.task_name) == ("EP-1", "arm-01", "pick cup")
    assert episode.recorded_at == datetime(2026, 8, 14, 9, 15, tzinfo=UTC)
    assert (episode.duration_seconds, episode.operator_name, episode.quality) == (42, "Aline", EpisodeQuality.GOOD)


def test_canonical_row_is_not_counted_as_normalised(db):
    assert run(db, VALID).normalized == 0


def test_timezone_offsets_are_converted_to_utc(db):
    run(db, "EP-1,arm-01,pick cup,2026-08-01T12:00:00+02:00,30,Aline,good")
    assert db.scalar(select(Episode.recorded_at)) == datetime(2026, 8, 1, 10, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("row", "code"),
    [
        ("EP-1,arm-99,pick cup,2026-08-01T10:00:00,30,Aline,good", "unknown_robot"),
        ("EP-1,,pick cup,2026-08-01T10:00:00,30,Aline,good", "missing_robot_id"),
        (",arm-01,pick cup,2026-08-01T10:00:00,30,Aline,good", "missing_episode_id"),
        ("EP 1!,arm-01,pick cup,2026-08-01T10:00:00,30,Aline,good", "invalid_episode_id"),
        ("EP-1,arm-01,pick cup,not a date,30,Aline,good", "invalid_date"),
        ("EP-1,arm-01,pick cup,2026-02-30T10:00:00,30,Aline,good", "invalid_date"),
        ("EP-1,arm-01,pick cup,2026-08-01,30,Aline,good", "invalid_date"),  # no time of day
        ("EP-1,arm-01,pick cup,08/14/2026 10:00,30,Aline,good", "invalid_date"),  # month-first
        ("EP-1,arm-01,pick cup,2031-01-01T00:00:00,30,Aline,good", "future_date"),
        ("EP-1,arm-01,pick cup,2026-08-01T10:00:00,45.5,Aline,good", "invalid_duration"),
        ("EP-1,arm-01,pick cup,2026-08-01T10:00:00,-5,Aline,good", "invalid_duration"),
        ("EP-1,arm-01,pick cup,2026-08-01T10:00:00,0,Aline,good", "invalid_duration"),
        ("EP-1,arm-01,pick cup,2026-08-01T10:00:00,N/A,Aline,good", "invalid_duration"),
        ("EP-1,arm-01,pick cup,2026-08-01T10:00:00,999999,Aline,good", "invalid_duration"),
        ("EP-1,arm-01,pick cup,2026-08-01T10:00:00,30,Aline,excellent", "invalid_quality"),
        ("EP-1,arm-01,pick cup,2026-08-01T10:00:00,30,Aline,", "missing_quality"),
        ("EP-1,arm-01,pick cup,2026-08-01T10:00:00,30,,good", "missing_operator_name"),
        ("EP-1,arm-01,pick\x07cup,2026-08-01T10:00:00,30,Aline,good", "invalid_text"),
        ("EP-1,arm-01,pick cup,2026-08-01T10:00:00,30", "malformed_row"),
        (VALID + ",extra", "malformed_row"),
        ('EP-1,arm-01,"x' + "y" * 20_000 + '",2026-08-01T10:00:00,30,Aline,good', "malformed_row"),
    ],
)
def test_invalid_row_is_rejected_with_its_reason(db, row, code):
    report = run(db, row)
    assert (report.imported, report.rejected) == (0, 1)
    assert report.reasons == Counter({code: 1})
    assert report.issues[0].line == 2
    assert episode_count(db) == 0


def test_one_bad_row_does_not_block_the_rest(db):
    report = run(db, VALID, "EP-2,arm-99,pick cup,2026-08-01T10:00:00,30,Aline,good", VALID.replace("EP-1", "EP-3"))
    assert (report.imported, report.rejected) == (2, 1)


def test_duplicates_within_a_file(db):
    conflicting = VALID.replace(",good", ",bad")
    report = run(db, VALID, VALID, conflicting)
    assert (report.imported, report.skipped_duplicates, report.rejected) == (1, 1, 1)
    assert report.issues[0].code == "conflicting_duplicate"
    assert "quality: 'good' vs 'bad'" in report.issues[0].message
    assert db.scalar(select(Episode.quality)) == EpisodeQuality.GOOD  # first one wins, nothing overwritten


def test_episode_ids_are_case_insensitive(db):
    report = run(db, VALID, VALID.replace("EP-1", "ep-1"))
    assert (report.imported, report.skipped_duplicates) == (1, 1)


def test_duplicates_across_batches_are_detected(db, monkeypatch):
    monkeypatch.setattr("app.services.importer.BATCH_SIZE", 2)
    rows = [VALID.replace("EP-1", f"EP-{n}") for n in range(1, 6)]
    report = run(db, *rows, rows[0], rows[4].replace(",good", ",usable"))
    assert (report.imported, report.skipped_duplicates, report.rejected) == (5, 1, 1)


def test_existing_episodes_are_never_overwritten(db):
    run(db, VALID)
    report = run(db, VALID.replace(",30,", ",31,"))
    assert report.reasons == Counter({"conflicting_duplicate": 1})
    assert db.scalar(select(Episode.duration_seconds)) == 30


def test_columns_may_come_in_any_order_and_case(db):
    header = "Quality, EPISODE_ID ,robot_id,task_name,recorded_at,duration_seconds,operator_name"
    report = run(db, "good,EP-1,arm-01,pick cup,2026-08-01T10:00:00,30,Aline", header=header)
    assert report.imported == 1


def test_blank_lines_are_counted_but_not_processed(db):
    report = run(db, VALID, "", " , , ", VALID.replace("EP-1", "EP-2"))
    assert (report.processed, report.imported, report.blank_lines) == (2, 2, 2)


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("", "The file is empty"),
        ("episode_id,robot_id\nEP-1,arm-01\n", "Missing required column(s)"),
        (HEADER + ",quality\n", "duplicate column names"),
    ],
)
def test_unusable_files_are_refused_as_a_whole(db, content, message):
    with pytest.raises(InvalidInputError, match=message.replace("(", r"\(").replace(")", r"\)")):
        import_episodes(db, io.StringIO(content), now=NOW)


def test_issue_list_is_capped_but_counts_are_complete(db):
    rows = [f"EP-{n},arm-99,pick cup,2026-08-01T10:00:00,30,Aline,good" for n in range(MAX_REPORTED_ISSUES + 50)]
    report = run(db, *rows)
    assert report.rejected == MAX_REPORTED_ISSUES + 50
    assert len(report.issues) == MAX_REPORTED_ISSUES
    assert report.issues_truncated


# ---------------------------------------------------------------- HTTP endpoint


def upload(api, user, content: bytes, filename: str = "episodes.csv"):
    return api.post("/api/episodes/import", files={"file": (filename, content, "text/csv")}, headers=auth(user))


def test_import_endpoint_reports_and_is_idempotent(api, db, operator):
    content = SEED_CSV.read_bytes()
    first = upload(api, operator, content)
    assert first.status_code == 200
    body = first.json()
    assert (body["imported"], body["skipped_duplicates"], body["rejected"]) == (171, 2, 16)
    assert {"code": "unknown_robot", "label": "Unknown robot", "count": 1} in body["reasons"]
    assert body["issues"][0] == {
        "line": 59,
        "episode_id": None,
        "code": "missing_episode_id",
        "message": "episode_id is blank",
    }

    second = upload(api, operator, content).json()
    assert (second["imported"], second["skipped_duplicates"]) == (0, 173)
    assert episode_count(db) == 171


def test_import_accepts_a_utf8_bom(api, operator):
    response = upload(api, operator, ("﻿" + HEADER + "\n" + VALID + "\n").encode())
    assert response.json()["imported"] == 1


def test_non_utf8_file_is_refused_and_nothing_is_stored(api, db, operator):
    content = (HEADER + "\n" + VALID.replace("Aline", "Jos\xe9") + "\n").encode("latin-1")
    response = upload(api, operator, content)
    assert response.status_code == 422
    assert episode_count(db) == 0


def test_oversized_upload_is_refused(api, operator, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_import_bytes", 100)
    response = upload(api, operator, ((HEADER + "\n" + VALID + "\n") * 5).encode())
    assert response.status_code == 413


def test_import_requires_an_operator(api, client_a):
    assert upload(api, client_a, (HEADER + "\n" + VALID).encode()).status_code == 403
