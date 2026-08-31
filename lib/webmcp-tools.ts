import { GraphStore } from "./synth-graph";
import { AudioEngine } from "./webaudio-engine";
import { ModuleType } from "@/types/synth";

export type LogFn = (actor: "human" | "agent" | "system", message: string) => void;

/**
 * Declares the shape of the WebMCP registration API so this file type-checks
 * without pulling in a browser-vendor-specific lib. At runtime we feature
 * detect the API before using it.
 *
 * document.modelContext is the current spec surface (Draft CG Report,
 * mid-2026). navigator.modelContext was the earlier name and is kept only as
 * a deprecated alias in Chrome 150+ — we register on document.modelContext
 * when present and fall back to navigator.modelContext for older
 * implementations/extensions (e.g. MCP-B) that haven't migrated yet.
 */
interface ModelContextToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  execute: (input: any) => Promise<unknown> | unknown;
}

interface ModelContextApi {
  registerTool: (def: ModelContextToolDef, options?: { signal?: AbortSignal }) => void;
  unregisterTool?: (name: string) => void;
}

declare global {
  interface Document {
    modelContext?: ModelContextApi;
  }
  interface Navigator {
    modelContext?: ModelContextApi;
  }
  interface Window {
    __mysynoteDevTools?: Record<string, (...args: any[]) => unknown>;
  }
}

export interface ToolDef extends ModelContextToolDef {}

/**
 * Wraps a raw tool result as an MCP content block. document.modelContext's
 * execute() is expected to return `{ content: [...] }` (per the WebMCP
 * examples and the use-webmcp-tool reference implementation) rather than a
 * bare object — real MCP clients parse content blocks, not arbitrary JSON
 * shapes. Our internal consumers (the dev harness, the Gemini agent loop)
 * call the same `execute` and want the raw object back, so this wrapping
 * only happens at the document.modelContext registration boundary, not in
 * the tool implementations themselves.
 */
