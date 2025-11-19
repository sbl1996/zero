from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.application import create_app
from app.config import Settings, override_settings


@pytest.fixture()
def test_settings(tmp_path: Path) -> Settings:
    tests_root = Path(__file__).resolve().parent
    data_src = tests_root / "data" / "monster-blueprints-test.json"
    data_file = tmp_path / "monster-blueprints.json"
    shutil.copy(data_src, data_file)

    raw_src = tests_root / "data" / "assets" / "raw" / "m-alpha.png"
    webp_src = tests_root / "data" / "assets" / "webp" / "m-alpha.webp"

    raw_assets_dir = tmp_path / "assets" / "raw"
    webp_assets_dir = tmp_path / "assets" / "webp"
    raw_assets_dir.mkdir(parents=True)
    webp_assets_dir.mkdir(parents=True)

    shutil.copy(raw_src, raw_assets_dir / "m-alpha.png")
    shutil.copy(webp_src, webp_assets_dir / "m-alpha.webp")
    shutil.copy(raw_src, raw_assets_dir / "m-beta-1.png")
    shutil.copy(webp_src, webp_assets_dir / "m-beta-1.webp")

    conversion_script = tmp_path / "portrait_to_webp.py"
    conversion_script.write_text("print('ok')\n", encoding="utf-8")

    return Settings(
        repo_root=tmp_path,
        data_file=data_file,
        raw_assets_dir=raw_assets_dir,
        webp_assets_dir=webp_assets_dir,
        conversion_script=conversion_script,
    )


@pytest.fixture()
def client(test_settings: Settings):
    override_settings(test_settings)
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
    override_settings(None)
