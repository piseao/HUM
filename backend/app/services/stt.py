from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass
class Transcription:
    text: str = ""
    status: str = "unconfigured"


class SpeechToTextService(Protocol):
    def transcribe(self, audio: Path) -> Transcription: ...


class UnconfiguredSpeechToText:
    def transcribe(self, audio: Path) -> Transcription:
        return Transcription()
