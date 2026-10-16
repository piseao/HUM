import type { Instrument, Note } from "@/types/project";

export const instruments: { id: Instrument; label: string }[] = [
  { id: "synth", label: "기본 신스" },
  { id: "piano", label: "피아노" },
  { id: "bell", label: "벨" },
  { id: "strings", label: "스트링" },
];

const presets = {
  synth: {
    oscillator: { type: "triangle" as const },
    envelope: { attack: 0.015, decay: 0.15, sustain: 0.25, release: 0.3 },
    volume: -16,
  },
  piano: {
    oscillator: { type: "triangle" as const },
    envelope: { attack: 0.005, decay: 0.7, sustain: 0.05, release: 0.25 },
    volume: -13,
  },
  bell: {
    oscillator: { type: "sine" as const },
    envelope: { attack: 0.003, decay: 1.1, sustain: 0, release: 0.5 },
    volume: -13,
  },
  strings: {
    oscillator: { type: "sawtooth" as const },
    envelope: { attack: 0.18, decay: 0.2, sustain: 0.6, release: 0.4 },
    volume: -23,
  },
};

export async function playMelody(
  notes: Note[],
  onEnd: () => void,
  instrument: Instrument = "synth",
) {
  const Tone = await import("tone");
  await Tone.start();
  const synth = new Tone.PolySynth(Tone.Synth, presets[instrument]).toDestination();
  const start = Tone.now() + 0.1;
  for (const note of notes) {
    synth.triggerAttackRelease(
      Tone.Frequency(note.pitch, "midi").toFrequency(),
      note.end - note.start,
      start + note.start,
      Math.max(0.15, note.velocity),
    );
  }
  const timer = window.setTimeout(
    () => {
      synth.dispose();
      onEnd();
    },
    (Math.max(0, ...notes.map((n) => n.end)) + 0.6) * 1000,
  );
  return () => {
    window.clearTimeout(timer);
    synth.dispose();
  };
}
