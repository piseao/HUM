"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  Download,
  FolderOpen,
  LoaderCircle,
  LockKeyhole,
  Mic,
  Music2,
  Play,
  Save,
  Square,
  X,
} from "lucide-react";
import Recorder from "@/components/recorder";
import PianoRoll from "@/components/piano-roll";
import { api, jsonRequest } from "@/lib/api";
import { playMelody } from "@/lib/player";
import { Project, ProjectSummary } from "@/types/project";

type View = "home" | "record" | "upload" | "analyzing" | "editor";
const statusName = {
  draft: "분석 전",
  analyzed: "편집 중",
  locked: "멜로디 확정",
  saved: "저장됨",
};

export default function Studio() {
  const [view, setView] = useState<View>("home");
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const loadProjects = useCallback(async () => {
    try {
      setProjects(await api<ProjectSummary[]>("/projects"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const stop = useCallback(() => {
    generation.current++;
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(false);
    setPlayhead(0);
  }, []);
  useEffect(() => {
    void loadProjects();
    const id = new URLSearchParams(window.location.search).get("project");
    if (id) {
      setBusy(true);
      api<Project>(`/projects/${encodeURIComponent(id)}`)
        .then((p) => {
          setProject(p);
          setView("editor");
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    }
    return () => {
      generation.current++;
      stopRef.current?.();
    };
  }, [loadProjects]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const timer = window.setInterval(
      () => setPlayhead((performance.now() - start) / 1000),
      40,
    );
    return () => clearInterval(timer);
  }, [playing]);
  const changeUrl = (id?: string) =>
    window.history.replaceState(null, "", id ? `?project=${id}` : "/");
  function home() {
    if (
      dirty &&
      !window.confirm("저장하지 않은 수정 사항이 있습니다. 나가시겠습니까?")
    )
      return;
    stop();
    setDirty(false);
    setProject(null);
    setView("home");
    setError("");
    setNotice("");
    changeUrl();
    void loadProjects();
  }
  async function open(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const p = await api<Project>(`/projects/${id}`);
      setProject(p);
      setView("editor");
      setDirty(false);
      changeUrl(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function analyze(id: string) {
    setView("analyzing");
    const result = await api<{ project: Project }>(
      "/audio/analyze",
      jsonRequest("POST", { project_id: id }),
    );
    setProject(result.project);
    setView("editor");
    setDirty(false);
  }
  async function upload(blob: Blob, mode: "hum" | "song", filename: string) {
    setBusy(true);
    setError("");
    setNotice("");
    let uploaded = false;
    try {
      if (!blob.size)
        throw new Error("녹음 파일이 없습니다. 먼저 녹음해 주세요.");
      if (blob.size > 25 * 1024 * 1024)
        throw new Error("파일은 25MB 이하로 올려 주세요.");
      setView("upload");
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("input_type", mode);
      const result = await api<{ project_id: string; project: Project }>(
        "/audio/upload",
        { method: "POST", body: form },
      );
      uploaded = true;
      setProject(result.project);
      changeUrl(result.project_id);
      await analyze(result.project_id);
    } catch (e) {
      setError((e as Error).message);
      setView(uploaded ? "editor" : "record");
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    if (!project) return;
    setBusy(true);
    setError("");
    try {
      await analyze(project.id);
    } catch (e) {
      setError((e as Error).message);
      setView("editor");
    } finally {
      setBusy(false);
    }
  }
  async function persist(action: "edit" | "lock" | "save") {
    if (!project) return;
    stop();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const p = await api<Project>(
        `/projects/${project.id}${action === "edit" ? "" : `/${action}`}`,
        jsonRequest(action === "edit" ? "PUT" : "POST", {
          revision: project.revision,
          title: project.title,
          notes: project.melody.edited_notes,
          lyrics_edited: project.lyrics.edited,
        }),
      );
      setProject(p);
      setDirty(false);
      setConfirmLock(false);
      setNotice(
        action === "lock"
          ? "이 멜로디를 원곡 멜로디로 저장합니다."
          : action === "save"
            ? "프로젝트가 저장되었습니다."
            : "수정 사항을 저장했습니다.",
      );
      void loadProjects();
    } catch (e) {
      setError((e as Error).message);
      setConfirmLock(false);
    } finally {
      setBusy(false);
    }
  }
  async function play() {
    if (playing) {
      stop();
      return;
    }
    if (!project) return;
    const token = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const halt = await playMelody(project.melody.edited_notes, () => {
        setPlaying(false);
        setPlayhead(0);
        stopRef.current = null;
      });
      if (token !== generation.current) {
        halt();
        return;
      }
      stopRef.current = halt;
      setPlaying(true);
    } catch {
      setError(
        "소리를 재생하지 못했습니다. 브라우저의 소리 설정을 확인한 후 다시 눌러 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  const processing = view === "upload" || view === "analyzing";
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <button
            className="brand"
            onClick={home}
            disabled={busy || processing}
            aria-label="HUM 홈"
          >
            <AudioLines size={29} />
            <span>HUM</span>
          </button>
          <span className="header-label">나의 첫 멜로디</span>
          <button
            className="library-link"
            onClick={home}
            disabled={busy || processing}
          >
            <FolderOpen size={17} />
            <span>내 프로젝트</span>
          </button>
        </div>
      </header>
      <main className={`shell ${view === "home" ? "home" : "studio"}`}>
        {view !== "home" && (
          <div className="workflow">
            <button
              className="back"
              disabled={busy || processing}
              onClick={home}
              title="홈으로"
            >
              <ArrowLeft size={19} />
            </button>
            <div className={view === "record" ? "active" : ""}>01 기록</div>
            <ChevronRight size={13} />
            <div className={view === "editor" || processing ? "active" : ""}>
              02 멜로디
            </div>
            <ChevronRight size={13} />
            <div className={project?.status === "saved" ? "active" : ""}>
              03 저장
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
            <button title="오류 닫기" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            <Check size={18} />
            {notice}
          </div>
        )}
        {view === "home" && (
          <>
            <section className="home-hero">
              <div className="hero-copy">
                <div className="eyebrow">YOUR VOICE. YOUR MELODY.</div>
                <h1>HUM</h1>
                <h2>
                  떠오른 멜로디를
                  <br />
                  진짜 노래로.
                </h2>
                <p>
                  흥얼거리거나 직접 불러보세요.
                  <br />
                  당신의 멜로디를 기록합니다.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    setView("record");
                    setError("");
                  }}
                >
                  <Mic size={21} />새 노래 만들기
                  <ArrowRight size={19} />
                </button>
              </div>
              <div className="hero-caption">
                <span className="tiny-dot" />A little hum. A beginning.
              </div>
            </section>
            <section className="project-library">
              <div className="section-heading">
                <h2>
                  내 프로젝트{" "}
                  <span>{projects.length.toString().padStart(2, "0")}</span>
                </h2>
                <span className="muted">이 컴퓨터에 저장됨</span>
              </div>
              {projects.length ? (
                <div className="project-list">
                  {projects.map((p) => (
                    <button
                      className="project-row"
                      key={p.id}
                      disabled={busy}
                      onClick={() => open(p.id)}
                    >
                      <span
                        className={`project-icon ${p.locked ? "finished" : ""}`}
                      >
                        {p.locked ? (
                          <LockKeyhole size={20} />
                        ) : (
                          <AudioLines size={22} />
                        )}
                      </span>
                      <span className="project-info">
                        <strong>{p.title}</strong>
                        <small>
                          {p.input_type === "hum"
                            ? "흥얼거리기"
                            : "노래 부르기"}{" "}
                          · {p.duration.toFixed(1)}초 ·{" "}
                          {new Date(p.updated_at).toLocaleDateString("ko-KR")}
                        </small>
                      </span>
                      <span className="project-status">
                        {statusName[p.status]}
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-library">
                  <Music2 size={26} />
                  <p>아직 기록된 멜로디가 없어요.</p>
                  <span>첫 번째 노래를 기다리고 있습니다.</span>
                </div>
              )}
            </section>
          </>
        )}
        {(view === "record" || view === "upload") && (
          <div hidden={view === "upload"}>
            <Recorder onAnalyze={upload} disabled={busy} />
          </div>
        )}
        {processing && (
          <section className="processing">
            <div className="processing-symbol">
              <AudioLines size={48} />
            </div>
            <div className="eyebrow">
              {view === "upload"
                ? "SAVING YOUR VOICE"
                : "LISTENING TO YOUR MELODY"}
            </div>
            <h1>
              {view === "upload"
                ? "목소리를 기록하고 있어요."
                : "멜로디를 듣고 있어요."}
            </h1>
            <p>
              {view === "upload"
                ? "원본 녹음을 안전하게 저장하고 있습니다."
                : "첫 분석에는 시간이 조금 걸릴 수 있어요."}
            </p>
            <LoaderCircle className="spin" size={24} />
          </section>
        )}
        {view === "editor" && project && (
          <>
            <section className="editor-heading">
              <div className="eyebrow">
                {project.melody.locked ? "YOUR ORIGINAL MELODY" : "YOUR MELODY"}
              </div>
              <h1>우리가 들은 멜로디입니다.</h1>
              <div className="project-title">
                <input
                  aria-label="프로젝트 이름"
                  maxLength={120}
                  value={project.title}
                  disabled={busy}
                  onChange={(e) => {
                    setProject({ ...project, title: e.target.value });
                    setDirty(true);
                  }}
                />
                <span className="status-badge">
                  {dirty ? "저장하지 않은 변경" : statusName[project.status]}
                </span>
              </div>
            </section>
            {project.status === "draft" ? (
              <section className="draft">
                <p>원본 녹음이 저장되어 있습니다.</p>
                <button className="primary" disabled={busy} onClick={retry}>
                  멜로디 분석하기
                  <ArrowRight size={18} />
                </button>
              </section>
            ) : (
              <>
                <div className="playback-toolbar">
                  <button className="primary" onClick={play} disabled={busy}>
                    {playing ? <Square size={17} /> : <Play size={17} />}{" "}
                    {playing ? "재생 정지" : "멜로디 듣기"}
                  </button>
                  <span className="tempo">
                    {project.tempo} BPM{" "}
                    <small>
                      {project.tempo_source === "estimated" ? "추정" : "기본값"}
                    </small>
                  </span>
                  <a
                    className="icon-link"
                    href={`/api/projects/${project.id}/midi`}
                    title="저장된 MIDI 다운로드"
                  >
                    <Download size={19} />
                  </a>
                </div>
                <PianoRoll
                  key={project.id}
                  notes={project.melody.edited_notes}
                  duration={project.audio.duration}
                  locked={project.melody.locked || busy}
                  playing={playing}
                  playhead={playhead}
                  onChange={(notes) => {
                    setProject({
                      ...project,
                      melody: { ...project.melody, edited_notes: notes },
                    });
                    setDirty(true);
                    setNotice("");
                  }}
                />
              </>
            )}
            <section className="original-section">
              <div>
                <h2>
                  <Mic size={17} />
                  처음 부른 목소리
                </h2>
                <span className="muted">
                  원본 · {project.audio.duration.toFixed(1)}초
                </span>
              </div>
              <audio
                controls
                src={`/api/projects/${project.id}/audio`}
                aria-label="원본 녹음"
                onPlay={stop}
              />
            </section>
            {project.input_type === "song" && (
              <section className="lyrics-section">
                <h2>나의 가사</h2>
                {["unconfigured", "unavailable"].includes(
                  project.lyrics.status,
                ) && (
                  <p className="muted">
                    가사 자동 인식은 아직 연결되지 않았습니다.
                  </p>
                )}
                <textarea
                  aria-label="가사 입력"
                  placeholder="가사를 입력해 주세요."
                  rows={6}
                  maxLength={20000}
                  disabled={busy}
                  value={project.lyrics.edited}
                  onChange={(e) => {
                    setProject({
                      ...project,
                      lyrics: { ...project.lyrics, edited: e.target.value },
                    });
                    setDirty(true);
                  }}
                />
              </section>
            )}
            {project.status !== "draft" && (
              <div className="editor-footer">
                <div>
                  <LockKeyhole size={19} />
                  <span>
                    {project.melody.locked
                      ? "내 멜로디가 확정되었습니다."
                      : "내 목소리에서 시작한 멜로디."}
                  </span>
                </div>
                <div className="footer-actions">
                  {!project.melody.locked && (
                    <button
                      className="secondary"
                      disabled={busy || !dirty}
                      onClick={() => persist("edit")}
                    >
                      <Save size={17} />
                      임시 저장
                    </button>
                  )}
                  <button
                    className="primary"
                    disabled={busy || !project.title.trim()}
                    onClick={() =>
                      project.melody.locked
                        ? persist("save")
                        : setConfirmLock(true)
                    }
                  >
                    {project.melody.locked ? (
                      <Save size={18} />
                    ) : (
                      <LockKeyhole size={18} />
                    )}{" "}
                    {project.melody.locked ? "프로젝트 저장" : "내 멜로디 확정"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>HUM</span>
        <span>Every song starts with you.</span>
        <span>PHASE 01</span>
      </footer>
      {confirmLock && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="lock-title"
            className="modal"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) setConfirmLock(false);
              if (e.key === "Tab") {
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll("button:not(:disabled)"),
                );
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  (last as HTMLElement)?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  (first as HTMLElement)?.focus();
                }
              }
            }}
          >
            <LockKeyhole size={28} />
            <h2 id="lock-title">내 멜로디를 확정할까요?</h2>
            <p>이 멜로디를 원곡 멜로디로 저장합니다.</p>
            <p className="muted">확정한 뒤에는 음표를 수정할 수 없습니다.</p>
            <div className="modal-actions">
              <button
                autoFocus
                className="secondary"
                disabled={busy}
                onClick={() => setConfirmLock(false)}
              >
                돌아가기
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => persist("lock")}
              >
                <LockKeyhole size={17} />
                확정하기
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
