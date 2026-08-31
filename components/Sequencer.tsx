"use client";

import { SequencerState } from "@/types/synth";

const NOTE_OPTIONS = ["C", "C#", "D", "D#", "Eb", "E", "F", "F#", "G", "G#", "Ab", "A", "Bb", "B"];

export default function Sequencer({
  sequencer,
  onStepChange,
}: {
  sequencer: SequencerState;
  onStepChange: (index: number, patch: Partial<{ note: string; octave: number; velocity: number; active: boolean }>) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 border-t border-studio-line bg-studio-panel px-4 py-2">
      <span className="mr-1 font-mono text-[10px] text-studio-muted">
        sequence
      </span>
      {sequencer.steps.map((step, i) => (
        <button
          key={i}
          onClick={() => onStepChange(i, { active: !step.active })}
          className={`flex h-10 w-14 flex-col items-center justify-center rounded border font-mono text-[10px] transition ${
            i === sequencer.currentStep
              ? "border-cyan-glow bg-cyan-glow/10 shadow-glow-cyan"
              : step.active
              ? "border-magenta-glow/50 bg-studio-panel2 text-studio-text"
              : "border-studio-line bg-studio-panel2/50 text-studio-muted/50"
          }`}
        >
          <span>{step.note}{step.octave}</span>
        </button>
      ))}
    </div>
  );
}
