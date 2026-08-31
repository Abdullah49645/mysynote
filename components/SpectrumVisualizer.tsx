"use client";

import { useEffect, useRef, useState } from "react";
import { SpectrumSnapshot } from "@/types/synth";

export default function SpectrumVisualizer({
  getFrequencyData,
  getSpectrum,
  isPlaying,
}: {
  getFrequencyData: () => Uint8Array | null;
  getSpectrum: () => SpectrumSnapshot;
  isPlaying: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [snap, setSnap] = useState<SpectrumSnapshot | null>(null);

  useEffect(() => {
    function draw() {
      const canvas = canvasRef.current;
      const data = getFrequencyData();
      if (canvas && data) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          const bars = 48;
          const step = Math.floor(data.length / bars);
          const barWidth = w / bars;
          for (let i = 0; i < bars; i++) {
            const v = data[i * step] / 255;
            const barH = v * h;
            const grad = ctx.createLinearGradient(0, h - barH, 0, h);
            grad.addColorStop(0, "#ff4fd8");
            grad.addColorStop(1, "#4ff2e0");
            ctx.fillStyle = grad;
            ctx.fillRect(i * barWidth + 1, h - barH, barWidth - 2, barH);
          }
        }
      }
      setSnap(getSpectrum());
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [getFrequencyData, getSpectrum]);

  return (
    <div className="flex h-full flex-col gap-2 border-r border-studio-line bg-studio-panel p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-studio-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-glow/70" />
          Spectrum
        </span>
        {snap?.isClipping && (
          <span className="rounded bg-magenta-glow/20 px-1.5 py-0.5 font-mono text-[10px] text-magenta-glow">
            clipping
          </span>
        )}
      </div>
      <canvas ref={canvasRef} width={420} height={120} className="w-full rounded bg-studio-bg/60" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-studio-muted">
      <span>peak freq: {snap ? `${snap.peakFrequency} Hz` : "—"}</span>
        <span>peak amp: {snap ? snap.peakAmplitude : "—"}</span>
        <span>low: {snap ? snap.lowEnergy : "—"}</span>
        <span>mid: {snap ? snap.midEnergy : "—"}</span>
        <span>high: {snap ? snap.highEnergy : "—"}</span>
        <span>{isPlaying ? "streaming" : "idle"}</span>
      </div>
    </div>
  );
}
