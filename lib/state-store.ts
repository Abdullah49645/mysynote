"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { GraphStore } from "./synth-graph";
import { AudioEngine } from "./webaudio-engine";
import { registerWebMcpTools, buildToolDefs } from "./webmcp-tools";
import { runAgent, AgentRunError, AgentProvider } from "./agent";
import { ActivityEntry, GraphState, ModuleType } from "@/types/synth";

let storeSingleton: GraphStore | null = null;
let engineSingleton: AudioEngine | null = null;
let activityLog: ActivityEntry[] = [];
let activityListeners = new Set<(log: ActivityEntry[]) => void>();
let toolsRegistered = false;
let entryCounter = 0;

function getStore() {
  if (!storeSingleton) storeSingleton = new GraphStore();
  return storeSingleton;
}

function getEngine() {
  if (!engineSingleton) engineSingleton = new AudioEngine(getStore());
  return engineSingleton;
}

function pushActivity(actor: "human" | "agent" | "system", message: string) {
  entryCounter += 1;
  activityLog = [...activityLog, { id: `act-${entryCounter}`, actor, message, timestamp: Date.now() }].slice(-40);
  for (const l of activityListeners) l(activityLog);
}

interface TestStep {
  label: string;
  pass: boolean;
  detail?: string;
}

/**
 * Runs a condensed version of the spec's §32 acceptance test directly
 * against the live GraphStore/AudioEngine — the same objects the UI and the
 * WebMCP tools use, so a pass here is a pass for the real thing.
 */
async function runAcceptanceTest(store: GraphStore, engine: AudioEngine): Promise<{ steps: TestStep[]; passed: number; total: number }> {
  const steps: TestStep[] = [];
  const check = (label: string, cond: boolean, detail?: string) => steps.push({ label, pass: cond, detail });

  store.resetToDefault();
  const s1 = store.getState();
  check(
    "Default patch has osc, filter, lfo, distortion, delay, master",
    ["oscillator", "filter", "lfo", "distortion", "delay", "master"].every((t) =>
      Object.values(s1.modules).some((m) => m.type === t)
    )
  );

  const lockResult = store.setLock("osc-1", "frequency", true);
  check("lock_parameter(osc-1.frequency) succeeds", lockResult.success);

  const blocked = store.setParam("osc-1", "frequency", 300);
  check(
    "set_module_param on a locked parameter is rejected",
    !blocked.success && (blocked as any).error === "PARAMETER_LOCKED",
    blocked.success ? "unexpectedly succeeded" : (blocked as any).error
  );

  store.setLock("osc-1", "frequency", false);
  const unlocked = store.setParam("osc-1", "frequency", 300);
  check("set_module_param succeeds once unlocked", unlocked.success && (unlocked as any).value === 300);

  const spawn = store.spawnModule("gain", 900, 700);
  check("spawn_module creates a module present in state", spawn.success && !!store.getModule((spawn as any).module.id));

  if (spawn.success) {
    const newId = (spawn as any).module.id;
    const cable = store.patchCable(newId, "out", "master-1", "in");
    check("patch_cable connects the new module to master", cable.success);
    if (cable.success) {
      const rm = store.removeCable((cable as any).connection.id);
      check("remove_cable removes it again", rm.success);
    }
    const rmMod = store.removeModule(newId);
    check("remove_module cleans it up", rmMod.success);
  }

  const spectrum = engine.getSpectrum();
  check(
    "get_spectrum_analysis returns a well-formed snapshot",
    typeof spectrum.peakFrequency === "number" &&
      typeof spectrum.lowEnergy === "number" &&
      typeof spectrum.isClipping === "boolean"
  );

  const badParam = store.setParam("osc-1", "not_a_real_param", 5);
  check("set_module_param on an unknown parameter fails with PARAMETER_NOT_FOUND", !badParam.success && (badParam as any).error === "PARAMETER_NOT_FOUND");

  const badModule = store.setParam("not-a-real-module", "frequency", 5);
  check("set_module_param on an unknown module fails with MODULE_NOT_FOUND", !badModule.success && (badModule as any).error === "MODULE_NOT_FOUND");

  store.resetToDefault(); // leave the graph clean for the next demo run

  const passed = steps.filter((s) => s.pass).length;
  return { steps, passed, total: steps.length };
}

