import { ModuleParam, ModuleType } from "@/types/synth";

export interface ModuleBlueprint {
  label: string;
  inputs: string[];
  outputs: string[];
  parameters: Record<string, ModuleParam>;
}

function p(
  value: number | string,
  extra: Partial<ModuleParam> = {}
): ModuleParam {
  return { value, isLocked: false, ...extra };
}

export const MODULE_BLUEPRINTS: Record<ModuleType, ModuleBlueprint> = {
  oscillator: {
    label: "OSC",
    inputs: [],
    outputs: ["out"],
    parameters: {
      waveform: p("sawtooth", { options: ["sine", "square", "sawtooth", "triangle"] }),
      frequency: p(110, { min: 20, max: 2000, step: 1, unit: "Hz" }),
      detune: p(0, { min: -100, max: 100, step: 1, unit: "ct" }),
      gain: p(0.7, { min: 0, max: 1, step: 0.01 }),
    },
  },
  filter: {
    label: "FILTER",
    inputs: ["in", "cutoff"],
    outputs: ["out"],
    parameters: {
      type: p("lowpass", { options: ["lowpass", "highpass", "bandpass", "notch"] }),
      cutoff: p(4200, { min: 40, max: 12000, step: 10, unit: "Hz" }),
      resonance: p(0.7, { min: 0, max: 20, step: 0.1 }),
    },
  },
  lfo: {
    label: "LFO",
    inputs: [],
    outputs: ["out"],
    parameters: {
      waveform: p("sine", { options: ["sine", "square", "sawtooth", "triangle"] }),
      rate: p(0.6, { min: 0.05, max: 20, step: 0.05, unit: "Hz" }),
      depth: p(0.15, { min: 0, max: 1, step: 0.01 }),
    },
  },
  distortion: {
    label: "DIST",
    inputs: ["in"],
    outputs: ["out"],
    parameters: {
      drive: p(0.1, { min: 0, max: 1, step: 0.01 }),
    },
  },
  delay: {
    label: "DELAY",
    inputs: ["in"],
    outputs: ["out"],
    parameters: {
      time: p(0.3, { min: 0, max: 2, step: 0.01, unit: "s" }),
      feedback: p(0.35, { min: 0, max: 0.95, step: 0.01 }),
      mix: p(0.25, { min: 0, max: 1, step: 0.01 }),
    },
  },
  reverb: {
    label: "REVERB",
    inputs: ["in"],
    outputs: ["out"],
    parameters: {
      decay: p(2, { min: 0.1, max: 8, step: 0.1, unit: "s" }),
      mix: p(0.2, { min: 0, max: 1, step: 0.01 }),
    },
  },
  gain: {
    label: "GAIN",
    inputs: ["in"],
    outputs: ["out"],
    parameters: {
      volume: p(1, { min: 0, max: 2, step: 0.01 }),
    },
  },
  master: {
    label: "MASTER",
    inputs: ["in"],
    outputs: [],
    parameters: {
      gain: p(0.8, { min: 0, max: 1.2, step: 0.01 }),
    },
  },
  sequencer: {
    label: "SEQ",
    inputs: [],
    outputs: ["trigger"],
    parameters: {
      bpm: p(124, { min: 40, max: 220, step: 1, unit: "bpm" }),
    },
  },
};

export function cloneBlueprintParams(type: ModuleType): Record<string, ModuleParam> {
  const bp = MODULE_BLUEPRINTS[type];
  const out: Record<string, ModuleParam> = {};
  for (const [k, v] of Object.entries(bp.parameters)) {
    out[k] = { ...v };
  }
  return out;
}
