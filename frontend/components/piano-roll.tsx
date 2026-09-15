"use client";
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Undo2 } from "lucide-react";
import { Note, noteName } from "@/types/project";

const ROW = 26;
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
type Drag = {
  id: string;
  x: number;
  y: number;
  note: Note;
  edge: "start" | "end" | "pitch";
  before: Note[];
};

export default function PianoRoll({
  notes,
  onChange,
  locked,
  duration,
  playing,
  playhead,
}: {
  notes: Note[];
  onChange: (n: Note[]) => void;
  locked: boolean;
  duration: number;
  playing: boolean;
  playhead: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(80);
  const [history, setHistory] = useState<Note[][]>([]);
  const drag = useRef<Drag | null>(null);
  const scroll = useRef<HTMLDivElement | null>(null);
  const [range] = useState(() => ({
    low: Math.max(21, Math.min(48, ...notes.map((n) => n.pitch)) - 3),
    high: Math.min(108, Math.max(72, ...notes.map((n) => n.pitch)) + 3),
  }));
  const low = Math.min(range.low, ...notes.map((n) => n.pitch));
  const high = Math.max(range.high, ...notes.map((n) => n.pitch));
  useEffect(() => {
    if (scroll.current)
      scroll.current.scrollTop = Math.max(
        0,
        (range.high - Math.max(...notes.map((n) => n.pitch)) - 2) * ROW,
      );
    // Keep the initial melody in view without recentering during edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const length = Math.max(duration, ...notes.map((n) => n.end), 8) + 1;
  const pitches = Array.from({ length: high - low + 1 }, (_, i) => high - i);
  const active = notes.find((n) => n.id === selected);
  const pushHistory = (before: Note[]) =>
    setHistory((h) => [...h.slice(-49), before]);
  function update(note: Note, changes: Partial<Note>) {
    const next = { ...note, ...changes };
    next.note_name = noteName(next.pitch);
    onChange(notes.map((n) => (n.id === note.id ? next : n)));
  }
  return (
    <section className="melody-surface" aria-label="피아노롤 편집기">
      <div className="roll-toolbar">
        <span>
          MELODY <b>{notes.length} notes</b>
        </span>
        <div className="icon-group">
          <button
            title="실행 취소"
            disabled={locked || playing || !history.length}
            onClick={() => {
              onChange(history[history.length - 1]);
              setHistory((h) => h.slice(0, -1));
            }}
          >
            <Undo2 size={18} />
          </button>
          <button
            title="축소"
            disabled={zoom <= 40}
            onClick={() => setZoom((z) => z - 20)}
          >
            <Minus size={18} />
          </button>
          <span>{Math.round((zoom / 80) * 100)}%</span>
          <button
            title="확대"
            disabled={zoom >= 160}
            onClick={() => setZoom((z) => z + 20)}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
      <div className="roll-scroll" ref={scroll}>
        <div
          className="roll-grid"
          style={{
            width: length * zoom + 52,
            height: pitches.length * ROW + 28,
          }}
        >
          <div className="time-ruler" style={{ width: length * zoom }}>
            {Array.from({ length: Math.ceil(length) }, (_, i) => (
              <span key={i} style={{ left: i * zoom }}>
                {i}s
              </span>
            ))}
          </div>
          {pitches.map((pitch, i) => (
            <div
              key={pitch}
              className={`pitch-row ${[1, 3, 6, 8, 10].includes(pitch % 12) ? "black-key" : ""}`}
              style={{ top: i * ROW + 28, height: ROW }}
            >
              <span className="piano-key">{noteName(pitch)}</span>
            </div>
          ))}
          <div
            className="beat-lines"
            style={{
              left: 52,
              top: 28,
              width: length * zoom,
              height: pitches.length * ROW,
              backgroundSize: `${zoom}px 100%`,
            }}
          />
          {notes.map((note) => (
            <div
              key={note.id}
              role="button"
              tabIndex={0}
              aria-label={`${note.note_name} 음표`}
              aria-pressed={selected === note.id}
              data-note-id={note.id}
              className={`note ${selected === note.id ? "selected" : ""} ${locked ? "locked" : ""}`}
              style={{
                left: note.start * zoom + 52,
                top: (high - note.pitch) * ROW + 30,
                width: Math.max(8, (note.end - note.start) * zoom),
                height: ROW - 4,
              }}
              onPointerDown={(e) => {
                setSelected(note.id);
                if (locked || playing) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                const edge = (e.target as HTMLElement).dataset.edge as
                  "start" | "end" | undefined;
                drag.current = {
                  id: note.id,
                  note: { ...note },
                  x: e.clientX,
                  y: e.clientY,
                  edge: edge || "pitch",
                  before: notes.map((n) => ({ ...n })),
                };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.id !== note.id) return;
                const seconds =
                  Math.round(((e.clientX - d.x) / zoom) * 20) / 20;
                if (d.edge === "pitch")
                  update(d.note, {
                    pitch: clamp(
                      d.note.pitch - Math.round((e.clientY - d.y) / ROW),
                      21,
                      108,
                    ),
                  });
                else if (d.edge === "start")
                  update(d.note, {
                    start: clamp(d.note.start + seconds, 0, d.note.end - 0.05),
                  });
                else
                  update(d.note, {
                    end: clamp(d.note.end + seconds, d.note.start + 0.05, 120),
                  });
              }}
              onPointerUp={() => {
                if (drag.current) pushHistory(drag.current.before);
                drag.current = null;
              }}
              onPointerCancel={() => {
                if (drag.current) onChange(drag.current.before);
                drag.current = null;
              }}
              onKeyDown={(e) => {
                if (
                  !locked &&
                  !playing &&
                  ["ArrowUp", "ArrowDown"].includes(e.key)
                ) {
                  e.preventDefault();
                  pushHistory(notes);
                  update(note, {
                    pitch: clamp(
                      note.pitch + (e.key === "ArrowUp" ? 1 : -1),
                      21,
                      108,
                    ),
                  });
                }
                if (e.key === "Enter") setSelected(note.id);
              }}
            >
              <span className="resize start" data-edge="start" />
              <span className="note-label">{note.note_name}</span>
              <span className="resize end" data-edge="end" />
            </div>
          ))}
          {playing && (
            <div
              className="playhead"
              style={{
                left: 52 + playhead * zoom,
                top: 28,
                height: pitches.length * ROW,
              }}
            />
          )}
        </div>
      </div>
      <div className="note-inspector">
        {active ? (
          <>
            <strong>{active.note_name}</strong>
            <label>
              음 높이
              <select
                aria-label="음 높이"
                value={active.pitch}
                disabled={locked || playing}
                onChange={(e) => {
                  pushHistory(notes);
                  update(active, { pitch: Number(e.target.value) });
                }}
              >
                {Array.from({ length: 88 }, (_, i) => i + 21).map((p) => (
                  <option value={p} key={p}>
                    {noteName(p)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              시작 (초)
              <input
                aria-label="음표 시작"
                type="number"
                step="0.05"
                min="0"
                max={active.end - 0.05}
                value={Number(active.start.toFixed(2))}
                disabled={locked || playing}
                onChange={(e) => {
                  pushHistory(notes);
                  update(active, {
                    start: clamp(Number(e.target.value), 0, active.end - 0.05),
                  });
                }}
              />
            </label>
            <label>
              길이 (초)
              <input
                aria-label="음표 길이"
                type="number"
                step="0.05"
                min="0.05"
                max={120 - active.start}
                value={Number((active.end - active.start).toFixed(2))}
                disabled={locked || playing}
                onChange={(e) => {
                  pushHistory(notes);
                  update(active, {
                    end:
                      active.start +
                      clamp(Number(e.target.value), 0.05, 120 - active.start),
                  });
                }}
              />
            </label>
          </>
        ) : (
          <span className="muted">선택된 음표 없음</span>
        )}
      </div>
    </section>
  );
}
