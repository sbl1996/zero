from __future__ import annotations

import io
import subprocess
from pathlib import Path

import pytest


def _sample_monster() -> dict:
    return {
        "id": "m-gamma",
        "name": "Gamma",
        "realmTier": 3,
        "hp": 250,
        "bp": 150,
        "specialization": "attacker",
        "rewards": {"gold": 60},
    }


def test_list_monsters_sorted(client):
    response = client.get("/api/monsters")
    assert response.status_code == 200
    payload = response.json()
    assert [monster["id"] for monster in payload] == ["m-alpha", "m-beta"]


def test_upsert_monster_creates_new_entry(client):
    monster = _sample_monster()
    response = client.post("/api/monsters", json=monster)
    assert response.status_code == 201
    fetched = client.get("/api/monsters").json()
    assert [item["id"] for item in fetched] == ["m-alpha", "m-beta", "m-gamma"]


def test_upsert_monster_updates_existing(client):
    updated = {
        "id": "m-beta",
        "name": "Beta Prime",
        "realmTier": 2,
        "hp": 300,
        "bp": 90,
        "specialization": "defender",
        "rewards": {"gold": 99},
    }
    response = client.post("/api/monsters", json=updated)
    assert response.status_code == 201
    payload = client.get("/api/monsters").json()
    beta = next(item for item in payload if item["id"] == "m-beta")
    assert beta["name"] == "Beta Prime"
    assert beta["hp"] == 300


def test_delete_monster(client):
    response = client.delete("/api/monsters/m-beta")
    assert response.status_code == 204
    payload = client.get("/api/monsters").json()
    assert [monster["id"] for monster in payload] == ["m-alpha"]


def test_asset_status(client):
    has_assets = client.get("/api/monsters/m-alpha/assets").json()
    assert has_assets == {"png": True, "webp": True}

    missing_assets = client.get("/api/monsters/m-beta/assets").json()
    assert missing_assets == {"png": True, "webp": True}


def test_list_all_asset_statuses(client):
    payload = client.get("/api/monsters/assets/statuses").json()
    assert payload["m-alpha"] == {"png": True, "webp": True}
    assert payload["m-beta"] == {"png": True, "webp": True}


def test_download_monster_asset_with_suffix(client):
    raw_sample = Path(__file__).resolve().parent / "data" / "assets" / "raw" / "m-alpha.png"
    webp_sample = Path(__file__).resolve().parent / "data" / "assets" / "webp" / "m-alpha.webp"

    png_response = client.get("/api/monsters/m-beta/assets/png")
    assert png_response.status_code == 200
    assert png_response.content == raw_sample.read_bytes()

    webp_response = client.get("/api/monsters/m-beta/assets/webp")
    assert webp_response.status_code == 200
    assert webp_response.content == webp_sample.read_bytes()


def test_upload_monster_png(client, tmp_path, test_settings):
    sample_png = Path(__file__).resolve().parent / "data" / "assets" / "raw" / "m-alpha.png"
    payload = io.BytesIO(sample_png.read_bytes())
    files = {"file": ("upload.png", payload, "image/png")}
    response = client.post("/api/monsters/m-beta/assets/png", files=files)
    assert response.status_code == 200
    assert response.json()["png"] is True


def test_convert_missing_assets(client, monkeypatch):
    class DummyCompleted:
        returncode = 0
        stdout = "done"
        stderr = ""

    def fake_run(*args, **kwargs):
        return DummyCompleted()

    monkeypatch.setattr(subprocess, "run", fake_run)
    response = client.post("/api/monsters/assets/convert")
    assert response.status_code == 200
    assert response.json()["succeeded"] is True
