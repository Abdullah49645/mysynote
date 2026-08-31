"use client";

import { SynthModule as SynthModuleType } from "@/types/synth";
import ModuleControls from "./ModuleControls";

const TYPE_ACCENT: Record<string, { border: string; strip: string }> = {
  oscillator: { border: "border-cyan-glow/30", strip: "bg-cyan-glow/60" },
  filter: { border: "border-magenta-glow/30", strip: "bg-magenta-glow/60" },
  lfo: { border: "border-cyan-glow/30", strip: "bg-cyan-glow/60" },
  distortion: { border: "border-magenta-glow/30", strip: "bg-magenta-glow/60" },
  delay: { border: "border-cyan-glow/30", strip: "bg-cyan-glow/60" },
  reverb: { border: "border-cyan-glow/30", strip: "bg-cyan-glow/60" },
  gain: { border: "border-studio-line", strip: "bg-studio-muted/40" },
  master: { border: "border-amber-glow/40", strip: "bg-amber-glow/70" },
  sequencer: { border: "border-studio-line", strip: "bg-studio-muted/40" },
};

function Screw() {
  return (
    <span className="pointer-events-none block h-[3px] w-[3px] rounded-full bg-black/60 shadow-[0_1px_0_rgba(255,255,255,0.06)]" />
  );
}

export default function SynthModule({
  module,
  onDragStart,
  onParamChange,
  onToggleLock,
  onRemove,
  onPortPointerDown,
  onPortPointerUp,
  selected,
  flashingParam,
}: {
  module: SynthModuleType;
  onDragStart: (e: React.PointerEvent) => void;
  onParamChange: (paramName: string, value: number | string) => void;
  onToggleLock: (paramName: string, locked: boolean) => void;
  onRemove: () => void;
  onPortPointerDown: (port: string, e: React.PointerEvent) => void;
  onPortPointerUp: (port: string, e: React.PointerEvent) => void;
  selected?: boolean;
  flashingParam?: string | null;
}) {
  const accent = TYPE_ACCENT[module.type] ?? TYPE_ACCENT.gain;

  return (
    <div
      style={{ left: module.position.x, top: module.position.y }}
      className={`group absolute w-56 select-none rounded-lg border bg-studio-panel2/95 shadow-lg backdrop-blur-sm ${accent.border} ${
        module.active ? "module-pulse" : ""
      } ${selected ? "ring-1 ring-cyan-glow" : ""}`}
    >
      {/* accent strip reads as the module's signal-path color at a glance */}
      <div className={`h-[3px] w-full rounded-t-lg ${accent.strip}`} />

      <div
        onPointerDown={onDragStart}
        className="relative flex cursor-grab items-center justify-between border-b border-studio-line bg-studio-panel px-3 py-1.5 active:cursor-grabbing"
      >
        <div className="absolute left-1 top-1">
          <Screw />
        </div>
        <div className="absolute right-1 top-1">
          <Screw />
        </div>
        <span className="pl-1.5 font-mono text-[11px] font-medium tracking-widest text-studio-text">
          {module.label}
        </span>
        <div className="flex items-center gap-2 pr-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              module.active ? "bg-cyan-glow shadow-glow-cyan" : "bg-studio-muted/40"
            }`}
          />
          {module.type !== "master" && (
            <button
              onClick={onRemove}
              title="Delete module"
              className="hidden font-mono text-[10px] leading-none text-studio-muted/60 hover:text-magenta-glow group-hover:inline"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="space-y-0.5 px-3 py-2">
        {Object.entries(module.parameters).map(([name, param]) => (
          <ModuleControls
            key={name}
            moduleId={module.id}
            paramName={name}
            param={param}
            onChange={(v) => onParamChange(name, v)}
            onToggleLock={(l) => onToggleLock(name, l)}
            flashing={flashingParam === name}
          />
        ))}
      </div>

      <div className="flex items-center justify-between px-1.5 pb-1">
        <Screw />
        <Screw />
      </div>

      {/* port markers */}
      {module.inputs.map((port, i) => (
        <div
          key={port}
          style={{ top: 16 + i * 20 }}
          onPointerUp={(e) => onPortPointerUp(port, e)}
          title={`in: ${port}`}
          className="absolute -left-2 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-studio-line bg-studio-bg transition hover:border-magenta-glow hover:shadow-glow-magenta"
        />
      ))}
      {module.outputs.map((port, i) => (
        <div
          key={port}
          style={{ top: 16 + i * 20 }}
          onPointerDown={(e) => onPortPointerDown(port, e)}
          title={`out: ${port}`}
          className="absolute -right-2 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-cyan-glow bg-studio-bg transition hover:shadow-glow-cyan"
        />
      ))}
    </div>
  );
}
