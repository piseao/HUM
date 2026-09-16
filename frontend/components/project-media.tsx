"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiBlob } from "@/lib/api";

export function OriginalAudio({
  projectId,
  onPlay,
}: {
  projectId: string;
  onPlay: () => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    setUrl("");
    setError("");
    apiBlob(`/projects/${projectId}/audio`)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId]);
  return error ? (
    <p role="alert">{error}</p>
  ) : (
    <audio
      controls
      src={url || undefined}
      aria-label="원본 녹음"
      onPlay={onPlay}
    />
  );
}

export function MidiDownload({
  projectId,
  onError,
}: {
  projectId: string;
  onError: (error: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const blob = await apiBlob(`/projects/${projectId}/midi`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "melody.mid";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      className="icon-link"
      title="저장된 MIDI 다운로드"
      disabled={busy}
      onClick={download}
    >
      <Download size={19} />
    </button>
  );
}
