import json
from pathlib import Path
from typing import Protocol
from uuid import UUID
from filelock import FileLock
from app.models.project import Project, now
from app.services.storage import LocalStorage, Storage, json_bytes


class ProjectRepository(Protocol):
    def get(self, project_id: str) -> Project: ...
    def save(self, project: Project) -> None: ...
    def list(self) -> list[Project]: ...


class JsonProjectRepository:
    def __init__(self, storage: Storage):
        self.storage = storage

    def key(self, project_id: str, filename: str = "project.json") -> str:
        return f"{UUID(project_id)}/{filename}"

    def lock(self, project_id: str):
        path = self.storage.path(self.key(project_id, ".lock"))
        path.parent.mkdir(parents=True, exist_ok=True)
        return FileLock(str(path), timeout=300)

    def get(self, project_id: str) -> Project:
        return Project.model_validate_json(self.storage.read(self.key(project_id)))

    def save(self, project: Project) -> None:
        project.updated_at = now()
        project.revision += 1
        # project.json is authoritative; edited_notes.json and MIDI are exports.
        self.storage.write(self.key(project.id, "edited_notes.json"), json_bytes([n.model_dump() for n in project.melody.edited_notes]))
        self.storage.write(self.key(project.id), project.model_dump_json(indent=2).encode())

    def list(self) -> list[Project]:
        projects = []
        for path in self.storage.path("").glob("*/project.json"):
            try:
                projects.append(self.get(path.parent.name))
            except (ValueError, OSError):
                continue
        return sorted(projects, key=lambda p: p.updated_at, reverse=True)
