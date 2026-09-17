import logging
import os
import tempfile
import hashlib
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
from starlette.concurrency import run_in_threadpool
from app.models.project import Audio, Project, ProjectEdit, AnalyzeRequest
from app.services.analysis import AudioError, BasicPitchAnalyzer, decode_audio, midi_bytes
from app.services.projects import Conflict, ProjectService
from app.services.repository import JsonProjectRepository
from app.services.storage import LocalStorage
from app.services.stt import UnconfiguredSpeechToText
from app.services.jobs import AnalysisJobs

ROOT = Path(os.environ.get("HUM_DATA_DIR", Path(__file__).resolve().parents[1] / "projects"))
MAX_BYTES = 25 * 1024 * 1024


def create_app(data_dir: Path = ROOT, analyzer=None):
    jobs = AnalysisJobs()

    @asynccontextmanager
    async def lifespan(app):
        yield
        jobs.close()

    app = FastAPI(title="HUM Phase 1", version="0.1.0", lifespan=lifespan)
    repo = JsonProjectRepository(LocalStorage(data_dir))
    service = ProjectService(repo, analyzer or BasicPitchAnalyzer(), UnconfiguredSpeechToText())
    app.state.repository = repo
    isolate = os.environ.get("HUM_ISOLATE_CLIENTS", "false").lower() == "true"
    allowed = {"http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"}
    allowed.update(origin.strip().rstrip("/") for origin in os.environ.get("HUM_ALLOWED_ORIGINS", "").split(",") if origin.strip())
    if "*" in allowed:
        raise ValueError("HUM_ALLOWED_ORIGINS requires explicit origins, not a wildcard.")

    def workspace(request: Request):
        if not isolate:
            return repo, service
        try:
            client_id = str(UUID(request.headers.get("X-HUM-Client-ID", "")))
        except ValueError:
            raise HTTPException(401, "이 브라우저의 테스트 저장 공간을 확인할 수 없습니다. HUM 화면에서 다시 시도해 주세요.")
        # Separate anonymous testers without sending identity tokens in media URLs.
        folder = hashlib.sha256(client_id.encode()).hexdigest()
        scoped = JsonProjectRepository(LocalStorage(data_dir / "clients" / folder))
        return scoped, ProjectService(scoped, service.analyzer, service.stt)

    @app.middleware("http")
    async def local_guard(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin and origin not in allowed:
            return JSONResponse({"detail": "허용되지 않은 요청입니다."}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    app.add_middleware(
        CORSMiddleware, allow_origins=sorted(allowed), allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Content-Type", "X-HUM-Client-ID", "Range"],
        expose_headers=["Content-Disposition", "Content-Range", "Accept-Ranges"],
    )

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

    def get_project(project_id, repo):
        try:
            return repo.get(project_id)
        except (ValueError, FileNotFoundError):
            raise HTTPException(404, "프로젝트를 찾을 수 없습니다.")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "analysis": "basic-pitch-onnx", "stt": "unconfigured"}

    @app.post("/api/audio/upload", status_code=201)
    async def upload(request: Request, file: UploadFile = File(...), input_type: Literal["hum", "song"] = Form("hum")):
        repo, _ = workspace(request)
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
    def analyze(body: AnalyzeRequest, request: Request, background: bool = False):
        repo, service = workspace(request)
        existing = get_project(body.project_id, repo)
        if background:
            if existing.status != "draft":
                return completed(existing)
            key = (str(repo.storage.path("")), body.project_id)
            jobs.submit(key, service, body.project_id)
            return JSONResponse({"status": "analyzing", "project_id": body.project_id,
                                 "job_id": body.project_id, **jobs.snapshot(key)}, status_code=202)
        project = service.analyze(body.project_id)
        return {"project_id": project.id, "tempo": project.tempo, "notes": project.melody.edited_notes, "project": project}

    def completed(project):
        return {"status": "complete", "job_id": project.id, "project_id": project.id,
                "stage": "complete", "progress": 100, "message": "멜로디를 찾았어요.",
                "project": project}

    @app.get("/api/audio/analyze/{project_id}/status")
    @app.get("/api/audio/analyze/{project_id}")
    def analysis_status(project_id: str, request: Request):
        repo, _ = workspace(request)
        project = get_project(project_id, repo)
        if project.status != "draft":
            return completed(project)
        key = (str(repo.storage.path("")), project_id)
        result = jobs.status(key)
        return completed(result) if result else {"status": "analyzing", "job_id": project_id,
                                               "project_id": project_id, **jobs.snapshot(key)}

    @app.get("/api/projects")
    def list_projects(request: Request):
        repo, _ = workspace(request)
        return [{"id": p.id, "title": p.title, "updated_at": p.updated_at, "status": p.status,
                 "input_type": p.input_type, "duration": p.audio.duration, "locked": p.melody.locked} for p in repo.list()]

    @app.get("/api/projects/{project_id}")
    def read_project(project_id: str, request: Request):
        repo, _ = workspace(request)
        return get_project(project_id, repo)

    @app.put("/api/projects/{project_id}")
    def edit_project(project_id: str, body: ProjectEdit, request: Request):
        repo, service = workspace(request)
        get_project(project_id, repo)
        return service.edit(project_id, body, "edit")

    @app.post("/api/projects/{project_id}/lock")
    def lock_project(project_id: str, body: ProjectEdit, request: Request):
        repo, service = workspace(request)
        get_project(project_id, repo)
        return service.edit(project_id, body, "lock")

    @app.post("/api/projects/{project_id}/save")
    def save_project(project_id: str, body: ProjectEdit, request: Request):
        repo, service = workspace(request)
        get_project(project_id, repo)
        return service.edit(project_id, body, "save")

    @app.get("/api/projects/{project_id}/audio")
    def original_audio(project_id: str, request: Request):
        repo, _ = workspace(request)
        p = get_project(project_id, repo)
        return FileResponse(repo.storage.path(repo.key(p.id, p.audio.original)), media_type=p.audio.content_type)

    @app.get("/api/projects/{project_id}/midi")
    def download_midi(project_id: str, request: Request):
        repo, _ = workspace(request)
        p = get_project(project_id, repo)
        return Response(midi_bytes(p.melody.edited_notes, p.tempo), media_type="audio/midi", headers={"Content-Disposition": 'attachment; filename="melody.mid"'})

    return app


app = create_app()
