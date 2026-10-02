"""Test fixtures.

Tests run against a real PostgreSQL database (the analytics, locking and constraint
behaviour under test is PostgreSQL-specific). The database is ``<DATABASE_URL db>_test``
(DATABASE_URL from the environment or backend/.env) unless TEST_DATABASE_URL is set; it is created if missing and rebuilt from the Alembic
migrations at the start of every session, so the migrations are exercised too.
"""

import os

from sqlalchemy.engine import make_url

from app.core.config import Settings

_base_url = Settings().database_url  # environment first, then .env, then the default
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL") or make_url(_base_url).set(
    database=f"{make_url(_base_url).database}_test"
).render_as_string(hide_password=False)
# Must happen before any app module reads its settings.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["ENVIRONMENT"] = "test"

from collections.abc import Iterator  # noqa: E402
from datetime import UTC, date, datetime, timedelta  # noqa: E402
from itertools import count  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.api.routes.auth import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from tests.helpers import TEST_PASSWORD  # noqa: E402
from app.models import DatasetRequest, Episode, EpisodeQuality, RequestStatusHistory, User, UserRole  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]
SEED_DIR = BACKEND_DIR.parent / "seed"
_TABLES = "assignments, request_status_history, dataset_requests, episodes, users"


def _create_database_if_missing(url: str) -> None:
    target = make_url(url)
    admin_engine = create_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": target.database})
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{target.database}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _migrated_database() -> None:
    _create_database_if_missing(TEST_DATABASE_URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
def _clean_tables() -> None:
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    login_limiter.clear()


@pytest.fixture
def db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


@pytest.fixture
def api() -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


# ---------------------------------------------------------------- factories

_PASSWORD_HASH = hash_password(TEST_PASSWORD)  # hashed once: argon2 is slow by design
_sequence = count(1)


@pytest.fixture
def make_user(db: Session):
    def factory(role: UserRole, *, email: str | None = None, active: bool = True, name: str | None = None) -> User:
        n = next(_sequence)
        user = User(
            email=email or f"{role.value}{n}@example.com",
            name=name or f"{role.value.title()} {n}",
            role=role,
            organisation="Test Org" if role == UserRole.CLIENT else None,
            password_hash=_PASSWORD_HASH,
            is_active=active,
        )
        db.add(user)
        db.commit()
        return user

    return factory


@pytest.fixture
def admin(make_user) -> User:
    return make_user(UserRole.ADMIN)


@pytest.fixture
def operator(make_user) -> User:
    return make_user(UserRole.OPERATOR)


@pytest.fixture
def client_a(make_user) -> User:
    return make_user(UserRole.CLIENT)


@pytest.fixture
def client_b(make_user) -> User:
    return make_user(UserRole.CLIENT)


@pytest.fixture
def make_episode(db: Session):
    def factory(
        quality: EpisodeQuality = EpisodeQuality.GOOD,
        *,
        task_name: str = "pick cup",
        robot_id: str = "arm-01",
        recorded_at: datetime | None = None,
        episode_id: str | None = None,
    ) -> Episode:
        n = next(_sequence)
        episode = Episode(
            episode_id=episode_id or f"EP-T{n:05d}",
            robot_id=robot_id,
            task_name=task_name,
            recorded_at=recorded_at or datetime(2026, 8, 1, 12, 0, tzinfo=UTC),
            duration_seconds=30,
            operator_name="Aline",
            quality=quality,
        )
        db.add(episode)
        db.commit()
        return episode

    return factory


@pytest.fixture
def make_request(db: Session):
    """Insert a request directly in the given status (bypassing the workflow)."""

    def factory(client: User, *, episodes_requested: int = 2, status="submitted", task_name: str = "pick cup") -> DatasetRequest:
        request = DatasetRequest(
            client_id=client.id,
            task_name=task_name,
            episodes_requested=episodes_requested,
            deadline=date.today() + timedelta(days=30),
            status=status,
        )
        db.add(request)
        db.flush()
        db.add(RequestStatusHistory(request_id=request.id, previous_status=None, new_status=status, changed_by_id=client.id))
        db.commit()
        return request

    return factory
