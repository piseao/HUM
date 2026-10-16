import io
import json

import pretty_midi
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from tests.test_projects import Analyzer, analyze, payload


@pytest.mark.parametrize("instrument,program", [("synth", 80), ("piano", 0), ("bell", 10), ("strings", 48)])
def test_instrument_save_after_lock_restart_and_midi(tmp_path, instrument, program):
    with TestClient(create_app(tmp_path, Analyzer())) as client:
        project = analyze(client)
        key = project["id"]
        originals = (tmp_path / key / "original_notes.json").read_bytes()
        project = client.post(f"/api/projects/{key}/lock", json=payload(project)).json()
        body = {**payload(project), "instrument": instrument}
        response = client.post(f"/api/projects/{key}/save", json=body)
        assert response.status_code == 200
        saved = response.json()
        assert saved["instrument"] == instrument
        assert saved["melody"] == project["melody"]
        assert client.post(f"/api/projects/{key}/save", json=body).status_code == 409
        # Older clients that omit the field must preserve the stored selection.
        response = client.post(f"/api/projects/{key}/save", json=payload(saved))
        assert response.json()["instrument"] == instrument
    with TestClient(create_app(tmp_path, Analyzer())) as client:
        assert client.get(f"/api/projects/{key}").json()["instrument"] == instrument
        midi = pretty_midi.PrettyMIDI(io.BytesIO(client.get(f"/api/projects/{key}/midi").content))
        assert midi.instruments[0].program == program
        assert midi.instruments[0].notes[0].pitch == 60
    assert (tmp_path / key / "original_notes.json").read_bytes() == originals


def test_legacy_project_and_invalid_instrument(tmp_path):
    with TestClient(create_app(tmp_path, Analyzer())) as client:
        project = analyze(client)
        path = tmp_path / project["id"] / "project.json"
        legacy = json.loads(path.read_text())
        legacy.pop("instrument")
        path.write_text(json.dumps(legacy))
        url = f'/api/projects/{project["id"]}'
        assert client.get(url).json()["instrument"] == "synth"
        response = client.put(url, json={**payload(project), "instrument": "unknown"})
        assert response.status_code == 422
        assert client.get(url).json()["revision"] == project["revision"]
