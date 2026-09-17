import threading
import time
from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import create_app
from tests.test_projects import Analyzer, upload


def test_progress_is_reported_not_time_estimated_and_survives_new_clients(tmp_path, monkeypatch):
    monkeypatch.setenv("HUM_ISOLATE_CLIENTS", "true")
    entered, finish = threading.Event(), threading.Event()

    class Reporting(Analyzer):
        def analyze_with_progress(self, path, report):
            report("pitch_analysis", 48, "목소리에서 음정을 찾고 있어요.")
            entered.set()
            assert finish.wait(5)
            report("melody_generation", 70, "음정을 멜로디로 정리하고 있어요.")
            return self.analyze(path)

    app = create_app(tmp_path, Reporting())
    headers = {"X-HUM-Client-ID": str(uuid4())}
    with TestClient(app, headers=headers) as client:
        project_id = upload(client).json()["project_id"]
        result = client.post("/api/audio/analyze?background=true", json={"project_id": project_id})
        assert result.status_code == 202
        assert result.json()["job_id"] == project_id
        assert entered.wait(2)
        try:
            for _ in range(2):
                state = client.get(f"/api/audio/analyze/{project_id}/status").json()
                assert (state["stage"], state["progress"]) == ("pitch_analysis", 48)
                time.sleep(0.05)
            reopened = TestClient(app, headers=headers)
            assert reopened.get(f"/api/audio/analyze/{project_id}").json()["progress"] == 48
            assert client.get(f"/api/audio/analyze/{project_id}/status", headers={"X-HUM-Client-ID": str(uuid4())}).status_code == 404
        finally:
            finish.set()
        for _ in range(100):
            state = client.get(f"/api/audio/analyze/{project_id}").json()
            if state["status"] == "complete":
                break
            time.sleep(0.02)
        assert state["progress"] == 100
        assert state["stage"] == "complete"
        assert state["project"]["analysis_seconds"] > 0
        with TestClient(create_app(tmp_path, Reporting()), headers=headers) as restarted:
            restored = restarted.get(f"/api/audio/analyze/{project_id}/status").json()
            assert restored["progress"] == 100
            assert restored["project"]["analysis_seconds"] == state["project"]["analysis_seconds"]


def test_interrupted_job_is_not_claimed_complete(tmp_path):
    with TestClient(create_app(tmp_path, Analyzer())) as client:
        project_id = upload(client).json()["project_id"]
    with TestClient(create_app(tmp_path, Analyzer())) as restarted:
        response = restarted.get(f"/api/audio/analyze/{project_id}/status")
        assert response.status_code == 409
        assert "다시" in response.json()["detail"]
