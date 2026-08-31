"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Connection, GraphState } from "@/types/synth";
import SynthModule from "./SynthModule";

const MODULE_WIDTH = 224; // matches w-56
const PORT_Y_BASE = 16; // matches SynthModule's port base offset
const PORT_SPACING = 20; // matches SynthModule's per-port vertical spacing

function portY(index: number) {
  return PORT_Y_BASE + index * PORT_SPACING;
}

export default function SynthCanvas({
  graph,
  onMoveModule,
  onParamChange,
  onToggleLock,
  onRemoveModule,
  onPatchCable,
  onRemoveCable,
  flashParam,
  isPlaying,
}: {
  graph: GraphState;
  onMoveModule: (id: string, x: number, y: number) => void;
  onParamChange: (moduleId: string, paramName: string, value: number | string) => void;
  onToggleLock: (moduleId: string, paramName: string, locked: boolean) => void;
  onRemoveModule: (id: string) => void;
  onPatchCable: (sourceModuleId: string, sourceOutput: string, targetModuleId: string, targetInput: string) => void;
  onRemoveCable: (id: string) => void;
  flashParam?: { moduleId: string; paramName: string } | null;
  isPlaying?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [pendingCable, setPendingCable] = useState<{ moduleId: string; port: string; x: number; y: number } | null>(
    null
  );
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const handlePointerDown = useCallback(
    (id: string) => (e: React.PointerEvent) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const mod = graph.modules[id];
      if (!mod) return;
      setSelected(id);
      dragState.current = {
        id,
        offsetX: e.clientX - containerRect.left - mod.position.x,
        offsetY: e.clientY - containerRect.top - mod.position.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [graph.modules]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      if (dragState.current) {
        const { id, offsetX, offsetY } = dragState.current;
        const x = Math.max(0, e.clientX - containerRect.left - offsetX);
        const y = Math.max(0, e.clientY - containerRect.top - offsetY);
        onMoveModule(id, x, y);
      }
      if (pendingCable) {
        setMousePos({ x: e.clientX - containerRect.left, y: e.clientY - containerRect.top });
      }
    },
    [onMoveModule, pendingCable]
  );

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
    if (pendingCable) setPendingCable(null);
  }, [pendingCable]);

  const handlePortPointerDown = useCallback(
    (moduleId: string, port: string) => (e: React.PointerEvent) => {
      e.stopPropagation();
      const mod = graph.modules[moduleId];
      if (!mod) return;
      const idx = Math.max(0, mod.outputs.indexOf(port));
      setPendingCable({ moduleId, port, x: mod.position.x + MODULE_WIDTH, y: mod.position.y + portY(idx) });
      setMousePos({ x: mod.position.x + MODULE_WIDTH, y: mod.position.y + portY(idx) });
    },
    [graph.modules]
  );

  const handlePortPointerUp = useCallback(
    (moduleId: string, port: string) => (e: React.PointerEvent) => {
      e.stopPropagation();
      if (!pendingCable) return;
      onPatchCable(pendingCable.moduleId, pendingCable.port, moduleId, port);
      setPendingCable(null);
    },
    [pendingCable, onPatchCable]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        if (tag === "input" || tag === "select") return;
        onRemoveModule(selected);
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, onRemoveModule]);

  function cablePath(conn: Connection) {
    const src = graph.modules[conn.sourceModuleId];
    const tgt = graph.modules[conn.targetModuleId];
    if (!src || !tgt) return null;
    const srcIdx = Math.max(0, src.outputs.indexOf(conn.sourceOutput));
    const tgtIdx = Math.max(0, tgt.inputs.indexOf(conn.targetInput));
    const x1 = src.position.x + MODULE_WIDTH;
    const y1 = src.position.y + portY(srcIdx);
    const x2 = tgt.position.x;
    const y2 = tgt.position.y + portY(tgtIdx);
    const midX = (x1 + x2) / 2;
    return { d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}` };
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerDown={() => setSelected(null)}
      className="studio-grid relative h-full w-full flex-1 overflow-auto bg-studio-bg"
      style={{ minHeight: 420 }}
    >
      <svg className="absolute left-0 top-0 h-[900px] w-[1600px]">
        {Object.values(graph.connections).map((conn) => {
          const path = cablePath(conn);
          if (!path) return null;
          return (
            <g key={conn.id} className="pointer-events-auto cursor-pointer" onClick={() => onRemoveCable(conn.id)}>
              {/* wide invisible hit target for easier clicking */}
              <path d={path.d} fill="none" stroke="transparent" strokeWidth={14} />
              <path d={path.d} fill="none" stroke="#4ff2e0" strokeOpacity={0.4} strokeWidth={2} />
              {isPlaying && (
                <circle r={2.6} fill="#4ff2e0" opacity={0.9}>
                  <animateMotion dur="1.1s" repeatCount="indefinite" path={path.d} />
                </circle>
              )}
            </g>
          );
        })}
        {pendingCable && mousePos && (
          <path
            d={`M ${pendingCable.x} ${pendingCable.y} L ${mousePos.x} ${mousePos.y}`}
            fill="none"
            stroke="#ff4fd8"
            strokeWidth={2}
            strokeDasharray="3 5"
          />
        )}
      </svg>

      <div className="relative h-[900px] w-[1600px]">
        {Object.values(graph.modules).map((mod) => (
          <SynthModule
            key={mod.id}
            module={mod}
            selected={selected === mod.id}
            flashingParam={flashParam?.moduleId === mod.id ? flashParam.paramName : null}
            onDragStart={handlePointerDown(mod.id)}
            onParamChange={(name, v) => onParamChange(mod.id, name, v)}
            onToggleLock={(name, locked) => onToggleLock(mod.id, name, locked)}
            onRemove={() => onRemoveModule(mod.id)}
            onPortPointerDown={(port, e) => handlePortPointerDown(mod.id, port)(e)}
            onPortPointerUp={(port, e) => handlePortPointerUp(mod.id, port)(e)}
          />
        ))}
      </div>
    </div>
  );
}
