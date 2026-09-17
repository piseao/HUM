from datetime import datetime, timezone
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Note(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    id: str = Field(min_length=1, max_length=80)
    pitch: int = Field(ge=21, le=108)
    note_name: str = ""
    start: float = Field(ge=0, le=120)
    end: float = Field(gt=0, le=120)
    velocity: float = Field(default=0.8, ge=0, le=1)

    @model_validator(mode="after")
    def validate_note(self):
        if self.end - self.start < 0.04:
            raise ValueError("음표 길이는 0.04초 이상이어야 합니다.")
        self.note_name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][self.pitch % 12] + str(self.pitch // 12 - 1)
        return self


class Audio(BaseModel):
    original: str
    size: int
    duration: float
    content_type: str


class Melody(BaseModel):
    original_notes: list[Note] = Field(default_factory=list)
    edited_notes: list[Note] = Field(default_factory=list)
    locked: bool = False


class Lyrics(BaseModel):
    original: str = ""
    edited: str = ""
    status: str = "unconfigured"


class Project(BaseModel):
    id: str
    title: str = "이름 없는 멜로디"
    created_at: str = Field(default_factory=now)
    updated_at: str = Field(default_factory=now)
    revision: int = 0
    input_type: Literal["hum", "song"]
    audio: Audio
    melody: Melody = Field(default_factory=Melody)
    lyrics: Lyrics = Field(default_factory=Lyrics)
    tempo: float = 120
    tempo_source: str = "default"
    analysis_seconds: Optional[float] = None
    status: Literal["draft", "analyzed", "locked", "saved"] = "draft"


class ProjectEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    title: str = Field(min_length=1, max_length=120)
    notes: list[Note] = Field(max_length=3000)
    lyrics_edited: str = Field(default="", max_length=20000)

    @model_validator(mode="after")
    def unique_notes(self):
        if len({n.id for n in self.notes}) != len(self.notes):
            raise ValueError("음표 ID는 중복될 수 없습니다.")
        return self


class AnalyzeRequest(BaseModel):
    project_id: str
