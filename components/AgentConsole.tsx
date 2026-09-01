"use client";

import { useEffect, useState } from "react";
import { AgentProvider } from "@/lib/agent";

const PROVIDERS: { id: AgentProvider; label: string; models: string[]; keyHint: string; keyUrl: string }[] = [
  {
    id: "gemini",
    label: "Gemini",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    keyHint: "Gemini API key",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "anthropic",
    label: "Claude",
    models: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    keyHint: "Anthropic API key",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
];

const STORAGE_KEY_PROVIDER = "mysynote_agent_provider";

function apiKeyStorageKey(provider: AgentProvider) {
  return `mysynote_apikey_${provider}`;
}
function modelStorageKey(provider: AgentProvider) {
  return `mysynote_model_${provider}`;
}

export default function AgentConsole({
  onAsk,
  running,
  reply,
  errorMsg,
}: {
  onAsk: (provider: AgentProvider, goal: string, apiKey: string, model: string) => void;
  running: boolean;
  reply: string | null;
  errorMsg: string | null;
}) {
  const [provider, setProvider] = useState<AgentProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDERS[0].models[0]);
  const [goal, setGoal] = useState("");
  const [showKey, setShowKey] = useState(false);

  const active = PROVIDERS.find((p) => p.id === provider)!;

  // Load saved provider once on mount.
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY_PROVIDER) as AgentProvider | null;
    if (saved && PROVIDERS.some((p) => p.id === saved)) setProvider(saved);
  }, []);

  // Whenever the selected provider changes, load that provider's own saved key/model.
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY_PROVIDER, provider);
    setApiKey(sessionStorage.getItem(apiKeyStorageKey(provider)) ?? "");
    setModel(sessionStorage.getItem(modelStorageKey(provider)) ?? active.models[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  useEffect(() => {
    if (apiKey) sessionStorage.setItem(apiKeyStorageKey(provider), apiKey);
  }, [apiKey, provider]);

  useEffect(() => {
    sessionStorage.setItem(modelStorageKey(provider), model);
  }, [model, provider]);

  function submit() {
    if (!goal.trim() || !apiKey.trim() || running) return;
    onAsk(provider, goal.trim(), apiKey.trim(), model);
  }

  const PRESETS = [
    "Turn this into a dark cinematic synth bass. Don't change my oscillator pitch or waveform.",
    "Keep that darker tone, but make it wider and add some movement.",
    "Make it brighter and more aggressive, but keep the tempo where it is.",
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 border-t border-studio-line bg-studio-panel p-3">
      <div className="flex shrink-0 items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-studio-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-glow/80" />
          Ask the agent
        </span>
        <div className="flex items-center gap-1">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`rounded-full border px-2 py-0.5 font-mono text-[9px] transition ${
                provider === p.id
                  ? "border-cyan-glow/60 text-cyan-glow"
                  : "border-studio-line text-studio-muted hover:text-studio-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          title={`${active.label} model`}
          className="rounded border border-studio-line bg-studio-panel2 px-1 py-0.5 font-mono text-[9px] text-studio-muted outline-none"
        >
          {active.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={active.keyHint}
          title={`Your ${active.label} API key — used directly from this browser, kept only in this tab's session storage, never sent anywhere but ${active.label}'s API`}
          className="w-32 flex-1 rounded border border-studio-line bg-studio-panel2 px-1.5 py-0.5 font-mono text-[9px] text-studio-text outline-none focus:border-cyan-glow"
        />
        <button
          onClick={() => setShowKey((s) => !s)}
          className="shrink-0 font-mono text-[10px] text-studio-muted hover:text-studio-text"
          title={showKey ? "Hide key" : "Show key"}
        >
          {showKey ? "\u{1F441}" : "\u{1F576}"}
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
        <p className="shrink-0 font-mono text-[10px] text-studio-muted/70">
          Paste a{" "}
          <a href={active.keyUrl} target="_blank" rel="noreferrer" className="underline hover:text-cyan-glow">
            {active.label} API key
          </a>{" "}
          above to enable a live agent loop (kept only in this tab).
        </p>
      )}

      <div className="flex shrink-0 flex-wrap gap-1">
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

      {/* Error/reply text is capped and internally scrollable so a long
          message (e.g. a verbose API error) can't grow this panel tall
          enough to squeeze the Spectrum/Activity panels above it out of
          view. */}
      {(errorMsg || (reply && !running)) && (
        <div className="min-h-0 max-h-24 flex-1 overflow-y-auto">
          {errorMsg && (
            <p className="whitespace-pre-wrap break-words font-mono text-[10px] text-magenta-glow">{errorMsg}</p>
          )}
          {reply && !running && (
            <div className="whitespace-pre-wrap break-words rounded border border-studio-line bg-studio-panel2/60 px-2 py-1.5 font-mono text-[11px] text-studio-text/90">
              {reply}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
