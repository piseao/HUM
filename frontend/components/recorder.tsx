"use client";
import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  RotateCcw,
  ArrowRight,
  Upload,
  AudioLines,
  Music2,
} from "lucide-react";

export default function Recorder({
  onAnalyze,
  disabled,
}: {
  onAnalyze: (blob: Blob, mode: "hum" | "song", filename: string) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"hum" | "song">("hum");
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState("recording.webm");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const animation = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const started = useRef(0);
  const mounted = useRef(true);
  const release = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void context.current?.close();
    context.current = null;
    cancelAnimationFrame(animation.current);
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      release();
    };
  }, []);
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - started.current) / 1000;
      setSeconds(elapsed);
      if (elapsed >= 119) recorder.current?.stop();
    }, 100);
    return () => clearInterval(timer);
  }, [recording]);

  async function start() {
    setError("");
    setRequesting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "이 브라우저에서는 녹음할 수 없습니다. 최신 Chrome 또는 Safari에서 localhost로 접속해 주세요.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        setError("녹음 중 문제가 발생했습니다. 다시 녹음해 주세요.");
        setRecording(false);
        release();
      };
      rec.onstop = () => {
        release();
        if (!mounted.current) return;
        setRecording(false);
        if (Date.now() - started.current < 1500) {
          setBlob(null);
          setError("녹음이 너무 짧습니다. 2초 이상 불러 주세요.");
          return;
        }
        const recordingBlob = new Blob(chunks, { type: rec.mimeType });
        setBlob(recordingBlob);
        setFilename(
          rec.mimeType.includes("mp4")
            ? "recording.m4a"
            : rec.mimeType.includes("ogg")
              ? "recording.ogg"
              : "recording.webm",
        );
      };
      const ctx = new AudioContext();
      context.current = ctx;
      const source = ctx.createMediaStreamSource(media);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(values);
        const surface = canvas.current;
        const pen = surface?.getContext("2d");
        if (surface && pen) {
          pen.clearRect(0, 0, surface.width, surface.height);
          for (let i = 0; i < 48; i++) {
            const height = Math.max(4, (values[i * 2] / 255) * 100);
            pen.fillStyle = "#16785b";
            pen.fillRect(i * 7 + 3, (120 - height) / 2, 4, height);
          }
        }
        animation.current = requestAnimationFrame(draw);
      };
      setBlob(null);
      setSeconds(0);
      started.current = Date.now();
      rec.start(250);
      setRecording(true);
      draw();
    } catch (e) {
      release();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "마이크 권한이 거부되었습니다. 주소창의 사이트 설정에서 마이크를 허용해 주세요."
          : e instanceof DOMException && e.name === "NotFoundError"
            ? "마이크를 찾지 못했습니다. 마이크 연결을 확인해 주세요."
            : e instanceof Error
              ? e.message
              : "녹음을 시작하지 못했습니다.",
      );
    } finally {
      if (mounted.current) setRequesting(false);
    }
  }
  return (
    <section className="record-surface">
      <div className="eyebrow">NEW MELODY</div>
      <h1>어떤 멜로디가 떠올랐나요?</h1>
      <div className="modes" role="group" aria-label="녹음 방식">
        <button
          aria-pressed={mode === "hum"}
          disabled={recording || requesting || disabled}
          onClick={() => setMode("hum")}
        >
          <AudioLines size={22} />
          <span>
            흥얼거리기<small>멜로디만 녹음합니다.</small>
          </span>
        </button>
        <button
          aria-pressed={mode === "song"}
          disabled={recording || requesting || disabled}
          onClick={() => setMode("song")}
        >
          <Music2 size={22} />
          <span>
            노래 부르기<small>가사와 멜로디를 녹음합니다.</small>
          </span>
        </button>
      </div>
      <div className="record-center">
        <span className={`record-status ${recording ? "live" : ""}`}>
          {recording
            ? "녹음 중"
            : blob
              ? "멜로디가 기록되었습니다"
              : "당신의 멜로디를 기다리고 있어요"}
        </span>
        <div className="timer">
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:
          {String(Math.floor(seconds % 60)).padStart(2, "0")}
        </div>
        <canvas
          ref={canvas}
          width={336}
          height={120}
          className="waveform"
          aria-label="마이크 소리 크기"
        />
        {recording ? (
          <button
            className="record-button recording"
            title="정지"
            onClick={() => recorder.current?.stop()}
          >
            <Square fill="currentColor" />
          </button>
        ) : (
          <button
            className="record-button"
            title="녹음 시작"
            disabled={requesting || disabled}
            onClick={start}
          >
            <Mic size={30} />
          </button>
        )}
        <p className="muted">
          {requesting
            ? "마이크 권한을 확인하고 있습니다"
            : recording
              ? "최대 2분"
              : "녹음 시작"}
        </p>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {url && (
        <audio
          className="audio-preview"
          controls
          src={url}
          aria-label="녹음 미리 듣기"
        />
      )}
      <div className="record-actions">
        <button
          className="secondary"
          disabled={recording || requesting || disabled || !blob}
          onClick={() => {
            setBlob(null);
            setSeconds(0);
            setError("");
          }}
        >
          <RotateCcw size={17} />
          다시 녹음
        </button>
        <button
          className="primary"
          disabled={!blob || recording || disabled}
          onClick={() => blob && onAnalyze(blob, mode, filename)}
        >
          분석하기
          <ArrowRight size={18} />
        </button>
      </div>
      <label className="file-upload">
        <Upload size={16} />
        오디오 파일 가져오기
        <input
          type="file"
          accept="audio/*,.webm,.wav,.m4a,.mp3,.ogg"
          disabled={recording || requesting || disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setBlob(f);
              setFilename(f.name);
              setSeconds(0);
              setError("");
            }
            e.target.value = "";
          }}
        />
      </label>
    </section>
  );
}
