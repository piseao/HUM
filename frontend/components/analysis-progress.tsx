"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  Circle,
  Mic,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { AnalysisProgress, Project } from "@/types/project";

const stages = [
  "upload",
  "audio_preparation",
  "pitch_analysis",
  "melody_generation",
  "editor_preparation",
];
const labels = [
  "오디오 업로드",
  "오디오 준비",
  "음정 분석",
  "멜로디 생성",
  "편집 준비",
];

export function AnalysisSummary({ project }: { project: Project }) {
  return (
    <div className="analysis-summary">
      <span>{project.melody.edited_notes.length} Notes</span>
      {project.tempo_source === "estimated" && (
        <span>약 {project.tempo} BPM</span>
      )}
      {project.analysis_seconds != null && (
        <span>분석시간 {project.analysis_seconds.toFixed(1)}초</span>
      )}
    </div>
  );
}

export default function ProgressPanel({
  progress,
  error,
  project,
  onRetry,
  onRecord,
}: {
  progress: AnalysisProgress;
  error: string;
  project: Project | null;
  onRetry: () => void;
  onRecord: () => void;
}) {
  const [display, setDisplay] = useState(progress.progress);
  const current = useRef(progress.progress);
  useEffect(() => {
    const target = progress.progress;
    if (
      target < current.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      current.current = target;
      setDisplay(target);
      return;
    }
    const from = current.current;
    const started = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const fraction = Math.min(1, (now - started) / 250);
      current.current = from + (target - from) * fraction;
      setDisplay(Math.floor(current.current));
      if (fraction < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [progress.progress]);
  const complete = progress.stage === "complete" && !error;
  const index = complete ? stages.length : stages.indexOf(progress.stage);
  return (
    <section
      className="analysis-panel"
      aria-labelledby="analysis-heading"
      aria-busy={!error && !complete}
    >
      <div className={`analysis-emblem ${error ? "failed" : ""}`}>
        {error ? (
          <TriangleAlert size={32} />
        ) : complete ? (
          <Check size={32} />
        ) : (
          <AudioLines size={32} />
        )}
      </div>
      <h1 id="analysis-heading">
        {error
          ? "멜로디를 분석하지 못했어요."
          : complete
            ? "멜로디를 찾았어요."
            : "멜로디를 찾고 있어요"}
      </h1>
      <div className="analysis-percent" aria-hidden="true">
        {display}
        <span>%</span>
      </div>
      <div
        className="analysis-track"
        role="progressbar"
        aria-label="멜로디 분석 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.progress}
      >
        <div style={{ width: `${display}%` }} />
      </div>
      <p className="analysis-message" role={error ? "alert" : "status"}>
        {error ||
          (complete && project
            ? `${project.melody.edited_notes.length}개의 음을 발견했습니다.`
            : progress.message)}
      </p>
      {complete && project && <AnalysisSummary project={project} />}
      <ol className="analysis-stages">
        {labels.map((label, i) => (
          <li
            key={label}
            className={i < index ? "done" : i === index ? "current" : ""}
            aria-current={i === index ? "step" : undefined}
          >
            {i < index ? (
              <Check size={19} />
            ) : (
              <Circle
                size={i === index ? 12 : 16}
                fill={i === index ? "currentColor" : "none"}
              />
            )}
            <span>{label}</span>
            <small>
              {i < index
                ? "완료"
                : i === index
                  ? error
                    ? "중단"
                    : "진행 중"
                  : "대기"}
            </small>
          </li>
        ))}
      </ol>
      {error && (
        <div className="analysis-actions">
          <button className="primary" onClick={onRetry}>
            <RotateCcw size={17} />
            다시 분석하기
          </button>
          <button className="secondary" onClick={onRecord}>
            <Mic size={17} />
            다시 녹음하기
          </button>
        </div>
      )}
    </section>
  );
}
