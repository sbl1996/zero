from __future__ import annotations

from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_path(url: str) -> None:
    if url.startswith("sqlite:///"):
        db_path = url.removeprefix("sqlite:///")
        # Relative paths are resolved from backend root.
        path = (Path(__file__).resolve().parents[1] / db_path).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)


_ensure_sqlite_path(settings.database_url)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models to ensure metadata is registered before creating tables.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
