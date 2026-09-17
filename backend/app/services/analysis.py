import io
import subprocess
import threading
import math
from pathlib import Path
import imageio_ffmpeg
import soundfile as sf
from app.models.project import Note


class AudioError(Exception):
    pass


def decode_audio(source: Path, destination: Path) -> float:
    try:
        subprocess.run(
            [imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-v", "error", "-y", "-i", str(source),
             "-t", "121", "-vn", "-ac", "1", "-ar", "22050", str(destination)],
            check=True, capture_output=True, timeout=45,
        )
        info = sf.info(str(destination))
    except (subprocess.SubprocessError, RuntimeError, OSError) as exc:
        raise AudioError("녹음 파일을 읽지 못했습니다. 다시 녹음하거나 WAV 파일을 선택해 주세요.") from exc
    if info.duration < 1.5:
        raise AudioError("녹음이 너무 짧습니다. 2초 이상 불러 주세요.")
    if info.duration > 120:
        raise AudioError("녹음은 최대 2분까지 분석할 수 있습니다.")
    return info.duration


def midi_bytes(notes: list[Note], tempo: float) -> bytes:
    import pretty_midi
    try:
        midi = pretty_midi.PrettyMIDI(initial_tempo=tempo)
        piano = pretty_midi.Instrument(program=0)
        for note in notes:
            piano.notes.append(pretty_midi.Note(
                velocity=max(1, round(note.velocity * 127)), pitch=note.pitch,
                start=note.start, end=note.end,
            ))
        midi.instruments.append(piano)
        output = io.BytesIO()
        midi.write(output)
        return output.getvalue()
    except Exception as exc:
        raise AudioError("MIDI 파일 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.") from exc


class BasicPitchAnalyzer:
    def __init__(self):
        self._model = None
        self._lock = threading.Lock()

    def analyze(self, path: Path) -> tuple[list[Note], float, str]:
        return self.analyze_with_progress(path, lambda *args: None)

    def analyze_with_progress(self, path: Path, report) -> tuple[list[Note], float, str]:
        # The packaged Spotify ONNX model runs locally, without API keys.
        with self._lock:
            try:
                import numpy as np
                import librosa
                from basic_pitch import FilenameSuffix, build_icassp_2022_model_path
                from basic_pitch.inference import Model, run_inference
                from basic_pitch.constants import AUDIO_N_SAMPLES, AUDIO_SAMPLE_RATE, FFT_HOP
                from basic_pitch.note_creation import model_output_to_notes
                if self._model is None:
                    self._model = Model(str(build_icassp_2022_model_path(FilenameSuffix.onnx)))
                info = sf.info(str(path))
                # Basic Pitch 0.4 pads half of its 30-frame overlap before windowing.
                overlap = 30 * FFT_HOP
                frames = math.ceil(info.frames * AUDIO_SAMPLE_RATE / info.samplerate)
                total = math.ceil((frames + overlap // 2) / (AUDIO_N_SAMPLES - overlap))
                base_model = self._model

                class ReportingModel(Model):
                    def __init__(self):
                        self.completed = 0

                    def predict(self, x):
                        output = base_model.predict(x)
                        self.completed += 1
                        report("pitch_analysis", 25 + int(45 * min(self.completed, total) / total),
                               f"목소리에서 음정을 찾고 있어요. ({self.completed}/{total} 구간)")
                        return output

                output = run_inference(str(path), ReportingModel())
                report("melody_generation", 70, "음정을 멜로디로 정리하고 있어요.")
                # Preserve predict() defaults while exposing its inference/postprocessing boundary.
                _, events = model_output_to_notes(
                    output, onset_thresh=0.5, frame_thresh=0.3,
                    min_note_len=int(np.round(127.70 / 1000 * (AUDIO_SAMPLE_RATE / FFT_HOP))),
                    min_freq=27.5, max_freq=4186.1, multiple_pitch_bends=False,
                    melodia_trick=True, midi_tempo=120,
                )
                notes = [Note(id=f"note_{i + 1}", start=round(float(start), 4), end=round(min(float(end), 120), 4),
                              pitch=int(pitch), velocity=float(np.clip(amplitude, 0, 1)))
                         for i, (start, end, pitch, amplitude, _) in enumerate(events)
                         if 21 <= pitch <= 108 and min(end, 120) - start >= 0.04]
                notes.sort(key=lambda n: (n.start, n.pitch))
                if not notes:
                    raise AudioError("멜로디를 찾지 못했습니다. 마이크 가까이에서 조금 더 또렷하게 불러 주세요.")
                report("melody_generation", 80, "멜로디의 리듬을 확인하고 있어요.")
                y, sr = librosa.load(str(path), sr=22050)
                tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
                estimate = float(np.asarray(tempo).reshape(-1)[0])
                reliable = len(beats) >= 2 and 30 <= estimate <= 240
                return notes, round(estimate, 1) if reliable else 120, "estimated" if reliable else "default"
            except AudioError:
                raise
            except Exception as exc:
                raise AudioError("멜로디 분석에 실패했습니다. 분석 환경을 확인하거나 다시 녹음해 주세요.") from exc
