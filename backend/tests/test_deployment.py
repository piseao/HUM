from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import create_app
from tests.test_projects import Analyzer, wav
import threading
import time
from app.services.analysis import AudioError


def test_cors_preflight_and_local_compatibility(tmp_path, monkeypatch):
    monkeypatch.setenv("HUM_ALLOWED_ORIGINS", "https://hum-example.vercel.app")
    client = TestClient(create_app(tmp_path, Analyzer()))
    for origin in ["https://hum-example.vercel.app", "http://localhost:3000"]:
        response = client.options("/api/audio/upload", headers={
            "Origin": origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-hum-client-id",
        })
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        response = client.get("/api/projects", headers={"Origin": origin})
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
    assert client.options("/api/projects", headers={"Origin": "https://bad.example", "Access-Control-Request-Method": "GET"}).status_code == 400


def test_cloud_testers_cannot_access_each_others_recordings(tmp_path, monkeypatch):
    monkeypatch.setenv("HUM_ISOLATE_CLIENTS", "true")
    app = create_app(tmp_path, Analyzer())
    alice = TestClient(app, headers={"X-HUM-Client-ID": str(uuid4())})
    bob = TestClient(app, headers={"X-HUM-Client-ID": str(uuid4())})
    anonymous = TestClient(app)
    assert anonymous.get("/api/health").status_code == 200
    assert anonymous.get("/api/projects").status_code == 401
    uploaded = alice.post("/api/audio/upload", files={"file": ("voice.wav", wav(), "audio/wav")})
    assert uploaded.status_code == 201
    project_id = uploaded.json()["project_id"]
    assert alice.post("/api/audio/analyze", json={"project_id": project_id}).status_code == 200
    assert len(alice.get("/api/projects").json()) == 1
    assert bob.get("/api/projects").json() == []
    for suffix in ["", "/audio", "/midi"]:
        assert alice.get(f"/api/projects/{project_id}{suffix}").status_code == 200
        assert bob.get(f"/api/projects/{project_id}{suffix}").status_code == 404
    assert bob.post("/api/audio/analyze", json={"project_id": project_id}).status_code == 404
    restarted = TestClient(create_app(tmp_path, Analyzer()), headers=dict(alice.headers))
    assert len(restarted.get("/api/projects").json()) == 1


def test_background_analysis_returns_immediately_and_preserves_result(tmp_path):
    release = threading.Event()

    class SlowAnalyzer(Analyzer):
        calls = 0

        def analyze(self, path):
            self.calls += 1
            assert release.wait(timeout=5)
            return super().analyze(path)

    analyzer = SlowAnalyzer()
    with TestClient(create_app(tmp_path, analyzer)) as client:
        project_id = client.post("/api/audio/upload", files={"file": ("voice.wav", wav(), "audio/wav")}).json()["project_id"]
        for _ in range(2):
            response = client.post("/api/audio/analyze?background=true", json={"project_id": project_id})
            assert response.status_code == 202
        assert client.get("/api/health").status_code == 200
        assert client.get(f"/api/audio/analyze/{project_id}").json()["status"] == "analyzing"
        release.set()
        for _ in range(100):
            response = client.get(f"/api/audio/analyze/{project_id}")
            if response.json()["status"] == "complete":
                break
            time.sleep(0.02)
        assert response.json()["project"]["melody"]["original_notes"]
        assert analyzer.calls == 1
        assert client.post("/api/audio/analyze?background=true", json={"project_id": project_id}).json()["status"] == "complete"


def test_background_analysis_failure_is_retryable(tmp_path):
    class FailsOnce(Analyzer):
        def analyze(self, path):
            raise AudioError("멜로디 분석에 실패했습니다.")

    with TestClient(create_app(tmp_path, FailsOnce())) as client:
        project_id = client.post("/api/audio/upload", files={"file": ("voice.wav", wav(), "audio/wav")}).json()["project_id"]
        client.post("/api/audio/analyze?background=true", json={"project_id": project_id})
        for _ in range(100):
            result = client.get(f"/api/audio/analyze/{project_id}")
            if result.status_code == 422:
                break
            time.sleep(0.01)
        assert result.status_code == 422
        assert "분석에 실패" in result.json()["detail"]
        assert client.get(f"/api/projects/{project_id}").json()["status"] == "draft"
        assert client.post("/api/audio/analyze?background=true", json={"project_id": project_id}).status_code == 202
