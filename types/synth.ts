// Mysynote — core graph types.
// This is the single authoritative shape for the synth graph. The UI, the
// Web Audio engine, and the WebMCP tools all read/write through this shape —
// none of them are the "source of truth" on their own.

export type ModuleType =
  | "oscillator"
  | "filter"
  | "lfo"
  | "distortion"
  | "delay"
  | "reverb"
  | "gain"
  | "master"
  | "sequencer";

export type ParamValue = number | string;

export interface ModuleParam {
  value: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  /** Allowed discrete values, for string-valued params like waveform/type. */
  options?: string[];
  isLocked: boolean;
  /** Who currently holds this lock. Used to stop the agent from unlocking a
   *  lock the human set — see GraphStore.setLock. Absent when unlocked. */
  lockedBy?: "human" | "tool";
  unit?: string;
}

export interface SynthModule {
  id: string;
  type: ModuleType;
  label: string;
  position: { x: number; y: number };
  parameters: Record<string, ModuleParam>;
  /** Named input/output ports available on this module. */
  inputs: string[];
  outputs: string[];
  /** True while a param/animation on this module is being actively driven, for UI pulse. */
  active?: boolean;
}

export interface Connection {
  id: string;
  sourceModuleId: string;
  sourceOutput: string;
  targetModuleId: string;
  targetInput: string;
}

export type SequencerNote = {
  note: string; // e.g. "C", "D#", "G"
  octave: number;
  velocity: number; // 0..1
  active: boolean;
};

export interface SequencerState {
  steps: SequencerNote[];
  currentStep: number;
  bpm: number;
  isPlaying: boolean;
}

export type TransportState = "READY" | "PLAYING" | "PAUSED";

export interface SpectrumSnapshot {
  peakFrequency: number;
  lowEnergy: number;
  midEnergy: number;
  highEnergy: number;
  peakAmplitude: number;
  isClipping: boolean;
}

export type ActorType = "human" | "agent" | "system";

export interface ActivityEntry {
  id: string;
  actor: ActorType;
  message: string;
  timestamp: number;
}

export interface GraphState {
  modules: Record<string, SynthModule>;
  connections: Record<string, Connection>;
  sequencer: SequencerState;
  transport: TransportState;
}

// ---- Structured WebMCP tool results ----

export type ToolError =
  | "MODULE_NOT_FOUND"
  | "PARAMETER_NOT_FOUND"
  | "PARAMETER_LOCKED"
  | "LOCK_OWNED_BY_HUMAN"
  | "INVALID_MODULE_TYPE"
  | "INVALID_CONNECTION"
  | "INVALID_VALUE"
  | "PORT_NOT_FOUND";

export interface ToolFailure {
  success: false;
  error: ToolError;
  message: string;
  moduleId?: string;
  parameter?: string;
}

export type ToolResult<T> = ({ success: true } & T) | ToolFailure;
