"use client";

import React, { useState } from "react";
import { KeyRound, ShieldCheck, Lock, Globe, Terminal, FileCode, CheckCircle2 } from "lucide-react";

export interface CapabilityItem {
  id: string;
  name: string;
  allowedRoles: string[];
  allowedFloors: string[];
  securityClassification: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "CRITICAL";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  license: string;
  provenance: string;
  isHealthy: boolean;
}

export interface CapabilityRegistryPanelProps {
  capabilities?: CapabilityItem[];
}

export const CapabilityRegistryPanel: React.FC<CapabilityRegistryPanelProps> = ({
  capabilities = [
    {
      id: "browser.access",
      name: "Lightpanda Headless Browser Engine",
      allowedRoles: ["SYSTEM", "OPERATOR"],
      allowedFloors: ["floor00_analyst"],
      securityClassification: "INTERNAL",
      riskLevel: "MEDIUM",
      license: "MIT Clean-Room Reference",
      provenance: "lightpanda-io/browser",
      isHealthy: true,
    },
    {
      id: "research.web",
      name: "ShortForge Reach External Research Subsystem",
      allowedRoles: ["SYSTEM", "OPERATOR", "ANALYST"],
      allowedFloors: ["floor00_analyst"],
      securityClassification: "RESTRICTED",
      riskLevel: "LOW",
      license: "MIT Clean-Room Reference",
      provenance: "academic-research-skills",
      isHealthy: true,
    },
    {
      id: "voice.tts",
      name: "ShortForge Voice Fabric Multi-Engine Pipeline",
      allowedRoles: ["*"],
      allowedFloors: ["floor04_media_synthesis"],
      securityClassification: "INTERNAL",
      riskLevel: "LOW",
      license: "MIT Clean-Room Reference",
      provenance: "voice-studio-ref",
      isHealthy: true,
    },
    {
      id: "render.ffmpeg",
      name: "FFmpeg Deterministic Video Compiler",
      allowedRoles: ["*"],
      allowedFloors: ["floor06_rendering"],
      securityClassification: "INTERNAL",
      riskLevel: "LOW",
      license: "LGPL v2.1/GPL",
      provenance: "ffmpeg-official",
      isHealthy: true,
    },
    {
      id: "render.hyperframes",
      name: "HyperFrames Kinetic Canvas Compiler",
      allowedRoles: ["*"],
      allowedFloors: ["floor06_rendering"],
      securityClassification: "INTERNAL",
      riskLevel: "LOW",
      license: "MIT Clean-Room Reference",
      provenance: "hyperframes-canvas",
      isHealthy: true,
    },
  ],
}) => {
  const [filterFloor, setFilterFloor] = useState<string>("ALL");

  const filtered =
    filterFloor === "ALL"
      ? capabilities
      : capabilities.filter((c) => c.allowedFloors.includes(filterFloor));

  const getSecurityBadge = (sec: string) => {
    switch (sec) {
      case "PUBLIC":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "INTERNAL":
        return "bg-sky-500/10 text-sky-400 border-sky-500/30";
      case "RESTRICTED":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "CRITICAL":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      default:
        return "bg-white/10 text-white/70 border-white/20";
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl bg-[#080D1A]/90 border border-white/[0.08] backdrop-blur-xl text-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                Substrate Security
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                POLICY BOUNDARY ACTIVE
              </span>
            </div>
            <h3 className="text-sm font-semibold text-white/90 mt-0.5">
              Universal Capability Registry & Governance
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-white/60">Enforcement:</span>
            <span className="text-emerald-400 font-semibold">STRICT</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto text-[11px] font-mono">
        {["ALL", "floor00_analyst", "floor04_media_synthesis", "floor06_rendering"].map((fl) => {
          const isActive = filterFloor === fl;
          return (
            <button
              key={fl}
              type="button"
              onClick={() => setFilterFloor(fl)}
              className={`px-3 py-1.5 rounded-lg border transition-all ${
                isActive
                  ? "bg-amber-500/20 border-amber-500/50 text-white font-bold"
                  : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white"
              }`}
            >
              {fl === "ALL" ? "All Floors" : fl.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>

      {/* Capabilities List */}
      <div className="flex flex-col gap-2.5 max-h-72 overflow-y-auto pr-1">
        {filtered.map((cap) => (
          <div
            key={cap.id}
            className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-white/90">{cap.id}</span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${getSecurityBadge(cap.securityClassification)}`}>
                  {cap.securityClassification}
                </span>
              </div>
              <span className="text-[10px] font-mono text-white/50">{cap.license}</span>
            </div>

            <p className="text-xs text-white/70 font-sans">{cap.name}</p>

            <div className="flex items-center justify-between text-[10px] font-mono text-white/50 pt-1.5 border-t border-white/[0.04]">
              <span>Floors: {cap.allowedFloors.join(", ")}</span>
              <span className="text-amber-300">Roles: {cap.allowedRoles.join(", ")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
