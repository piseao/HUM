export type Note = {
  id: string;
  pitch: number;
  note_name: string;
  start: number;
  end: number;
  velocity: number;
};
export type Project = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  revision: number;
  input_type: "hum" | "song";
  audio: {
    original: string;
    size: number;
    duration: number;
    content_type: string;
  };
  melody: { original_notes: Note[]; edited_notes: Note[]; locked: boolean };
  lyrics: { original: string; edited: string; status: string };
  tempo: number;
  tempo_source: string;
  status: "draft" | "analyzed" | "locked" | "saved";
};
export type ProjectSummary = Pick<
  Project,
  "id" | "title" | "updated_at" | "status" | "input_type"
> & { duration: number; locked: boolean };
export const noteName = (pitch: number) =>
  ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][
    pitch % 12
  ] +
  (Math.floor(pitch / 12) - 1);