export function useMysynote() {
  const store = getStore();
  const engine = getEngine();
  const [state, setState] = useState<GraphState>(store.getState());
  const [activity, setActivity] = useState<ActivityEntry[]>(activityLog);
  const [ready, setReady] = useState(false);
  const [flashParam, setFlashParam] = useState<{ moduleId: string; paramName: string } | null>(null);
  const [testResult, setTestResult] = useState<{ passed: number; total: number } | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentReply, setAgentReply] = useState<string | null>(null);
  const [agentErrorMsg, setAgentErrorMsg] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    const unsub = store.subscribe(setState);
    const unsubActivity = (l: ActivityEntry[]) => setActivity(l);
    activityListeners.add(unsubActivity);
    const unsubReject = store.subscribeReject((moduleId, paramName) => {
      setFlashParam({ moduleId, paramName });
      window.setTimeout(() => setFlashParam(null), 700);
    });
    return () => {
      unsub();
      activityListeners.delete(unsubActivity);
      unsubReject();
    };
  }, [store]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (!toolsRegistered) {
      toolsRegistered = true;
      registerWebMcpTools(store, engine, pushActivity);
    }
    setReady(true);
  }, [store, engine]);

  const start = useCallback(async () => {
    await engine.resume();
    engine.startSequencer();
  }, [engine]);

  const stop = useCallback(() => {
    engine.stopSequencer();
  }, [engine]);

  const setParam = useCallback(
    (moduleId: string, paramName: string, value: number | string) => {
      const result = store.setParam(moduleId, paramName, value);
      if (result.success) {
        pushActivity("human", `${moduleId} \u2192 ${paramName} = ${typeof value === "number" ? Math.round(value * 100) / 100 : value}`);
      }
      return result;
    },
    [store]
  );

  const toggleLock = useCallback(
    (moduleId: string, paramName: string, locked: boolean) => {
      const result = store.setLock(moduleId, paramName, locked);
      if (result.success) pushActivity("human", `${locked ? "Locked" : "Unlocked"} ${moduleId}.${paramName}`);
      return result;
    },
    [store]
  );

  const setBpm = useCallback((bpm: number) => store.setBpm(bpm), [store]);

  const moveModule = useCallback((id: string, x: number, y: number) => store.moveModule(id, x, y), [store]);

  const setSequencerStep = useCallback(
    (index: number, patch: Parameters<GraphStore["setSequencerStep"]>[1]) => {
      const result = store.setSequencerStep(index, patch);
      if (result.success) pushActivity("human", `Edited step ${index + 1}`);
      return result;
    },
    [store]
  );

  const spawnModule = useCallback(
    (type: ModuleType, x: number, y: number) => {
      const result = store.spawnModule(type, x, y);
      if (result.success) pushActivity("human", `Added ${type}`);
      return result;
    },
    [store]
  );

  const removeModule = useCallback(
    (id: string) => {
      const mod = store.getModule(id);
      const result = store.removeModule(id);
      if (result.success) pushActivity("human", `Removed ${mod?.label ?? id}`);
      return result;
    },
    [store]
  );

  const patchCable = useCallback(
    (sourceModuleId: string, sourceOutput: string, targetModuleId: string, targetInput: string) => {
      const result = store.patchCable(sourceModuleId, sourceOutput, targetModuleId, targetInput);
      if (result.success) pushActivity("human", `Connected ${sourceModuleId} \u2192 ${targetModuleId}`);
      return result;
    },
    [store]
  );

  const removeCable = useCallback(
    (id: string) => {
      const result = store.removeCable(id);
      if (result.success) pushActivity("human", `Removed a cable`);
      return result;
    },
    [store]
  );

  const resetToDefault = useCallback(() => {
    engine.stopSequencer(); // stop scheduling + mute immediately, don't wait for the next reconcile
    store.resetToDefault();
    pushActivity("human", "Reset to default patch");
  }, [store, engine]);

  const runSelfTest = useCallback(async () => {
    setTestRunning(true);
    pushActivity("system", "Running acceptance self-test\u2026");
    const { steps, passed, total } = await runAcceptanceTest(store, engine);
    for (const s of steps) {
      pushActivity("system", `${s.pass ? "\u2713" : "\u2717"} ${s.label}${s.detail ? ` (${s.detail})` : ""}`);
    }
    pushActivity("system", `Self-test complete: ${passed}/${total} passed`);
    setTestResult({ passed, total });
    setTestRunning(false);
  }, [store, engine]);

  const askAgent = useCallback(
    async (provider: AgentProvider, goal: string, apiKey: string, model: string) => {
      if (!goal.trim() || !apiKey.trim()) return;
      setAgentRunning(true);
      setAgentReply(null);
      setAgentErrorMsg(null);
      pushActivity("human", `Asked the agent: "${goal}"`);
      const toolDefs = buildToolDefs(store, engine, pushActivity);
      try {
        const reply = await runAgent({
          provider,
          apiKey,
          model,
          userGoal: goal,
          toolDefs,
          onToolCall: (name, args, result) => {
            // Read-only tools (get_audio_graph_state, get_spectrum_analysis,
            // get_sequencer_state) return their data directly and have no
            // `success` field at all — only explicit `success: false` from
            // the mutating tools' ToolResult union means an actual failure.
            // Treating "no success field" as failure was logging every
            // successful read as "failed".
            if (result?.success === false) {
              const reason = result?.error ? `: ${result.error}` : "";
              pushActivity("agent", `${name} failed${reason}`);
            }
          },
        });
        setAgentReply(reply);
        pushActivity("agent", reply);
      } catch (err) {
        const raw = err instanceof AgentRunError ? err.message : String((err as Error)?.message ?? err);
        const isQuota = /429|quota/i.test(raw);
        const message = isQuota
          ? "The API quota is exhausted right now. Wait a bit and try again, or switch to a different provider/key/model above."
          : raw.length > 220
          ? raw.slice(0, 220) + "\u2026"
          : raw;
        setAgentErrorMsg(message);
        pushActivity("system", `Agent error: ${message}`);
      } finally {
        setAgentRunning(false);
      }
    },
    [store, engine]
  );

  return {
    ready,
    state,
    activity,
    flashParam,
    testResult,
    testRunning,
    start,
    stop,
    setParam,
    toggleLock,
    setBpm,
    moveModule,
    setSequencerStep,
    spawnModule,
    removeModule,
    patchCable,
    removeCable,
    resetToDefault,
    runSelfTest,
    askAgent,
    agentRunning,
    agentReply,
    agentErrorMsg,
    getSpectrum: () => engine.getSpectrum(),
    getFrequencyData: () => engine.getFrequencyData(),
  };
}
