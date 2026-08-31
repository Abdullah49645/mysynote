"use client";

import { TransportState } from "@/types/synth";
import Logo from "./Logo";

export default function ControlHeader({
  isPlaying,
  bpm,
  transport,
  webmcpActive,
  onTogglePlay,
  onBpmChange,
  onReset,
  onRunSelfTest,
  testRunning,
  testResult,
}: {
  isPlaying: boolean;
  bpm: number;
  transport: TransportState;
  webmcpActive: boolean;
  onTogglePlay: () => void;
  onBpmChange: (bpm: number) => void;
  onReset: () => void;
  onRunSelfTest: () => void;
  testRunning: boolean;
  testResult: { passed: number; total: number } | null;
}) {
  return (
    <header className="flex items-center justify-between border-b border-studio-line bg-studio-panel px-5 py-3">
      <div className="flex items-baseline gap-3">
        <Logo />
        <span className="hidden font-mono text-[11px] text-studio-muted sm:inline">
          sound design, with an agent in the room
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-studio-line bg-studio-panel2/60 px-2.5 py-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              webmcpActive ? "bg-cyan-glow shadow-glow-cyan" : "bg-studio-muted/50"
            }`}
          />
          <span className={`font-mono text-[10px] ${webmcpActive ? "text-cyan-glow" : "text-studio-muted"}`}>
            WebMCP {webmcpActive ? "live" : "offline"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[10px] text-studio-muted">
          <label htmlFor="bpm" className="tracking-wide">
            bpm
          </label>
          <input
            id="bpm"
            type="number"
            value={bpm}
            min={40}
            max={220}
            onChange={(e) => onBpmChange(Number(e.target.value))}
            className="w-12 rounded border border-studio-line bg-studio-panel2 px-1.5 py-1 text-studio-text outline-none focus:border-cyan-glow"
          />
        </div>

        <button
          onClick={onTogglePlay}
          className="flex items-center gap-1.5 rounded-full border border-studio-line bg-studio-panel2 px-4 py-1.5 font-mono text-xs font-medium text-studio-text transition hover:border-cyan-glow hover:shadow-glow-cyan"
        >
          <span aria-hidden>{isPlaying ? "\u23F8" : "\u25B6"}</span>
          {isPlaying ? "Pause" : "Play"}
        </button>

        <div className="mx-0.5 h-4 w-px bg-studio-line" />

        <button
          onClick={onReset}
          title="Reset to default patch"
          className="rounded-full border border-transparent px-2 py-1.5 font-mono text-[10px] text-studio-muted transition hover:border-magenta-glow/50 hover:text-magenta-glow"
        >
          Reset
        </button>

        <button
          onClick={onRunSelfTest}
          disabled={testRunning}
          title="Run the acceptance self-test against the live graph"
          className="rounded-full border border-transparent px-2 py-1.5 font-mono text-[10px] text-studio-muted transition hover:border-cyan-glow/50 hover:text-cyan-glow disabled:opacity-40"
        >
          {testRunning ? "Testing\u2026" : "Self-test"}
        </button>

        {testResult && !testRunning && (
          <span
            className={`rounded-full px-2 py-1 font-mono text-[10px] ${
              testResult.passed === testResult.total
                ? "bg-cyan-glow/15 text-cyan-glow"
                : "bg-magenta-glow/15 text-magenta-glow"
            }`}
          >
            {testResult.passed}/{testResult.total} pass
          </span>
        )}
      </div>
    </header>
  );
}
