import {
  Connection,
  GraphState,
  ModuleType,
  SynthModule,
  ToolResult,
  ToolFailure,
} from "@/types/synth";
import { cloneBlueprintParams, MODULE_BLUEPRINTS } from "./module-definitions";

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function fail(
  error: ToolFailure["error"],
  message: string,
  extra: Partial<ToolFailure> = {}
): ToolFailure {
  return { success: false, error, message, ...extra };
}

const DEFAULT_SEQUENCE = [
  { note: "C", octave: 2, velocity: 0.9, active: true },
  { note: "C", octave: 2, velocity: 0.6, active: false },
  { note: "G", octave: 2, velocity: 0.8, active: true },
  { note: "Bb", octave: 2, velocity: 0.7, active: true },
  { note: "C", octave: 3, velocity: 0.9, active: true },
  { note: "C", octave: 2, velocity: 0.5, active: false },
  { note: "Eb", octave: 2, velocity: 0.75, active: true },
  { note: "G", octave: 2, velocity: 0.8, active: true },
];

/** Builds the default demo patch: Sequencer -> Osc -> Filter -> Distortion -> Delay -> Master */
export function createDefaultGraph(): GraphState {
  idCounter = 0;
  const osc: SynthModule = {
    id: "osc-1",
    type: "oscillator",
    label: MODULE_BLUEPRINTS.oscillator.label,
    position: { x: 80, y: 160 },
    parameters: cloneBlueprintParams("oscillator"),
    inputs: MODULE_BLUEPRINTS.oscillator.inputs,
    outputs: MODULE_BLUEPRINTS.oscillator.outputs,
  };
  const filter: SynthModule = {
    id: "filter-1",
    type: "filter",
    label: MODULE_BLUEPRINTS.filter.label,
    position: { x: 320, y: 160 },
    parameters: cloneBlueprintParams("filter"),
    inputs: MODULE_BLUEPRINTS.filter.inputs,
    outputs: MODULE_BLUEPRINTS.filter.outputs,
  };
  const lfo: SynthModule = {
    id: "lfo-1",
    type: "lfo",
    label: MODULE_BLUEPRINTS.lfo.label,
    position: { x: 320, y: 400 },
    parameters: cloneBlueprintParams("lfo"),
    inputs: MODULE_BLUEPRINTS.lfo.inputs,
    outputs: MODULE_BLUEPRINTS.lfo.outputs,
  };
  const dist: SynthModule = {
    id: "dist-1",
    type: "distortion",
    label: MODULE_BLUEPRINTS.distortion.label,
    position: { x: 560, y: 160 },
    parameters: cloneBlueprintParams("distortion"),
    inputs: MODULE_BLUEPRINTS.distortion.inputs,
    outputs: MODULE_BLUEPRINTS.distortion.outputs,
  };
  const delay: SynthModule = {
    id: "delay-1",
    type: "delay",
    label: MODULE_BLUEPRINTS.delay.label,
    position: { x: 800, y: 160 },
    parameters: cloneBlueprintParams("delay"),
    inputs: MODULE_BLUEPRINTS.delay.inputs,
    outputs: MODULE_BLUEPRINTS.delay.outputs,
  };
  const master: SynthModule = {
    id: "master-1",
    type: "master",
    label: MODULE_BLUEPRINTS.master.label,
    position: { x: 1040, y: 160 },
    parameters: cloneBlueprintParams("master"),
    inputs: MODULE_BLUEPRINTS.master.inputs,
    outputs: MODULE_BLUEPRINTS.master.outputs,
  };

  const modules: Record<string, SynthModule> = {
    [osc.id]: osc,
    [filter.id]: filter,
    [lfo.id]: lfo,
    [dist.id]: dist,
    [delay.id]: delay,
    [master.id]: master,
  };

  const conns: Connection[] = [
    { id: nextId("cbl"), sourceModuleId: osc.id, sourceOutput: "out", targetModuleId: filter.id, targetInput: "in" },
    { id: nextId("cbl"), sourceModuleId: lfo.id, sourceOutput: "out", targetModuleId: filter.id, targetInput: "cutoff" },
    { id: nextId("cbl"), sourceModuleId: filter.id, sourceOutput: "out", targetModuleId: dist.id, targetInput: "in" },
    { id: nextId("cbl"), sourceModuleId: dist.id, sourceOutput: "out", targetModuleId: delay.id, targetInput: "in" },
    { id: nextId("cbl"), sourceModuleId: delay.id, sourceOutput: "out", targetModuleId: master.id, targetInput: "in" },
  ];
  const connections: Record<string, Connection> = {};
  for (const c of conns) connections[c.id] = c;

  return {
    modules,
    connections,
    sequencer: {
      steps: DEFAULT_SEQUENCE.map((s) => ({ ...s })),
      currentStep: -1,
      bpm: 124,
      isPlaying: false,
    },
    transport: "READY",
  };
}

