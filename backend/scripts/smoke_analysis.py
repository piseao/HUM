"""Run the real Basic Pitch model on a deterministic ten-second melody."""
import argparse
import io
import json
from pathlib import Path
import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient
from app.main import create_app


def make_fixture(path):
    sr = 44100
    signal = np.zeros(sr * 10, dtype=np.float32)
    for i, pitch in enumerate([60, 62, 64, 67, 64, 62, 60, 64]):
        length = int(sr * 0.85)
        t = np.arange(length) / sr
        frequency = 440 * 2 ** ((pitch - 69) / 12)
        envelope = np.minimum(1, t / 0.04) * np.minimum(1, (0.85 - t) / 0.1)
        tone = sum(np.sin(2 * np.pi * frequency * harmonic * t) / harmonic ** 2 for harmonic in range(1, 5))
        start = int(sr * (0.5 + i * 1.1))
        signal[start:start + length] = 0.4 * envelope * tone
    sf.write(str(path), signal, sr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/tmp/hum-smoke")
    args = parser.parse_args()
    root = Path(args.output)
    root.mkdir(parents=True, exist_ok=True)
    fixture = root / "test-melody.wav"
    make_fixture(fixture)
    client = TestClient(create_app(root / "projects"))
    uploaded = client.post("/api/audio/upload", files={"file": (fixture.name, fixture.read_bytes(), "audio/wav")})
    assert uploaded.status_code == 201, uploaded.text
    project_id = uploaded.json()["project_id"]
    analyzed = client.post("/api/audio/analyze", json={"project_id": project_id})
    assert analyzed.status_code == 200, analyzed.text
    data = analyzed.json()
    pitches = [n["pitch"] for n in data["notes"]]
    assert {60, 62, 64, 67}.issubset(pitches), pitches
    assert client.get(f"/api/projects/{project_id}/midi").content.startswith(b"MThd")
    print(json.dumps({"project_id": project_id, "notes": len(pitches), "pitches": pitches, "tempo": data["tempo"], "fixture": str(fixture)}, indent=2))
