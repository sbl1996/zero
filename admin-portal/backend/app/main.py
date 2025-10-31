from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .bootstrap import populate_initial_assets
from .config import settings
from .database import init_db
from .routers import assets, catalog, backups


def create_app() -> FastAPI:
    app = FastAPI(title="Zero Admin Asset Portal", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    init_db()
    populate_initial_assets()

    app.include_router(assets.router)
    app.include_router(catalog.router)
    app.include_router(backups.router)

    raw_assets_dir = settings.raw_assets_dir
    raw_assets_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/files/raw", StaticFiles(directory=raw_assets_dir, check_dir=False), name="raw_files")

    @app.get("/healthz", tags=["meta"])
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
