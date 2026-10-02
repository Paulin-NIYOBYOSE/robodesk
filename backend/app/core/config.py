from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Only ever used for local development; production startup rejects it.
DEV_JWT_SECRET = "dev-only-insecure-jwt-secret-change-me"
MIN_PRODUCTION_SECRET_LENGTH = 32


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or a local .env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://robodesk:robodesk@localhost:5432/robodesk"

    jwt_secret: str = DEV_JWT_SECRET
    access_token_expire_minutes: int = Field(default=60, ge=5, le=24 * 60)

    # Comma-separated origins allowed to call the API cross-origin.
    cors_origins: str = ""

    # Upper bound for CSV uploads through the API; larger files go through the CLI.
    max_import_bytes: int = 50 * 1024 * 1024

    # Failed logins allowed per account inside the window before returning 429.
    login_max_failures: int = 5
    login_window_seconds: int = 300

    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def _require_strong_secret_in_production(self) -> "Settings":
        if self.is_production and (
            self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret) < MIN_PRODUCTION_SECRET_LENGTH
        ):
            raise ValueError(
                f"JWT_SECRET must be a random value of at least {MIN_PRODUCTION_SECRET_LENGTH} "
                "characters in production"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
