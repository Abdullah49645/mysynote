"use client";

import { useEffect, useState } from "react";
import { useMysynote } from "@/lib/state-store";
import ControlHeader from "@/components/ControlHeader";
import SynthCanvas from "@/components/SynthCanvas";
import SpectrumVisualizer from "@/components/SpectrumVisualizer";
import AgentActivity from "@/components/AgentActivity";
import AgentConsole from "@/components/AgentConsole";
import Sequencer from "@/components/Sequencer";
import ModulePalette from "@/components/ModulePalette";
import { ModuleType } from "@/types/synth";

export default function Page() {
  const {
    ready,
    state,
    activity,
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
    testRunning,
    testResult,
    askAgent,
    agentRunning,
    agentReply,
    agentErrorMsg,
    flashParam,
    getSpectrum,
    getFrequencyData,
  } = useMysynote();

  const [webmcpActive, setWebmcpActive] = useState(false);

  useEffect(() => {
    setWebmcpActive(
      typeof document !== "undefined" &&
        !!((document as any).modelContext || (typeof navigator !== "undefined" && (navigator as any).modelContext))
    );
  }, [ready]);

  const isPlaying = state.sequencer.isPlaying;

  function handleSpawn(type: ModuleType) {
    // place new modules in a loose cascade so they don't stack exactly on top of each other
    const count = Object.keys(state.modules).length;
    spawnModule(type, 120 + ((count * 60) % 640), 380 + ((count * 40) % 260));
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <ControlHeader
        isPlaying={isPlaying}
        bpm={state.sequencer.bpm}
        transport={state.transport}
        webmcpActive={webmcpActive}
        onTogglePlay={() => (isPlaying ? stop() : start())}
        onBpmChange={setBpm}
        onReset={resetToDefault}
        onRunSelfTest={runSelfTest}
        testRunning={testRunning}
        testResult={testResult}
      />

      <ModulePalette onSpawn={handleSpawn} />

      <div className="flex flex-1 overflow-hidden">
        <SynthCanvas
          graph={state}
          onMoveModule={moveModule}
          onParamChange={setParam}
          onToggleLock={toggleLock}
          onRemoveModule={removeModule}
          onPatchCable={patchCable}
          onRemoveCable={removeCable}
          flashParam={flashParam}
          isPlaying={isPlaying}
        />

        <div className="grid w-[440px] shrink-0 grid-rows-[1fr_1fr_auto] border-l border-studio-line">
          <SpectrumVisualizer
            getFrequencyData={getFrequencyData}
            getSpectrum={getSpectrum}
            isPlaying={isPlaying}
          />
          <AgentActivity entries={activity} />
          <AgentConsole onAsk={askAgent} running={agentRunning} reply={agentReply} errorMsg={agentErrorMsg} />
        </div>
      </div>

      <Sequencer sequencer={state.sequencer} onStepChange={setSequencerStep} />

      {!webmcpActive && (
        <div className="border-t border-studio-line bg-studio-panel px-4 py-1.5 text-center font-mono text-[10px] text-studio-muted">
          This browser doesn&apos;t expose document.modelContext yet — use{" "}
          <code className="text-cyan-glow">window.__mysynoteDevTools</code> in devtools to exercise the same
          tool functions an agent would call.
        </div>
      )}
    </main>
  );
}
