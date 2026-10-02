# syntax=docker/dockerfile:1

# ---- runtime: the API (also used for migrations, seeding and the export worker)
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
RUN useradd --create-home --uid 10001 robodesk

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini pyproject.toml ./
COPY migrations ./migrations
COPY app ./app
COPY scripts ./scripts

USER robodesk
EXPOSE 8000
# One process: the failed-login limiter is in-memory (see NOTES.md, "Scale").
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]

# ---- test: runtime + pytest and the test suite (docker compose run --rm tests)
FROM runtime AS test
USER root
COPY requirements-dev.txt .
RUN pip install -r requirements-dev.txt
COPY tests ./tests
USER robodesk
ENV PYTEST_ADDOPTS="-p no:cacheprovider"
CMD ["pytest"]