type Listener = (state: GraphState) => void;
type RejectListener = (moduleId: string, paramName: string, error: string) => void;

/**
 * GraphStore is the single authoritative application state. Neither the React
 * UI nor the Web Audio engine own state independently — both react to this.
 */
export class GraphStore {
  private state: GraphState;
  private listeners = new Set<Listener>();
  private rejectListeners = new Set<RejectListener>();

  constructor() {
    this.state = createDefaultGraph();
  }

  getState(): GraphState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeReject(fn: RejectListener): () => void {
    this.rejectListeners.add(fn);
    return () => this.rejectListeners.delete(fn);
  }

  private emitReject(moduleId: string, paramName: string, error: string) {
    for (const l of this.rejectListeners) l(moduleId, paramName, error);
  }

  private emit() {
    for (const l of this.listeners) l(this.state);
  }

  private set(mutator: (draft: GraphState) => void) {
    // Shallow-clone the top-level containers so React sees a new reference.
    const draft: GraphState = {
      modules: { ...this.state.modules },
      connections: { ...this.state.connections },
      sequencer: { ...this.state.sequencer, steps: this.state.sequencer.steps.map((s) => ({ ...s })) },
      transport: this.state.transport,
    };
    mutator(draft);
    this.state = draft;
    this.emit();
  }

  // ---- Queries ----

  getModule(id: string): SynthModule | undefined {
    return this.state.modules[id];
  }

  // ---- Mutations (used by both UI and WebMCP tools) ----

  spawnModule(type: ModuleType, x: number, y: number): ToolResult<{ module: SynthModule }> {
    const bp = MODULE_BLUEPRINTS[type];
    if (!bp) return fail("INVALID_MODULE_TYPE", `Unknown module type "${type}".`);
    const id = nextId(type.slice(0, 4));
    const mod: SynthModule = {
      id,
      type,
      label: bp.label,
      position: { x, y },
      parameters: cloneBlueprintParams(type),
      inputs: [...bp.inputs],
      outputs: [...bp.outputs],
      active: true,
    };
    this.set((d) => {
      d.modules[id] = mod;
    });
    window.setTimeout(() => this.pulseModule(id), 350);
    return { success: true, module: mod };
  }

  removeModule(id: string): ToolResult<{ removedConnectionIds: string[] }> {
    if (!this.state.modules[id]) return fail("MODULE_NOT_FOUND", `No module "${id}".`, { moduleId: id });
    const removed: string[] = [];
    this.set((d) => {
      delete d.modules[id];
      for (const [cid, c] of Object.entries(d.connections)) {
        if (c.sourceModuleId === id || c.targetModuleId === id) {
          delete d.connections[cid];
          removed.push(cid);
        }
      }
    });
    return { success: true, removedConnectionIds: removed };
  }

  patchCable(
    sourceModuleId: string,
    sourceOutput: string,
    targetModuleId: string,
    targetInput: string
  ): ToolResult<{ connection: Connection }> {
    const source = this.state.modules[sourceModuleId];
    const target = this.state.modules[targetModuleId];
    if (!source) return fail("MODULE_NOT_FOUND", `No module "${sourceModuleId}".`, { moduleId: sourceModuleId });
    if (!target) return fail("MODULE_NOT_FOUND", `No module "${targetModuleId}".`, { moduleId: targetModuleId });
    if (!source.outputs.includes(sourceOutput))
      return fail("PORT_NOT_FOUND", `"${sourceModuleId}" has no output "${sourceOutput}".`, { moduleId: sourceModuleId });
    if (!target.inputs.includes(targetInput))
      return fail("PORT_NOT_FOUND", `"${targetModuleId}" has no input "${targetInput}".`, { moduleId: targetModuleId });
    if (sourceModuleId === targetModuleId)
      return fail("INVALID_CONNECTION", "A module cannot connect to itself.");

    const id = nextId("cbl");
    const conn: Connection = { id, sourceModuleId, sourceOutput, targetModuleId, targetInput };
    this.set((d) => {
      d.connections[id] = conn;
    });
    return { success: true, connection: conn };
  }

  removeCable(id: string): ToolResult<{ connectionId: string }> {
    if (!this.state.connections[id]) return fail("INVALID_CONNECTION", `No connection "${id}".`);
    this.set((d) => {
      delete d.connections[id];
    });
    return { success: true, connectionId: id };
  }

