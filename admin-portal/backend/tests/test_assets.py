from __future__ import annotations

import io
import importlib
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure the backend package is on sys.path when tests run from repository root.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture()
def api_client(tmp_path, monkeypatch) -> tuple[TestClient, Path]:
    assets_dir = tmp_path / "raw"
    assets_dir.mkdir(parents=True, exist_ok=True)
    db_path = tmp_path / "test.db"

    monkeypatch.setenv("ADMIN_PORTAL_RAW_ASSETS_DIR", str(assets_dir))
    monkeypatch.setenv("ADMIN_PORTAL_DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("ADMIN_PORTAL_API_KEY", "test-key")
    monkeypatch.setenv("ADMIN_PORTAL_READ_ONLY", "false")

    # Reload settings-dependent modules to pick up overridden environment.
    from app import config as config_module

    importlib.reload(config_module)
    from app import database as database_module

    importlib.reload(database_module)
    from app import catalog as catalog_module

    importlib.reload(catalog_module)
    from app import main as main_module

    importlib.reload(main_module)

    client = TestClient(main_module.app)
    return client, assets_dir


def test_upload_and_query_asset(api_client: tuple[TestClient, Path]) -> None:
    client, assets_dir = api_client
    payload = {
        "id": "m-test-slime",
        "asset_type": "monster",
        "title": "测试史莱姆",
        "description": "单元测试专用资源",
        "tags": '["beta", "slime"]',
        "uploaded_by": "tester",
        "notes": "first upload",
    }
    headers = {"X-API-Key": "test-key"}
    response = client.post(
        "/api/assets",
        data=payload,
        files={"file": ("m-test-slime.png", io.BytesIO(b"fakepngdata"), "image/png")},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["id"] == "m-test-slime"
    assert data["asset_type"] == "monster"
    assert data["latest_revision"]["checksum"] is not None
    assert data["latest_revision"]["file_size"] == len(b"fakepngdata")

    stored_files = list(assets_dir.iterdir())
    assert len(stored_files) == 1

    # Query listing
    list_response = client.get("/api/assets")
    assert list_response.status_code == 200
    list_data = list_response.json()
    assert list_data["pagination"]["total"] == 1
    assert list_data["items"][0]["id"] == "m-test-slime"
    assert list_data["items"][0]["latest_revision"]["file_name"] == stored_files[0].name

    # Upload a new revision and update metadata
    patch_response = client.patch(
        "/api/assets/m-test-slime",
        data={
            "description": "更新后的描述",
            "notes": "second upload",
        },
        files={"file": ("m-test-slime-new.png", io.BytesIO(b"newpngdata"), "image/png")},
        headers=headers,
    )
    assert patch_response.status_code == 200
    patched = patch_response.json()
    assert patched["description"] == "更新后的描述"
    assert len(patched["revisions"]) == 2
    assert patched["latest_revision"]["file_size"] == len(b"newpngdata")
