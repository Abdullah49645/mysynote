"use client";

import { useEffect, useRef } from "react";
import { ActivityEntry } from "@/types/synth";

export default function AgentActivity({ entries }: { entries: ActivityEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  return (
    <div className="flex h-full flex-col gap-2 bg-studio-panel p-3">
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-studio-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-magenta-glow/70" />
        Agent activity
      </span>
      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto pr-1">
        {entries.length === 0 && (
          <p className="font-mono text-[11px] text-studio-muted/60">
            Ask the agent to change the sound — actions will appear here.
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="flex items-start gap-1.5 font-mono text-[11px]">
            <span
              className={
                e.actor === "agent"
                  ? "text-cyan-glow"
                  : e.actor === "system"
                  ? "text-studio-muted"
                  : "text-magenta-glow"
              }
            >
              {e.actor === "agent" ? "\u2192" : e.actor === "system" ? "\u2022" : "\u25CF"}
            </span>
            <span className={e.actor === "system" ? "text-studio-muted" : "text-studio-text/90"}>{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