  setParam(
    moduleId: string,
    paramName: string,
    value: number | string,
    opts: { bypassLock?: boolean } = {}
  ): ToolResult<{ moduleId: string; parameter: string; value: number | string }> {
    const mod = this.state.modules[moduleId];
    if (!mod) return fail("MODULE_NOT_FOUND", `No module "${moduleId}".`, { moduleId });
    const param = mod.parameters[paramName];
    if (!param)
      return fail("PARAMETER_NOT_FOUND", `Module "${moduleId}" has no parameter "${paramName}".`, {
        moduleId,
        parameter: paramName,
      });
    if (param.isLocked && !opts.bypassLock) {
      this.emitReject(moduleId, paramName, "PARAMETER_LOCKED");
      return fail("PARAMETER_LOCKED", `Human locked ${moduleId}.${paramName}.`, { moduleId, parameter: paramName });
    }

    let finalValue = value;
    if (typeof value === "number" && typeof param.min === "number" && typeof param.max === "number") {
      finalValue = Math.min(param.max, Math.max(param.min, value));
    }
    if (typeof value === "string" && param.options && !param.options.includes(value)) {
      return fail("INVALID_VALUE", `"${value}" is not valid for ${paramName}. Options: ${param.options.join(", ")}`, {
        moduleId,
        parameter: paramName,
      });
    }

    this.set((d) => {
      const m = d.modules[moduleId];
      m.parameters = { ...m.parameters, [paramName]: { ...m.parameters[paramName], value: finalValue } };
      m.active = true;
    });
    window.setTimeout(() => this.pulseModule(moduleId), 300);
    return { success: true, moduleId, parameter: paramName, value: finalValue };
  }

  setLock(
    moduleId: string,
    paramName: string,
    locked: boolean,
    opts: { source?: "human" | "tool" } = {}
  ): ToolResult<{ moduleId: string; parameter: string; isLocked: boolean }> {
    const source = opts.source ?? "tool";
    const mod = this.state.modules[moduleId];
    if (!mod) return fail("MODULE_NOT_FOUND", `No module "${moduleId}".`, { moduleId });
    const param = mod.parameters[paramName];
    if (!param)
      return fail("PARAMETER_NOT_FOUND", `Module "${moduleId}" has no parameter "${paramName}".`, {
        moduleId,
        parameter: paramName,
      });
    // A human-set lock is a hard boundary: only the human (source: "human",
    // i.e. clicking the lock icon in the UI) can clear it. A tool call —
    // whether from the in-app agent or a real WebMCP caller — cannot unlock
    // its own way past a lock it didn't set, even by calling this tool
    // directly instead of set_module_param.
    if (!locked && param.isLocked && param.lockedBy === "human" && source !== "human") {
      this.emitReject(moduleId, paramName, "LOCK_OWNED_BY_HUMAN");
      return fail(
        "LOCK_OWNED_BY_HUMAN",
        `${paramName} on ${moduleId} was locked by the human and can only be unlocked from the UI.`,
        { moduleId, parameter: paramName }
      );
    }
    this.set((d) => {
      const m = d.modules[moduleId];
      m.parameters = {
        ...m.parameters,
        [paramName]: { ...m.parameters[paramName], isLocked: locked, lockedBy: locked ? source : undefined },
      };
    });
    return { success: true, moduleId, parameter: paramName, isLocked: locked };
  }

  moveModule(moduleId: string, x: number, y: number) {
    if (!this.state.modules[moduleId]) return;
    this.set((d) => {
      d.modules[moduleId].position = { x, y };
    });
  }

  pulseModule(moduleId: string) {
    if (!this.state.modules[moduleId]) return;
    this.set((d) => {
      if (d.modules[moduleId]) d.modules[moduleId].active = false;
    });
  }

  setTransport(t: GraphState["transport"]) {
    this.set((d) => {
      d.transport = t;
    });
  }

  setSequencerPlaying(playing: boolean) {
    this.set((d) => {
      d.sequencer.isPlaying = playing;
    });
  }

  setCurrentStep(step: number) {
    this.set((d) => {
      d.sequencer.currentStep = step;
    });
  }

  setBpm(bpm: number) {
    this.set((d) => {
      d.sequencer.bpm = Math.min(220, Math.max(40, bpm));
    });
  }

  setSequencerStep(
    index: number,
    patch: Partial<{ note: string; octave: number; velocity: number; active: boolean }>
  ): ToolResult<{ index: number }> {
    if (index < 0 || index >= this.state.sequencer.steps.length)
      return fail("INVALID_VALUE", `Step index ${index} is out of range.`);
    this.set((d) => {
      d.sequencer.steps[index] = { ...d.sequencer.steps[index], ...patch };
    });
    return { success: true, index };
  }

  clearGraph(): ToolResult<{ cleared: true }> {
    this.set((d) => {
      d.modules = {};
      d.connections = {};
    });
    return { success: true, cleared: true };
  }

  resetToDefault() {
    this.state = createDefaultGraph();
    this.emit();
  }
}
