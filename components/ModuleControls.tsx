"use client";

import { ModuleParam } from "@/types/synth";

export default function ModuleControls({
  moduleId,
  paramName,
  param,
  onChange,
  onToggleLock,
  flashing,
}: {
  moduleId: string;
  paramName: string;
  param: ModuleParam;
  onChange: (value: number | string) => void;
  onToggleLock: (locked: boolean) => void;
  flashing?: boolean;
}) {
  const isSelect = !!param.options;

  return (
    <div className={`flex items-center gap-1.5 rounded py-0.5 transition-colors ${flashing ? "bg-magenta-glow/20" : ""}`}>
      <button
        title={param.isLocked ? "Locked — click to unlock" : "Unlocked — click to lock"}
        onClick={() => onToggleLock(!param.isLocked)}
        className={`shrink-0 font-mono text-[10px] leading-none ${
          param.isLocked ? "text-magenta-glow" : "text-studio-muted/50 hover:text-studio-muted"
        }`}
      >
        {param.isLocked ? "\u{1F512}" : "\u{1F513}"}
      </button>
      <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wide text-studio-muted">
        {paramName}
      </span>

      {isSelect ? (
        <select
          value={String(param.value)}
          disabled={param.isLocked}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded border border-studio-line bg-studio-panel2 px-1 py-0.5 font-mono text-[10px] text-studio-text disabled:opacity-40"
        >
          {param.options!.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
            type="range"
            min={param.min ?? 0}
            max={param.max ?? 1}
            step={param.step ?? 0.01}
            value={Number(param.value)}
            disabled={param.isLocked}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-1 flex-1 accent-cyan-glow disabled:opacity-40"
          />
          <span className="w-12 shrink-0 text-right font-mono text-[10px] text-studio-muted">
            {typeof param.value === "number" ? Math.round(param.value * 100) / 100 : param.value}
            {param.unit ?? ""}
          </span>
        </>
      )}
    </div>
  );
}
