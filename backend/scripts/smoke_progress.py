"""Compare instrumented inference with Spotify's original predict pipeline."""
from pathlib import Path
import tempfile
from basic_pitch.inference import predict
from app.services.analysis import BasicPitchAnalyzer
from scripts.smoke_analysis import make_fixture


with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / "fixture.wav"
    make_fixture(path)
    events = []
    analyzer = BasicPitchAnalyzer()
    notes, _, _ = analyzer.analyze_with_progress(path, lambda stage, progress, message: events.append((stage, progress, message)))
    _, _, reference = predict(str(path), analyzer._model, minimum_frequency=27.5, maximum_frequency=4186.1)
    actual = sorted((n.pitch, n.start, n.end, n.velocity) for n in notes)
    expected = sorted((int(pitch), round(float(start), 4), round(float(end), 4), float(amplitude))
                      for start, end, pitch, amplitude, _ in reference)
    assert actual == expected, (actual, expected)
    values = [progress for _, progress, _ in events]
    assert values == sorted(values)
    windows = [event for event in events if event[0] == "pitch_analysis"]
    assert len(windows) > 1 and windows[-1][1] == 70
    assert {stage for stage, _, _ in events} == {"pitch_analysis", "melody_generation"}
    print({"notes": len(notes), "windows": len(windows), "progress": values, "reference_equal": True})
