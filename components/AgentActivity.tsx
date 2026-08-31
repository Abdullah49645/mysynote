"use client";

import { useEffect, useRef, useState } from "react";
import { ActivityEntry } from "@/types/synth";

const NEAR_BOTTOM_PX = 40;

export default function AgentActivity({ entries }: { entries: ActivityEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < NEAR_BOTTOM_PX;
  }

  return (
    // min-h-0 is load-bearing here: this panel sits in a CSS grid row sized
    // `1fr`. Without min-h-0, a flex/grid item's default min-height is
    // "auto" (i.e. sized to its content), so a long run of activity entries
    // — or one long unbroken error string — silently grows this panel past
    // its allotted space instead of scrolling internally, which can push
    // the console input below it off-screen. That was the real cause of
    // "the agent panel gets stuck and I can't send another command."
    <div className="flex h-full min-h-0 flex-col gap-2 bg-studio-panel p-3">
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-studio-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-magenta-glow/70" />
        Agent activity
      </span>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
      >
        {entries.length === 0 && (
          <p className="font-mono text-[11px] text-studio-muted/60">
            Ask the agent to change the sound — actions will appear here.
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="flex min-w-0 items-start gap-1.5 font-mono text-[11px]">
            <span
              className={`shrink-0 ${
                e.actor === "agent"
                  ? "text-cyan-glow"
                  : e.actor === "system"
                  ? "text-studio-muted"
                  : "text-magenta-glow"
              }`}
            >
              {e.actor === "agent" ? "\u2192" : e.actor === "system" ? "\u2022" : "\u25CF"}
            </span>
            {/* min-w-0 + break-words: a long unbroken string (e.g. a raw API
                error) must wrap instead of forcing this row — and its grid/flex
                ancestors — wider than the panel. */}
            <span
              className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${
                e.actor === "system" ? "text-studio-muted" : "text-studio-text/90"
              }`}
            >
              {e.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
