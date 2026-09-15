import logging
import os
import tempfile
from pathlib import Path
from typing import Literal
from uuid import uuid4
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse, Response
from starlette.concurrency import run_in_threadpool
from app.models.project import Audio, Project, ProjectEdit, AnalyzeRequest
from app.services.analysis import AudioError, BasicPitchAnalyzer, decode_audio, midi_bytes
from app.services.projects import Conflict, ProjectService
from app.services.repository import JsonProjectRepository
from app.services.storage import LocalStorage
from app.services.stt import UnconfiguredSpeechToText

ROOT = Path(os.environ.get("HUM_DATA_DIR", Path(__file__).resolve().parents[1] / "projects"))
MAX_BYTES = 25 * 1024 * 1024


def create_app(data_dir: Path = ROOT, analyzer=None):
    app = FastAPI(title="HUM Phase 1", version="0.1.0")
    repo = JsonProjectRepository(LocalStorage(data_dir))
    service = ProjectService(repo, analyzer or BasicPitchAnalyzer(), UnconfiguredSpeechToText())
    app.state.repository = repo

    @app.middleware("http")
    async def local_guard(request: Request, call_next):
        origin = request.headers.get("origin")
        allowed = {"http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"}
        allowed.update(os.environ.get("HUM_ALLOWED_ORIGINS", "").split(","))
        if origin and origin not in allowed:
            return JSONResponse({"detail": "허용되지 않은 요청입니다."}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        return JSONResponse({"detail": "입력값을 확인해 주세요. 음표의 높이와 길이가 올바르지 않을 수 있습니다."}, status_code=422)

    @app.exception_handler(Exception)
    async def unexpected(request, exc):
        logging.exception("HUM request failed", exc_info=exc)
        return JSONResponse({"detail": "서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."}, status_code=500)

    @app.exception_handler(AudioError)
    async def audio_error(request, exc):
        logging.warning("Audio processing failed", exc_info=exc)
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(Conflict)
    async def conflict(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    def get_project(project_id):
        try:
            return repo.get(project_id)
        except (ValueError, FileNotFoundError):
            raise HTTPException(404, "프로젝트를 찾을 수 없습니다.")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "analysis": "basic-pitch-onnx", "stt": "unconfigured"}

    @app.post("/api/audio/upload", status_code=201)
    async def upload(file: UploadFile = File(...), input_type: Literal["hum", "song"] = Form("hum")):
        extensions = {"audio/webm": ".webm", "video/webm": ".webm", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/mp4": ".m4a", "audio/mpeg": ".mp3", "audio/ogg": ".ogg"}
        content_type = (file.content_type or "").split(";")[0]
        if content_type not in extensions:
            raise HTTPException(415, "지원하지 않는 오디오 형식입니다. WebM, WAV, MP3, M4A, OGG 파일을 선택해 주세요.")
        data = bytearray()
        try:
            while chunk := await file.read(1024 * 1024):
                data.extend(chunk)
                if len(data) > MAX_BYTES:
                    raise HTTPException(413, "파일은 25MB 이하로 올려 주세요.")
        finally:
            await file.close()
        if not data:
            raise HTTPException(400, "녹음 파일이 없습니다. 먼저 녹음해 주세요.")
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / ("recording" + extensions[content_type])
            decoded = Path(temp) / "analysis.wav"
            source.write_bytes(data)
            duration = await run_in_threadpool(decode_audio, source, decoded)
            project_id = str(uuid4())
            filename = "original_audio" + extensions[content_type]
            repo.storage.write(repo.key(project_id, filename), bytes(data), immutable=True)
            repo.storage.write(repo.key(project_id, "analysis.wav"), decoded.read_bytes(), immutable=True)
        project = Project(id=project_id, input_type=input_type, audio=Audio(original=filename, size=len(data), duration=duration, content_type=content_type))
        repo.save(project)
        return {"project_id": project_id, "audio": project.audio, "project": project}

    @app.post("/api/audio/analyze")
    def analyze(body: AnalyzeRequest):
        get_project(body.project_id)
        project = service.analyze(body.project_id)
        return {"project_id": project.id, "tempo": project.tempo, "notes": project.melody.edited_notes, "project": project}

    @app.get("/api/projects")
    def list_projects():
        return [{"id": p.id, "title": p.title, "updated_at": p.updated_at, "status": p.status,
                 "input_type": p.input_type, "duration": p.audio.duration, "locked": p.melody.locked} for p in repo.list()]

    @app.get("/api/projects/{project_id}")
    def read_project(project_id: str):
        return get_project(project_id)

    @app.put("/api/projects/{project_id}")
    def edit_project(project_id: str, body: ProjectEdit):
        get_project(project_id)
        return service.edit(project_id, body, "edit")

    @app.post("/api/projects/{project_id}/lock")
    def lock_project(project_id: str, body: ProjectEdit):
        get_project(project_id)
        return service.edit(project_id, body, "lock")

    @app.post("/api/projects/{project_id}/save")
    def save_project(project_id: str, body: ProjectEdit):
        get_project(project_id)
        return service.edit(project_id, body, "save")

    @app.get("/api/projects/{project_id}/audio")
    def original_audio(project_id: str):
        p = get_project(project_id)
        return FileResponse(repo.storage.path(repo.key(p.id, p.audio.original)), media_type=p.audio.content_type)

    @app.get("/api/projects/{project_id}/midi")
    def download_midi(project_id: str):
        p = get_project(project_id)
        return Response(midi_bytes(p.melody.edited_notes, p.tempo), media_type="audio/midi", headers={"Content-Disposition": 'attachment; filename="melody.mid"'})

    return app


app = create_app()
