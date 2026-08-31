"use client";

import { ModuleType } from "@/types/synth";

const ICONS: Record<ModuleType, JSX.Element> = {
  oscillator: (
    <path d="M1 8c1.5 0 1.5-5 3-5s1.5 10 3 10 1.5-5 3-5 1.5 5 3 5 1.5-10 3-10" />
  ),
  filter: <path d="M1 3v6c3 0 3-6 6-6s3 8 6 8 3-3 6-3" />,
  lfo: <path d="M1 8l3-5 3 5 3-5 3 5 3-5" />,
  distortion: <path d="M1 8l2-6 2 4 2-5 2 6 2-4 2 5 2-3" />,
  delay: <path d="M1 8h4M8 8a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z M17 4v8" />,
  reverb: <path d="M2 8a6 6 0 0 1 6-6M2 8a3 3 0 0 1 3-3M2 8a6 6 0 0 0 6 6M2 8a3 3 0 0 0 3 3" />,
  gain: <path d="M1 12L9 2l8 10" />,
  master: <path d="M1 8h16" />,
  sequencer: <path d="M1 3h3v10H1zM6 3h3v10H6zM11 3h3v10h-3z" />,
};

const SPAWNABLE: { type: ModuleType; label: string }[] = [
  { type: "oscillator", label: "Oscillator" },
  { type: "filter", label: "Filter" },
  { type: "lfo", label: "LFO" },
  { type: "distortion", label: "Distortion" },
  { type: "delay", label: "Delay" },
  { type: "reverb", label: "Reverb" },
  { type: "gain", label: "Gain" },
];

export default function ModulePalette({ onSpawn }: { onSpawn: (type: ModuleType) => void }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-b border-studio-line bg-studio-panel/60 px-4 py-1.5">
      <span className="mr-1 shrink-0 font-mono text-[10px] text-studio-muted">add</span>
      {SPAWNABLE.map((m) => (
        <button
          key={m.type}
          onClick={() => onSpawn(m.type)}
          title={`Add ${m.label}`}
          className="group flex shrink-0 items-center gap-1.5 rounded-full border border-studio-line bg-studio-panel2 py-1 pl-1.5 pr-3 transition hover:border-cyan-glow/60"
        >
          <svg
            width="18"
            height="16"
            viewBox="0 0 18 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-studio-muted transition group-hover:text-cyan-glow"
          >
            {ICONS[m.type]}
          </svg>
          <span className="font-mono text-[10px] text-studio-text/90">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
