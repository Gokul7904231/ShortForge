"use client";

import React, { useState } from "react";
import { Video, Sliders, Cpu, Play, CheckCircle2, ShieldCheck, Gauge } from "lucide-react";

export interface RenderCompilerInfo {
  id: "FFMPEG" | "HYPERFRAMES";
  name: string;
  role: string;
  hardware: string;
  status: "READY" | "COMPILING" | "IDLE" | "PROTOTYPE";
  executionClass?: "PRODUCTION" | "UNVERIFIED" | "PROTOTYPE";
  isProductionRoutable?: boolean;
  lastSpeedupFactor?: number | null;
  speedupStatus?: "OBSERVED" | "ESTIMATED" | "DECLARED" | "UNKNOWN";
}

export interface RenderFabricPanelProps {
  activeJobId?: string | null;
  resolution?: string;
  fps?: number;
  measuredQualityScore?: number | null;
  qualityMeasurementStatus?: "OBSERVED" | "ESTIMATED" | "DECLARED" | "UNKNOWN" | "UNAVAILABLE" | "STALE";
  compilers?: RenderCompilerInfo[];
}

export const RenderFabricPanel: React.FC<RenderFabricPanelProps> = ({
  activeJobId = null,
  resolution = "1080x1920 (9:16)",
  fps = 30,
  measuredQualityScore = null,
  qualityMeasurementStatus = "UNKNOWN",
  compilers = [
    {
      id: "FFMPEG",
      name: "Deterministic FFmpeg Compiler",
      role: "CPU/GPU Video Assembly & Audio Mixing (spawn, ffprobe validated)",
      hardware: "Local Host FFmpeg 8.1 / NVENC",
      status: "READY",
      executionClass: "PRODUCTION",
      isProductionRoutable: true,
      lastSpeedupFactor: null,
      speedupStatus: "UNKNOWN",
    },
    {
      id: "HYPERFRAMES",
      name: "HyperFrames Kinetic Canvas Compiler",
      role: "HTML/CSS/SVG Dynamic Animation (Prototype - Blocked from Prod Routing)",
      hardware: "Headless Canvas V8 / WebGPU",
      status: "PROTOTYPE",
      executionClass: "UNVERIFIED",
      isProductionRoutable: false,
      lastSpeedupFactor: null,
      speedupStatus: "UNKNOWN",
    },
  ],
}) => {
  const [selectedCompiler, setSelectedCompiler] = useState<"FFMPEG" | "HYPERFRAMES">("FFMPEG");

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl bg-[#080D1A]/90 border border-white/[0.08] backdrop-blur-xl text-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-400">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-pink-400 uppercase tracking-wider">
                Floor 06 — Render Fabric
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                CAPABILITY-AWARE COMPILER
              </span>
            </div>
            <h3 className="text-sm font-semibold text-white/90 mt-0.5">
              Render Intent Pipeline:{" "}
              {activeJobId ? (
                <span className="text-pink-300 font-mono">{activeJobId}</span>
              ) : (
                <span className="text-white/40 font-mono italic">NO_ACTIVE_JOB</span>
              )}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-white/60">F07 Quality:</span>
            {measuredQualityScore !== null ? (
              <span className="text-emerald-400 font-bold">{measuredQualityScore}/100</span>
            ) : (
              <span className="text-amber-400 font-bold">UNMEASURED</span>
            )}
            <span className="text-[9px] px-1 py-0.2 rounded bg-white/10 text-white/60 border border-white/10">
              {qualityMeasurementStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Target Spec Summary */}
      <div className="grid grid-cols-3 gap-3 text-xs font-mono">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <span className="text-white/50 block text-[11px]">Format / Aspect</span>
          <span className="text-pink-300 font-bold mt-1 block">{resolution}</span>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <span className="text-white/50 block text-[11px]">Target Framerate</span>
          <span className="text-white/90 font-bold mt-1 block">{fps} FPS Deterministic</span>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <span className="text-white/50 block text-[11px]">Verification Engine</span>
          <span className="text-emerald-400 font-bold mt-1 block">Multi-Factor Measured</span>
        </div>
      </div>

      {/* Compiler Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {compilers.map((comp) => {
          const isSelected = selectedCompiler === comp.id;
          const isPrototype = comp.status === "PROTOTYPE" || !comp.isProductionRoutable;

          return (
            <div
              key={comp.id}
              onClick={() => setSelectedCompiler(comp.id)}
              className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                isSelected
                  ? "bg-pink-500/10 border-pink-500/40 shadow-xs"
                  : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
              } ${isPrototype ? "opacity-80" : ""}`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-white/95">{comp.name}</span>
                  {isPrototype ? (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      PROTOTYPE (BLOCKED)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {comp.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/70 mt-1 font-sans leading-snug">{comp.role}</p>
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-white/60 pt-2 border-t border-white/[0.05]">
                <span className="text-white/40">{comp.hardware}</span>
                {comp.lastSpeedupFactor !== null && comp.lastSpeedupFactor !== undefined ? (
                  <span className="text-pink-400 font-bold">
                    {comp.lastSpeedupFactor}x ({comp.speedupStatus ?? "OBSERVED"})
                  </span>
                ) : (
                  <span className="text-white/30 italic">NO_BENCHMARK</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
