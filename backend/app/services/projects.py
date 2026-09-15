import json
from app.models.project import Project, ProjectEdit
from app.services.analysis import BasicPitchAnalyzer, midi_bytes
from app.services.repository import JsonProjectRepository
from app.services.storage import json_bytes
from app.services.stt import SpeechToTextService


class Conflict(Exception):
    pass


class ProjectService:
    def __init__(self, repository: JsonProjectRepository, analyzer: BasicPitchAnalyzer, stt: SpeechToTextService):
        self.repo, self.analyzer, self.stt = repository, analyzer, stt

    def analyze(self, project_id: str) -> Project:
        with self.repo.lock(project_id):
            project = self.repo.get(project_id)
            if project.status != "draft":
                return project
            original_key = self.repo.key(project_id, "original_notes.json")
            try:
                original = json.loads(self.repo.storage.read(original_key))
                from app.models.project import Note
                notes = [Note.model_validate(n) for n in original]
                tempo, source = project.tempo, project.tempo_source
            except FileNotFoundError:
                notes, tempo, source = self.analyzer.analyze(self.repo.storage.path(self.repo.key(project_id, "analysis.wav")))
            midi = midi_bytes(notes, tempo)
            try:
                self.repo.storage.write(original_key, json_bytes([n.model_dump() for n in notes]), immutable=True)
            except FileExistsError:
                pass
            project.melody.original_notes = notes
            project.melody.edited_notes = [n.model_copy() for n in notes]
            project.tempo, project.tempo_source = tempo, source
            if project.input_type == "song":
                try:
                    transcript = self.stt.transcribe(self.repo.storage.path(self.repo.key(project_id, "analysis.wav")))
                    project.lyrics.original = transcript.text
                    project.lyrics.edited = transcript.text
                    project.lyrics.status = transcript.status
                except Exception:
                    project.lyrics.status = "unavailable"
            project.status = "analyzed"
            self.repo.storage.write(self.repo.key(project_id, "melody.mid"), midi)
            self.repo.save(project)
            return project

    def edit(self, project_id: str, edit: ProjectEdit, action: str) -> Project:
        with self.repo.lock(project_id):
            project = self.repo.get(project_id)
            if edit.revision != project.revision:
                raise Conflict("다른 화면에서 수정된 프로젝트입니다. 새로고침 후 다시 확인해 주세요.")
            if project.status == "draft":
                raise Conflict("먼저 녹음을 분석해 주세요.")
            if project.melody.locked and edit.notes != project.melody.edited_notes:
                raise Conflict("확정한 멜로디는 변경할 수 없습니다.")
            if not edit.notes:
                raise Conflict("멜로디에 음표가 있어야 합니다.")
            midi = midi_bytes(edit.notes, project.tempo)
            project.title = edit.title.strip() or "이름 없는 멜로디"
            project.melody.edited_notes = edit.notes
            project.lyrics.edited = edit.lyrics_edited
            if action == "lock":
                project.melody.locked = True
                project.status = "locked"
            elif action == "save":
                if not project.melody.locked:
                    raise Conflict("내 멜로디 확정 후 프로젝트를 저장해 주세요.")
                project.status = "saved"
            self.repo.storage.write(self.repo.key(project_id, "melody.mid"), midi)
            self.repo.save(project)
            return project
