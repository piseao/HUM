from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from scripts.backup import transfer
from tests.test_projects import Analyzer, analyze, payload


def test_backup_restore_preserves_workspace_and_saved_project(tmp_path, monkeypatch):
    monkeypatch.setenv("HUM_ISOLATE_CLIENTS", "true")
    root = tmp_path / "original"
    headers = {"X-HUM-Client-ID": str(uuid4())}
    with TestClient(create_app(root, Analyzer()), headers=headers) as client:
        project = analyze(client, "song")
        key = project["id"]
        project = client.post(f"/api/projects/{key}/lock", json=payload(project)).json()
        project = client.post(f"/api/projects/{key}/save", json=payload(project)).json()
        audio = client.get(f"/api/projects/{key}/audio").content
        midi = client.get(f"/api/projects/{key}/midi").content
    backup, restored = tmp_path / "snapshot", tmp_path / "restored"
    transfer(root, backup)
    transfer(backup, restored, restore=True)
    with TestClient(create_app(restored, Analyzer()), headers=headers) as client:
        assert client.get(f"/api/projects/{key}").json() == project
        assert client.get(f"/api/projects/{key}/audio").content == audio
        assert client.get(f"/api/projects/{key}/midi").content == midi
        assert len(client.get("/api/projects").json()) == 1
        assert client.get(f"/api/projects/{key}", headers={"X-HUM-Client-ID": str(uuid4())}).status_code == 404
    assert not list(restored.rglob(".lock"))


@pytest.mark.parametrize("damage", ["changed", "missing", "extra"])
def test_corrupt_backup_never_creates_destination(tmp_path, damage):
    root = tmp_path / "source"
    root.mkdir()
    (root / "original_audio.wav").write_bytes(b"original")
    backup = tmp_path / "snapshot"
    transfer(root, backup)
    audio = backup / "data/original_audio.wav"
    if damage == "changed":
        audio.write_bytes(b"changed")
    elif damage == "missing":
        audio.unlink()
    else:
        (backup / "data/extra").write_bytes(b"extra")
    with pytest.raises(ValueError):
        transfer(backup, tmp_path / "restored", restore=True)
    assert not (tmp_path / "restored").exists()


def test_existing_destination_and_symlinks_rejected(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    original = source / "audio"
    original.write_bytes(b"keep")
    with pytest.raises(ValueError):
        transfer(source, source)
    with pytest.raises(ValueError):
        transfer(source, source / "backup")
    (source / "link").symlink_to(original)
    with pytest.raises(ValueError):
        transfer(source, tmp_path / "snapshot")
    assert original.read_bytes() == b"keep"
