import hashlib
import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient
from app.main import create_app
from app.models.project import Note
from app.services.analysis import AudioError


def wav(duration=3, silent=False):
    t = np.arange(int(duration * 22050)) / 22050
    signal = np.zeros_like(t) if silent else 0.4 * np.sin(2 * np.pi * 261.6256 * t)
    output = io.BytesIO()
    sf.write(output, signal, 22050, format="WAV")
    return output.getvalue()


class Analyzer:
    def analyze(self, path):
        return [Note(id="note_1", pitch=60, start=0, end=1, velocity=0.8)], 120, "default"


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path, Analyzer()))


def upload(client, data=None, mode="hum"):
    return client.post("/api/audio/upload", files={"file": ("voice.wav", wav() if data is None else data, "audio/wav")}, data={"input_type": mode})


def analyze(client, mode="hum"):
    response = upload(client, mode=mode)
    assert response.status_code == 201
    project_id = response.json()["project_id"]
    response = client.post("/api/audio/analyze", json={"project_id": project_id})
    assert response.status_code == 200
    return response.json()["project"]


def payload(project):
    return {"revision": project["revision"], "title": "테스트 멜로디", "notes": project["melody"]["edited_notes"], "lyrics_edited": "나의 노래"}


def test_edit_lock_save_restart_preserves_originals(client, tmp_path):
    p = analyze(client, "song")
    folder = tmp_path / p["id"]
    hashes = {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in ["original_audio.wav", "original_notes.json"]}
    assert p["lyrics"]["status"] == "unconfigured"
    edit = payload(p)
    edit["notes"][0]["pitch"] = 62
    edit["notes"][0]["end"] = 1.5
    response = client.put(f'/api/projects/{p["id"]}', json=edit)
    assert response.status_code == 200
    p = response.json()
    assert p["melody"]["edited_notes"][0]["note_name"] == "D4"
    assert p["melody"]["original_notes"][0]["pitch"] == 60
    assert client.put(f'/api/projects/{p["id"]}', json=edit).status_code == 409
    assert client.post(f'/api/projects/{p["id"]}/save', json=payload(p)).status_code == 409
    p = client.post(f'/api/projects/{p["id"]}/lock', json=payload(p)).json()
    assert p["melody"]["locked"]
    modified = payload(p)
    modified["notes"][0]["pitch"] = 64
    assert client.put(f'/api/projects/{p["id"]}', json=modified).status_code == 409
    p = client.get(f'/api/projects/{p["id"]}').json()
    response = client.post(f'/api/projects/{p["id"]}/save', json=payload(p))
    assert response.status_code == 200
    assert response.json()["status"] == "saved"
    reopened = TestClient(create_app(tmp_path, Analyzer())).get(f'/api/projects/{p["id"]}').json()
    assert reopened["melody"]["edited_notes"][0]["pitch"] == 62
    assert reopened["lyrics"]["original"] == ""
    assert reopened["lyrics"]["edited"] == "나의 노래"
    assert client.get(f'/api/projects/{p["id"]}/midi').content.startswith(b"MThd")
    assert client.post("/api/audio/analyze", json={"project_id": p["id"]}).json()["project"]["status"] == "saved"
    for name, digest in hashes.items():
        assert hashlib.sha256((folder / name).read_bytes()).hexdigest() == digest


@pytest.mark.parametrize("data", [b"", b"invalid audio", wav(0.3)])
def test_invalid_upload(client, data):
    response = upload(client, data)
    assert response.status_code in (400, 422)
    assert isinstance(response.json()["detail"], str)


def test_missing_project_and_malicious_input(client):
    assert client.get("/api/projects/not-a-uuid").status_code == 404
    assert client.post("/api/audio/upload").status_code == 422
    assert client.post("/api/audio/upload", files={"file": ("file.html", b"html", "text/html")}).status_code == 415
    assert client.post("/api/audio/analyze", json={"project_id": "../escape"}).status_code == 404
    assert client.get("/api/projects", headers={"Origin": "https://untrusted.example"}).status_code == 403
    p = analyze(client)
    body = payload(p)
    body["notes"][0]["end"] = 0
    assert client.put(f'/api/projects/{p["id"]}', json=body).status_code == 422


def test_analysis_failure_preserves_audio(tmp_path):
    class Failing:
        def analyze(self, path):
            raise AudioError("멜로디 분석에 실패했습니다.")
    client = TestClient(create_app(tmp_path, Failing()))
    p = upload(client).json()["project"]
    assert client.post("/api/audio/analyze", json={"project_id": p["id"]}).status_code == 422
    assert (tmp_path / p["id"] / "original_audio.wav").exists()
    assert client.get(f'/api/projects/{p["id"]}').json()["status"] == "draft"


def test_immutable_storage(client, tmp_path):
    p = analyze(client)
    storage = client.app.state.repository.storage
    with pytest.raises(FileExistsError):
        storage.write(f'{p["id"]}/original_audio.wav', b"replacement", immutable=True)
    with pytest.raises(ValueError):
        storage.path("../escape")


def test_concurrent_edits_have_one_winner(client):
    p = analyze(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(client.put, f'/api/projects/{p["id"]}', json=payload(p)) for _ in range(2)]
    assert sorted(f.result().status_code for f in futures) == [200, 409]


def test_midi_failure_does_not_lock(client, monkeypatch):
    p = analyze(client)
    def fail(*args):
        raise AudioError("MIDI 파일 생성에 실패했습니다.")
    monkeypatch.setattr("app.services.projects.midi_bytes", fail)
    assert client.post(f'/api/projects/{p["id"]}/lock', json=payload(p)).status_code == 422
    assert not client.get(f'/api/projects/{p["id"]}').json()["melody"]["locked"]
