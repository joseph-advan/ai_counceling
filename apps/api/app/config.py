from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _normalize_database_url(value: str) -> str:
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    if value.startswith("postgres://"):
        return value.replace("postgres://", "postgresql+psycopg://", 1)
    return value


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "PCC Counseling API")
    max_turns: int = int(os.getenv("MAX_TURNS", "20"))
    database_url: str = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./pcc.db"))
    admin_api_key: str = os.getenv("ADMIN_API_KEY", "").strip()
    cors_origins: list[str] = field(default_factory=list)

    openai_api_key: str = os.getenv("OPENAI_API_KEY", "").strip()
    openai_model_case: str = os.getenv("OPENAI_MODEL_CASE", "gpt-4.1")
    openai_model_supervisor: str = os.getenv("OPENAI_MODEL_SUPERVISOR", "gpt-4.1")

    prompt_dir: Path = Path(__file__).resolve().parent / "prompts"

    def __post_init__(self) -> None:
        origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        object.__setattr__(self, "cors_origins", _split_csv(origins))


settings = Settings()