function toMcpContent(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

/**
 * The single authoritative list of Mysynote's WebMCP tools. Every consumer —
 * document.modelContext, window.__mysynoteDevTools, and the in-app Gemini
 * agent — calls these exact functions. There is no second implementation
 * anywhere that could drift out of sync with what a real WebMCP agent gets.
 */
export function buildToolDefs(store: GraphStore, engine: AudioEngine, log: LogFn): ToolDef[] {
  /** Coerces a numeric-looking string into a number when the target param is numeric. */
  function coerceParamValue(moduleId: string, paramName: string, value: unknown): number | string {
    const mod = store.getModule(moduleId);
    const param = mod?.parameters[paramName];
    if (param && typeof param.value === "number" && typeof value !== "number") {
      const n = Number(value);
      if (!Number.isNaN(n)) return n;
    }
    return value as number | string;
  }

  return [
    {
      name: "get_audio_graph_state",
      title: "Get audio graph state",
      description:
        "Returns the complete current state of the Mysynote synth graph: every module, its type, position, parameter values, lock states, all cable connections, the sequencer pattern, and transport state. Call this before making any changes so you never operate on stale information.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const s = store.getState();
        return {
          success: true,
          modules: Object.values(s.modules),
          connections: Object.values(s.connections),
          sequencer: s.sequencer,
          transport: s.transport,
        };
      },
    },
    {
      name: "spawn_module",
      title: "Spawn module",
      description:
        "Creates a new synth module (oscillator, filter, lfo, distortion, delay, reverb, or gain) at a given canvas position, wires up its real Web Audio node, and animates its appearance.",
      inputSchema: {
        type: "object",
        properties: {
          moduleType: {
            type: "string",
            enum: ["oscillator", "filter", "lfo", "distortion", "delay", "reverb", "gain"],
          },
          positionX: { type: "number" },
          positionY: { type: "number" },
        },
        required: ["moduleType", "positionX", "positionY"],
      },
      execute: ({ moduleType, positionX, positionY }: { moduleType: ModuleType; positionX: number; positionY: number }) => {
        const result = store.spawnModule(moduleType, positionX ?? 400, positionY ?? 300);
        if (result.success) log("agent", `Spawned ${moduleType}`);
        return result;
      },
    },
    {
      name: "remove_module",
      title: "Remove module",
      description: "Deletes a module and any cables connected to it.",
      inputSchema: {
        type: "object",
        properties: { moduleId: { type: "string" } },
        required: ["moduleId"],
      },
      annotations: { destructiveHint: true },
      execute: ({ moduleId }: { moduleId: string }) => {
        const result = store.removeModule(moduleId);
        if (result.success) log("agent", `Removed ${moduleId}`);
        return result;
      },
    },
    {
      name: "patch_cable",
      title: "Patch cable",
      description:
        "Connects one module's output port to another module's input port, updating both the visual graph and the real Web Audio routing. Some inputs are modulation targets (e.g. a filter's \"cutoff\" input) rather than audio-signal inputs — check get_audio_graph_state for each module's inputs.",
      inputSchema: {
        type: "object",
        properties: {
          sourceModuleId: { type: "string" },
          sourceOutput: { type: "string" },
          targetModuleId: { type: "string" },
          targetInput: { type: "string" },
        },
        required: ["sourceModuleId", "sourceOutput", "targetModuleId", "targetInput"],
      },
      execute: ({ sourceModuleId, sourceOutput, targetModuleId, targetInput }: any) => {
        const result = store.patchCable(sourceModuleId, sourceOutput, targetModuleId, targetInput);
        if (result.success) log("agent", `Connected ${sourceModuleId} \u2192 ${targetModuleId}`);
        return result;
      },
    },
    {
      name: "remove_cable",
      title: "Remove cable",
      description: "Removes a single cable connection by its id.",
      inputSchema: {
        type: "object",
        properties: { connectionId: { type: "string" } },
        required: ["connectionId"],
      },
      annotations: { destructiveHint: true },
      execute: ({ connectionId }: { connectionId: string }) => {
        const result = store.removeCable(connectionId);
        if (result.success) log("agent", `Removed cable ${connectionId}`);
        return result;
      },
    },
    {
      name: "set_module_param",
      title: "Set module parameter",
      description:
        "Sets a parameter on a module (e.g. filter cutoff, oscillator frequency). Fails with PARAMETER_LOCKED if the human has locked that parameter — the agent must not bypass this and should find another route to its goal. Values are clamped to the parameter's valid range. Value may be a number or a string, depending on the parameter (e.g. waveform names are strings).",
      inputSchema: {
        type: "object",
        properties: {
          moduleId: { type: "string" },
          paramName: { type: "string" },
          value: { type: "string", description: "A number (e.g. \"440\") or a string enum value (e.g. \"sawtooth\")." },
        },
        required: ["moduleId", "paramName", "value"],
      },
      execute: ({ moduleId, paramName, value }: { moduleId: string; paramName: string; value: number | string }) => {
        const coerced = coerceParamValue(moduleId, paramName, value);
        const result = store.setParam(moduleId, paramName, coerced);
        if (result.success) {
          log("agent", `Set ${moduleId}.${paramName} = ${coerced}`);
        } else if (result.error === "PARAMETER_LOCKED") {
          log("agent", `${paramName} is locked on ${moduleId} \u2014 leaving it untouched`);
        }
        return result;
      },
    },
    {
      name: "lock_parameter",
      title: "Lock parameter",
      description:
        "Locks a parameter so the agent cannot modify it until unlocked. Typically invoked by the human, but exposed so the agent can confirm a lock state change requested in conversation.",
      inputSchema: {
        type: "object",
        properties: { moduleId: { type: "string" }, paramName: { type: "string" } },
        required: ["moduleId", "paramName"],
      },
      execute: ({ moduleId, paramName }: { moduleId: string; paramName: string }) => store.setLock(moduleId, paramName, true),
    },
    {
      name: "unlock_parameter",
      title: "Unlock parameter",
      description: "Unlocks a previously locked parameter.",
      inputSchema: {
        type: "object",
        properties: { moduleId: { type: "string" }, paramName: { type: "string" } },
        required: ["moduleId", "paramName"],
      },
      execute: ({ moduleId, paramName }: { moduleId: string; paramName: string }) => store.setLock(moduleId, paramName, false),
    },
    {
      name: "get_spectrum_analysis",
      title: "Get spectrum analysis",
      description:
        "Returns a real-time quantitative snapshot of the current audio output from the actual AnalyserNode: peak frequency, low/mid/high band energy (0-1), peak amplitude, and whether the signal is clipping. Use this to verify how a change actually affected the sound.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => ({ success: true, ...engine.getSpectrum() }),
    },
    {
      name: "get_sequencer_state",
      title: "Get sequencer state",
      description: "Returns the current 8-step sequencer pattern, tempo, and transport state.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => ({ success: true, ...store.getState().sequencer }),
    },
    {
      name: "set_sequencer_step",
      title: "Set sequencer step",
      description: "Edits a single step of the 8-step sequence (note, octave, velocity, active).",
      inputSchema: {
        type: "object",
        properties: {
          index: { type: "number" },
          note: { type: "string" },
          octave: { type: "number" },
          velocity: { type: "number" },
          active: { type: "boolean" },
        },
        required: ["index"],
      },
      execute: ({ index, ...patch }: any) => store.setSequencerStep(index, patch),
    },
    {
      name: "clear_graph",
      title: "Clear graph",
      description: "Removes all modules and cables. Use sparingly \u2014 mainly for starting over on explicit human request.",
      inputSchema: { type: "object", properties: {} },
      annotations: { destructiveHint: true },
      execute: () => {
        const result = store.clearGraph();
        log("agent", "Cleared the graph");
        return result;
      },
    },
  ];
}

export function registerWebMcpTools(store: GraphStore, engine: AudioEngine, log: LogFn): () => void {
  const defs = buildToolDefs(store, engine, log);
  const controller = new AbortController();

  const api: ModelContextApi | undefined =
    (typeof document !== "undefined" && document.modelContext) ||
    (typeof navigator !== "undefined" && navigator.modelContext) ||
    undefined;

  if (!api) {
    console.warn(
      "[Mysynote] Neither document.modelContext nor navigator.modelContext is available in " +
        "this browser. WebMCP tools were not registered. The same tool functions are still " +
        "reachable via window.__mysynoteDevTools and the in-app agent console."
    );
  } else {
    for (const def of defs) {
      // The real browser-facing surface returns MCP content blocks, not bare
      // objects, so we wrap here — the underlying execute() implementations
      // stay agnostic of transport and are reused as-is by the dev harness
      // and the Gemini agent loop below.
      api.registerTool(
        { ...def, execute: async (input: any) => toMcpContent(await def.execute(input ?? {})) },
        { signal: controller.signal }
      );
    }
  }

  // Local developer test harness — mirrors the exact functions the real
  // WebMCP tools call, so behavior can be exercised even in browsers/tooling
  // that don't yet expose document.modelContext.
  const devTools: Record<string, (...args: any[]) => unknown> = {};
  for (const def of defs) {
    devTools[def.name] = (args: any) => def.execute(args ?? {});
  }
  window.__mysynoteDevTools = devTools;

  return () => controller.abort();
}
