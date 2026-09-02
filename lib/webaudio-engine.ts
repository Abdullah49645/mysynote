import { GraphState, ModuleType, SpectrumSnapshot } from "@/types/synth";
import { GraphStore } from "./synth-graph";

const NOTE_SEMITONES: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

function noteToFrequency(note: string, octave: number): number {
  const semitone = NOTE_SEMITONES[note] ?? 0;
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface NodeBundle {
  type: ModuleType;
  input?: AudioNode;
  output?: AudioNode;
  /** Named input ports that map to a modulatable AudioParam instead of an audio-rate node input. */
  paramTargets?: Record<string, { param: AudioParam; scale: number }>;
  // per-type internals
  osc?: OscillatorNode;
  oscGain?: GainNode;
  filter?: BiquadFilterNode;
  lfoOsc?: OscillatorNode;
  lfoGain?: GainNode;
  shaper?: WaveShaperNode;
  delay?: DelayNode;
  feedback?: GainNode;
  wetGain?: GainNode;
  dryGain?: GainNode;
  convolver?: ConvolverNode;
  gain?: GainNode;
}

function makeDistortionCurve(amount: number): Float32Array {
  const k = amount * 100;
  const n = 4096;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function makeImpulseResponse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
  }
  return impulse;
}

/**
 * AudioEngine reconciles the GraphStore's declarative state into real
 * Web Audio nodes. It never holds its own opinion about graph shape —
 * it just makes the audio graph match store.getState() on every change.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  masterGainNode: GainNode | null = null;
  private nodes = new Map<string, NodeBundle>();
  private connected = new Set<string>(); // connection ids currently wired
  private modScalers: GainNode[] = [];
  private store: GraphStore;
  private unsub: (() => void) | null = null;
  private sequencerTimer: number | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;
  private lookaheadMs = 25;
  private scheduleAheadSec = 0.12;

  constructor(store: GraphStore) {
    this.store = store;
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGainNode = this.ctx.createGain();
    this.masterGainNode.gain.value = 0.8;
    this.masterGainNode.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.reconcile(this.store.getState());
    this.unsub = this.store.subscribe((s) => this.reconcile(s));
  }

  async resume() {
    if (!this.ctx) await this.init();
    if (this.ctx!.state === "suspended") await this.ctx!.resume();
  }

  dispose() {
    if (this.unsub) this.unsub();
    this.stopSequencer();
  }

  // ---- Reconciliation ----

  private reconcile(state: GraphState) {
    if (!this.ctx) return;
    // Self-healing invariant: whatever set state.sequencer.isPlaying to
    // false (Stop, Reset, clear_graph, a future code path we haven't
    // thought of) must not be trusted to also have stopped the actual
    // scheduling loop. If the store says "not playing" but our internal
    // timer disagrees, kill the timer here so audio can never keep
    // generating notes after the UI says it's stopped.
    if (!state.sequencer.isPlaying && this.sequencerTimer) {
      this.stopScheduling();
      this.muteAllVoicesNow();
    }
    // Remove stale nodes
    for (const id of Array.from(this.nodes.keys())) {
      if (!state.modules[id]) this.destroyNode(id);
    }
    // Create/update nodes
    for (const mod of Object.values(state.modules)) {
      if (!this.nodes.has(mod.id)) this.createNode(mod.id, mod.type);
      this.applyParams(mod.id, mod.type, mod.parameters as any);
    }
    // Rewire connections
    const liveIds = new Set(Object.keys(state.connections));
    for (const cid of Array.from(this.connected)) {
      if (!liveIds.has(cid)) this.connected.delete(cid); // disconnect handled by full rewire below
    }
    this.rewireAll(state);
  }

  private rewireAll(state: GraphState) {
    // Disconnect every module's output stage, then reconnect per current connections.
    for (const [id, bundle] of this.nodes) {
      try {
        bundle.output?.disconnect();
      } catch {
        /* noop */
      }
    }
    // Disconnecting a source's output also tears down any AudioParam
    // connections it fed (e.g. LFO -> filter.frequency), so the scaler
    // gain nodes from the previous reconcile are now orphaned. Drop them.
    for (const g of this.modScalers) {
      try {
        g.disconnect();
      } catch {}
    }
    this.modScalers = [];

    for (const conn of Object.values(state.connections)) {
      const src = this.nodes.get(conn.sourceModuleId);
      const tgt = this.nodes.get(conn.targetModuleId);
      if (!src?.output) continue;

      const paramTarget = tgt?.paramTargets?.[conn.targetInput];
      if (paramTarget) {
        // Modulation routing: source feeds an AudioParam through a scaler
        // gain so a 0..1 depth becomes a musically useful sweep range.
        const scaler = this.ctx!.createGain();
        scaler.gain.value = paramTarget.scale;
        try {
          src.output.connect(scaler);
          scaler.connect(paramTarget.param);
          this.modScalers.push(scaler);
        } catch {
          /* noop */
        }
        continue;
      }

      if (tgt?.input) {
        try {
          src.output.connect(tgt.input);
        } catch {
          /* noop */
        }
      } else if (state.modules[conn.targetModuleId]?.type === "master") {
        try {
          src.output.connect(this.masterGainNode!);
        } catch {
          /* noop */
        }
      }
    }
    // Master always feeds the analyser chain.
    const masterMod = Object.values(state.modules).find((m) => m.type === "master");
    if (masterMod) {
      const b = this.nodes.get(masterMod.id);
      try {
        b?.input && (b.input as GainNode).connect(this.masterGainNode!);
      } catch {
        /* noop */
      }
    }
  }

  private createNode(id: string, type: ModuleType) {
    const ctx = this.ctx!;
    const bundle: NodeBundle = { type };
    switch (type) {
      case "oscillator": {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0; // silent until sequencer triggers notes
        osc.connect(g);
        osc.start();
        bundle.osc = osc;
        bundle.oscGain = g;
        bundle.output = g;
        break;
      }
      case "filter": {
        const f = ctx.createBiquadFilter();
        bundle.filter = f;
        bundle.input = f;
        bundle.output = f;
        bundle.paramTargets = { cutoff: { param: f.frequency, scale: 3200 } };
        break;
      }
      case "lfo": {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        osc.start();
        bundle.lfoOsc = osc;
        bundle.lfoGain = g;
        bundle.output = g;
        break;
      }
      case "distortion": {
        const shaper = ctx.createWaveShaper();
        shaper.oversample = "2x";
        bundle.shaper = shaper;
        bundle.input = shaper;
        bundle.output = shaper;
        break;
      }
      case "delay": {
        const delay = ctx.createDelay(2.5);
        const feedback = ctx.createGain();
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const merge = ctx.createGain();
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(merge);
        dry.connect(merge);
        bundle.delay = delay;
        bundle.feedback = feedback;
        bundle.wetGain = wet;
        bundle.dryGain = dry;
        bundle.gain = merge;
        bundle.input = dry; // also tee into delay via applyParams wiring below
        bundle.output = merge;
        // tee dry input into the delay line too
        dry.connect(delay);
        break;
      }
      case "reverb": {
        const convolver = ctx.createConvolver();
        convolver.buffer = makeImpulseResponse(ctx, 2);
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const merge = ctx.createGain();
        const input = ctx.createGain();
        input.connect(dry);
        input.connect(convolver);
        convolver.connect(wet);
        wet.connect(merge);
        dry.connect(merge);
        bundle.convolver = convolver;
        bundle.wetGain = wet;
        bundle.dryGain = dry;
        bundle.gain = merge;
        bundle.input = input;
        bundle.output = merge;
        break;
      }
      case "gain": {
        const g = ctx.createGain();
        bundle.gain = g;
        bundle.input = g;
        bundle.output = g;
        break;
      }
      case "master": {
        const g = ctx.createGain();
        bundle.gain = g;
        bundle.input = g;
        break;
      }
      case "sequencer": {
        // No audio node — the sequencer drives oscillators via scheduling.
        break;
      }
    }
    this.nodes.set(id, bundle);
  }

  private destroyNode(id: string) {
    const b = this.nodes.get(id);
    if (!b) return;
    try {
      b.osc?.stop();
    } catch {}
    try {
      b.lfoOsc?.stop();
    } catch {}
    for (const key of Object.keys(b) as (keyof NodeBundle)[]) {
      const n = b[key] as unknown;
      if (n && typeof n === "object" && "disconnect" in n) {
        try {
          (n as AudioNode).disconnect();
        } catch {}
      }
    }
    this.nodes.delete(id);
  }

  private applyParams(id: string, type: ModuleType, params: Record<string, { value: number | string }>) {
    const b = this.nodes.get(id);
    if (!b || !this.ctx) return;
    const t = this.ctx.currentTime;
    switch (type) {
      case "oscillator":
        if (b.osc) {
          b.osc.type = params.waveform.value as OscillatorType;
          b.osc.frequency.setTargetAtTime(Number(params.frequency.value), t, 0.01);
          b.osc.detune.setTargetAtTime(Number(params.detune.value), t, 0.01);
        }
        break;
      case "filter":
        if (b.filter) {
          b.filter.type = params.type.value as BiquadFilterType;
          b.filter.frequency.setTargetAtTime(Number(params.cutoff.value), t, 0.01);
          b.filter.Q.setTargetAtTime(Number(params.resonance.value), t, 0.01);
        }
        break;
      case "lfo":
        if (b.lfoOsc && b.lfoGain) {
          b.lfoOsc.type = params.waveform.value as OscillatorType;
          b.lfoOsc.frequency.setTargetAtTime(Number(params.rate.value), t, 0.01);
          b.lfoGain.gain.setTargetAtTime(Number(params.depth.value), t, 0.01);
        }
        break;
      case "distortion":
        if (b.shaper) b.shaper.curve = makeDistortionCurve(Number(params.drive.value));
        break;
      case "delay":
        if (b.delay && b.feedback && b.wetGain && b.dryGain) {
          b.delay.delayTime.setTargetAtTime(Number(params.time.value), t, 0.01);
          b.feedback.gain.setTargetAtTime(Number(params.feedback.value), t, 0.01);
          const mix = Number(params.mix.value);
          b.wetGain.gain.setTargetAtTime(mix, t, 0.01);
          b.dryGain.gain.setTargetAtTime(1 - mix * 0.5, t, 0.01);
        }
        break;
      case "reverb":
        if (b.wetGain && b.dryGain) {
          const mix = Number(params.mix.value);
          b.wetGain.gain.setTargetAtTime(mix, t, 0.01);
          b.dryGain.gain.setTargetAtTime(1 - mix * 0.5, t, 0.01);
        }
        break;
      case "gain":
        if (b.gain) b.gain.gain.setTargetAtTime(Number(params.volume.value), t, 0.01);
        break;
      case "master":
        if (b.gain) b.gain.gain.setTargetAtTime(Number(params.gain.value), t, 0.01);
        break;
    }
  }

  // ---- Sequencer scheduling ----

  startSequencer() {
    if (!this.ctx) return;
    this.stepIndex = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.store.setSequencerPlaying(true);
    this.store.setTransport("PLAYING");
    this.scheduleLoop();
  }

  stopSequencer() {
    this.stopScheduling();
    this.muteAllVoicesNow();
    this.store.setSequencerPlaying(false);
    this.store.setTransport("PAUSED");
    this.store.setCurrentStep(-1);
  }

  /** Clears the JS scheduling timer only — does not touch store state. Safe to call from reconcile(). */
  private stopScheduling() {
    if (this.sequencerTimer) window.clearTimeout(this.sequencerTimer);
    this.sequencerTimer = null;
  }

  /** Cancels any in-flight envelope ramps so Stop/Reset is immediate and silent, not a fade-out. */
  private muteAllVoicesNow() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const bundle of this.nodes.values()) {
      if (bundle.oscGain) {
        bundle.oscGain.gain.cancelScheduledValues(now);
        bundle.oscGain.gain.setValueAtTime(0.0001, now);
      }
    }
  }

  private scheduleLoop = () => {
    if (!this.ctx) return;
    const state = this.store.getState();
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadSec) {
      this.scheduleStep(this.stepIndex, this.nextStepTime, state);
      const secPerStep = 60 / state.sequencer.bpm / 2; // 8th notes
      this.nextStepTime += secPerStep;
      this.stepIndex = (this.stepIndex + 1) % state.sequencer.steps.length;
    }
    this.sequencerTimer = window.setTimeout(this.scheduleLoop, this.lookaheadMs);
  };

  private scheduleStep(index: number, time: number, state: GraphState) {
    const step = state.sequencer.steps[index];
    const delayMs = Math.max(0, (time - this.ctx!.currentTime) * 1000);
    window.setTimeout(() => this.store.setCurrentStep(index), delayMs);
    if (!step.active) return;

    const oscMod = Object.values(state.modules).find((m) => m.type === "oscillator");
    if (!oscMod) return;
    const bundle = this.nodes.get(oscMod.id);
    if (!bundle?.osc || !bundle.oscGain) return;

    const baseFreq = noteToFrequency(step.note, step.octave);
    // Respect a locked frequency param: locked oscillator pitch means the
    // sequencer should not retune it, only re-trigger its envelope.
    const freqLocked = oscMod.parameters.frequency?.isLocked;
    if (!freqLocked) {
      bundle.osc.frequency.setValueAtTime(baseFreq, time);
    }

    const peak = 0.6 * step.velocity;
    const g = bundle.oscGain.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(0.0001, time);
    g.exponentialRampToValueAtTime(Math.max(0.001, peak), time + 0.01);
    g.exponentialRampToValueAtTime(0.001, time + 0.22);
  }

  // ---- Spectrum ----

  getSpectrum(): SpectrumSnapshot {
    if (!this.analyser || !this.ctx) {
      return { peakFrequency: 0, lowEnergy: 0, midEnergy: 0, highEnergy: 0, peakAmplitude: 0, isClipping: false };
    }
    const bins = this.analyser.frequencyBinCount;
    const data = new Uint8Array(bins);
    this.analyser.getByteFrequencyData(data);
    const nyquist = this.ctx.sampleRate / 2;
    const binHz = nyquist / bins;

    let peakBin = 0;
    let peakVal = 0;
    let low = 0,
      lowN = 0,
      mid = 0,
      midN = 0,
      high = 0,
      highN = 0;
    for (let i = 0; i < bins; i++) {
      const v = data[i] / 255;
      const freq = i * binHz;
      if (v > peakVal) {
        peakVal = v;
        peakBin = i;
      }
      if (freq < 250) {
        low += v;
        lowN++;
      } else if (freq < 2000) {
        mid += v;
        midN++;
      } else {
        high += v;
        highN++;
      }
    }
    const timeData = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(timeData);
    let peakAmp = 0;
    for (let i = 0; i < timeData.length; i++) {
      const centered = Math.abs(timeData[i] - 128) / 128;
      if (centered > peakAmp) peakAmp = centered;
    }

    return {
      peakFrequency: Math.round(peakBin * binHz),
      lowEnergy: lowN ? +(low / lowN).toFixed(2) : 0,
      midEnergy: midN ? +(mid / midN).toFixed(2) : 0,
      highEnergy: highN ? +(high / highN).toFixed(2) : 0,
      peakAmplitude: +peakAmp.toFixed(2),
      isClipping: peakAmp > 0.98,
    };
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }
}
