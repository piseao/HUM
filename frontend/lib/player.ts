import type { Note } from "@/types/project";

export async function playMelody(notes: Note[], onEnd: () => void) {
  const Tone = await import("tone");
  await Tone.start();
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.015, decay: 0.15, sustain: 0.25, release: 0.3 },
    volume: -16,
  }).toDestination();
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
