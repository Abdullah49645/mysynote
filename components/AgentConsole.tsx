"use client";

import { useEffect, useState } from "react";

const MODEL_OPTIONS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
const STORAGE_KEY_API = "mysynote_gemini_api_key";
const STORAGE_KEY_MODEL = "mysynote_gemini_model";

export default function AgentConsole({
  onAsk,
  running,
  reply,
  errorMsg,
}: {
  onAsk: (goal: string, apiKey: string, model: string) => void;
  running: boolean;
  reply: string | null;
  errorMsg: string | null;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0]);
  const [goal, setGoal] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setApiKey(sessionStorage.getItem(STORAGE_KEY_API) ?? "");
    setModel(sessionStorage.getItem(STORAGE_KEY_MODEL) ?? MODEL_OPTIONS[0]);
  }, []);

  useEffect(() => {
    if (apiKey) sessionStorage.setItem(STORAGE_KEY_API, apiKey);
  }, [apiKey]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY_MODEL, model);
  }, [model]);

  function submit() {
    if (!goal.trim() || !apiKey.trim() || running) return;
    onAsk(goal.trim(), apiKey.trim(), model);
  }

  const PRESETS = [
    "Turn this into a dark cinematic synth bass. Don't change my oscillator pitch or waveform.",
    "Keep that darker tone, but make it wider and add some movement.",
    "Make it brighter and more aggressive, but keep the tempo where it is.",
  ];

  return (
    <div className="flex h-full flex-col gap-2 border-t border-studio-line bg-studio-panel p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-studio-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-glow/80" />
          Ask the agent
        </span>
        <div className="flex items-center gap-1.5">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            title="Gemini model"
            className="rounded border border-studio-line bg-studio-panel2 px-1 py-0.5 font-mono text-[9px] text-studio-muted outline-none"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Gemini API key"
            title="Your Gemini API key — used directly from this browser, kept only in this tab's session storage, never sent anywhere but Google's API"
            className="w-28 rounded border border-studio-line bg-studio-panel2 px-1.5 py-0.5 font-mono text-[9px] text-studio-text outline-none focus:border-cyan-glow"
          />
          <button
            onClick={() => setShowKey((s) => !s)}
            className="font-mono text-[10px] text-studio-muted hover:text-studio-text"
            title={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? "\u{1F441}" : "\u{1F576}"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder='e.g. "Make this warmer, but don\u2019t touch the oscillator pitch"'
          disabled={running}
          className="flex-1 rounded border border-studio-line bg-studio-panel2 px-2 py-1.5 font-mono text-[11px] text-studio-text outline-none focus:border-cyan-glow disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={running || !goal.trim() || !apiKey.trim()}
          className="shrink-0 rounded-full border border-studio-line bg-studio-panel2 px-4 py-1.5 font-mono text-[10px] text-studio-text transition hover:border-cyan-glow hover:text-cyan-glow disabled:opacity-40"
        >
          {running ? "Working\u2026" : "Send"}
        </button>
      </div>

      {!apiKey && (
        <p className="font-mono text-[10px] text-studio-muted/70">
          Paste a Gemini API key above to enable a live agent loop (kept only in this tab).
        </p>
      )}

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setGoal(preset)}
            disabled={running}
            title="Fill the goal field with this preset"
            className="rounded-full border border-studio-line px-2 py-0.5 font-mono text-[9px] text-studio-muted transition hover:border-amber-glow/50 hover:text-amber-glow disabled:opacity-40"
          >
            {preset.length > 42 ? preset.slice(0, 42) + "\u2026" : preset}
          </button>
        ))}
      </div>

      {errorMsg && <p className="font-mono text-[10px] text-magenta-glow">{errorMsg}</p>}

      {reply && !running && (
        <div className="rounded border border-studio-line bg-studio-panel2/60 px-2 py-1.5 font-mono text-[11px] text-studio-text/90">
          {reply}
        </div>
      )}
    </div>
  );
}
