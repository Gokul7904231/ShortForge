"use client";

import React, { useState, memo } from "react";
import {
  X,
  Layers,
  Target,
  ShieldAlert,
  Brain,
  Cpu,
  RefreshCw,
  KeyRound,
  Sliders,
  Search,
} from "lucide-react";
import { OverseerActivity, type ActivityEvent } from "./OverseerActivity";
import { AnalystResearchPanel } from "../../factoryos/AnalystResearchPanel";
import { VoiceFabricPanel } from "../../factoryos/VoiceFabricPanel";
import { RenderFabricPanel } from "../../factoryos/RenderFabricPanel";
import { CapabilityRegistryPanel } from "../../factoryos/CapabilityRegistryPanel";

export type DisclosurePanel = "floors" | "capabilities" | "fabrics" | "missions" | "cases" | "decisions" | "activity";

export interface OperationalStateData {
  floors?: Array<{
    floorId: string;
    name: string;
    status: string;
    workersCount: number;
    lastError?: string;
    metrics?: Record<string, unknown>;
  }>;
  missions?: Array<{
    missionId: string;
    goal: string;
    status: string;
    progress: { percentComplete: number; completedTasks: number; totalTasks: number };
    budget?: { maxTokens?: number; maxCostUsd?: number; maxDurationMs?: number };
    taskCount: number;
  }>;
  cases?: Array<{
    caseId: string;
    title: string;
    floorId: string;
    severity: string;
    status: string;
    detectorId: string;
    description: string;
    evidenceCount: number;
    hypothesesCount: number;
  }>;
  decisions?: Array<{
    decisionId: string;
    thinkingMode: string;
    selectedOption: string;
    reasoningSummary: string;
    timestamp: string;
  }>;
  activity?: ActivityEvent[];
  subsystems?: {
    capabilities?: any[];
    voiceFabric?: any;
    renderFabric?: any;
    evolutionBrain?: any;
    contentGenome?: any;
    researchRuntime?: any;
  };
}

interface ProgressiveDisclosureProps {
  activePanel: DisclosurePanel | null;
  onClose: () => void;
  stateData?: OperationalStateData;
  onRefresh?: () => void;
  accentColor?: string;
}

export const OverseerProgressiveDisclosure: React.FC<ProgressiveDisclosureProps> = memo(({
  activePanel,
  onClose,
  stateData,
  onRefresh,
  accentColor = "#1677FF",
}) => {
  const [selectedTab, setSelectedTab] = useState<DisclosurePanel>(activePanel || "floors");

  React.useEffect(() => {
    if (activePanel) {
      setSelectedTab(activePanel);
    }
  }, [activePanel]);

  if (!activePanel) return null;

  const floors = stateData?.floors || [];

  const missions = stateData?.missions || [];
  const cases = stateData?.cases || [];
  const decisions = stateData?.decisions || [];
  const activity = stateData?.activity || [];

  return (
    <aside
      className="fixed inset-y-0 right-0 w-full max-w-lg bg-[#070D18] border-l border-white/[0.08] backdrop-blur-2xl p-6 z-40 shadow-2xl flex flex-col gap-4 animate-slide-in select-none"
      aria-label="Overseer Operational Details Drawer"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#1677FF]/10 border border-[#1677FF]/20 text-[#1677FF]">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-mono font-bold tracking-wider uppercase text-[#F5F7FA]">
              OPERATIONAL TELEMETRY
            </h2>
            <span className="text-[10px] font-mono text-[#667085]">Live ShortForge Substrate</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh telemetry"
              className="p-1.5 rounded-lg text-[#A8B2C1] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close telemetry HUD"
            className="p-1.5 rounded-lg text-[#A8B2C1] hover:text-[#F5F7FA] hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 pb-2 border-b border-white/[0.06] overflow-x-auto text-xs font-mono">
        {[
          { id: "floors", label: "Floors", icon: Layers, count: floors.length },
          { id: "capabilities", label: "Capabilities", icon: KeyRound, count: stateData?.subsystems?.capabilities?.length ?? 0 },
          { id: "fabrics", label: "Fabrics", icon: Sliders, count: (stateData?.subsystems as any)?.fabrics?.length ?? undefined },
          { id: "missions", label: "Missions", icon: Target, count: missions.length },
          { id: "cases", label: "Cases", icon: ShieldAlert, count: cases.length },
          { id: "decisions", label: "Decisions", icon: Brain, count: decisions.length },
          { id: "activity", label: "Timeline", icon: RefreshCw, count: activity.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = selectedTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(tab.id as DisclosurePanel)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                isActive
                  ? "bg-[#1677FF] text-white font-bold shadow-xs"
                  : "text-[#8491A3] hover:text-[#F5F7FA] hover:bg-[#121E32]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] px-1 py-0.2 rounded ${isActive ? "bg-white/20 text-white" : "bg-[#0A1220] text-[#667085]"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel Contents */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 terminal-scroll">
        {/* 1. FLOORS TAB */}
        {selectedTab === "floors" && (
          <div className="space-y-3">
            {floors.map((f) => {
              const isOnline = f.status === "ONLINE";
              return (
                <div
                  key={f.floorId}
                  className="p-3.5 rounded-xl bg-[#0B1422] border border-white/[0.07] hover:bg-[#111D2F] transition-all flex flex-col gap-2 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#F5F7FA]">{f.name}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        isOnline
                          ? "bg-[#19C37D]/10 text-[#19C37D] border border-[#19C37D]/20"
                          : "bg-[#FF5A67]/10 text-[#FF5A67] border border-[#FF5A67]/20"
                      }`}
                    >
                      {f.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#A8B2C1]">
                    <span>Assigned Workers: {f.workersCount}</span>
                    <span className="text-[#667085]">Floor ID: {f.floorId}</span>
                  </div>
                  {f.lastError && (
                    <div className="mt-1 p-2 rounded bg-[#FF5A67]/10 border border-[#FF5A67]/20 text-[11px] font-mono text-[#FF5A67]">
                      Error: {f.lastError}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="pt-2 border-t border-white/[0.06]">
              <span className="text-[10px] font-mono text-[#667085] uppercase tracking-wider block mb-2">
                Floor 00 — Research & Intelligence Seam
              </span>
              <AnalystResearchPanel />
            </div>
          </div>
        )}

        {/* 2. CAPABILITIES TAB */}
        {selectedTab === "capabilities" && (
          <div className="space-y-3">
            <CapabilityRegistryPanel capabilities={stateData?.subsystems?.capabilities} />
          </div>
        )}

        {/* 3. FABRICS TAB */}
        {selectedTab === "fabrics" && (
          <div className="space-y-4">
            <VoiceFabricPanel />
            <RenderFabricPanel />
          </div>
        )}

        {/* 4. MISSIONS TAB */}
        {selectedTab === "missions" && (
          <div className="space-y-3">
            {missions.length === 0 ? (
              <div className="p-4 text-center text-xs font-mono text-[#667085] bg-[#0B1422] rounded-xl border border-white/[0.07]">
                No active missions. Factory is idle and ready for ingestion.
              </div>
            ) : (
              missions.map((m) => (
                <div
                  key={m.missionId}
                  className="p-4 rounded-xl bg-[#0B1422] border border-white/[0.07] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#1677FF]">
                      {m.missionId}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1677FF]/10 text-[#1677FF] border border-[#1677FF]/20">
                      {m.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#F5F7FA] font-sans leading-relaxed">{m.goal}</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#A8B2C1]">
                      <span>DAG Progress</span>
                      <span>{m.progress.percentComplete}% ({m.progress.completedTasks}/{m.progress.totalTasks || m.taskCount} tasks)</span>
                    </div>
                    <div className="w-full bg-[#070D18] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#1677FF] h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, m.progress.percentComplete)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 3. CASES TAB */}
        {selectedTab === "cases" && (
          <div className="space-y-3">
            {cases.length === 0 ? (
              <div className="p-4 text-center text-xs font-mono text-[#19C37D] bg-[#19C37D]/10 border border-[#19C37D]/20 rounded-xl">
                ✓ 0 Active Blocking Cases. Factory operating at full throughput.
              </div>
            ) : (
              cases.map((c) => (
                <div
                  key={c.caseId}
                  className="p-4 rounded-xl bg-[#0B1422] border border-[#F5B942]/30 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#F5B942]">{c.caseId}</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#F5B942]/10 text-[#F5B942] border border-[#F5B942]/20">
                      {c.severity} // {c.status}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-[#F5F7FA]">{c.title}</h4>
                  <p className="text-[11px] text-[#A8B2C1] leading-relaxed">{c.description}</p>
                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-[#667085]">
                    <span>Floor: {c.floorId}</span>
                    <span>Detector: {c.detectorId}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 4. DECISIONS TAB */}
        {selectedTab === "decisions" && (
          <div className="space-y-3">
            {decisions.length === 0 ? (
              <div className="p-4 text-center text-xs font-mono text-[#667085] bg-[#0B1422] rounded-xl border border-white/[0.07]">
                No recent decisions recorded in the ledger.
              </div>
            ) : (
              decisions.map((d) => (
                <div
                  key={d.decisionId}
                  className="p-4 rounded-xl bg-[#0B1422] border border-purple-500/20 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-purple-400">
                      DECISION: {d.selectedOption}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      MODE: {d.thinkingMode}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#070D18] border border-white/[0.06] text-xs font-sans text-[#F5F7FA] leading-relaxed">
                    <span className="text-[10px] font-mono text-[#667085] block mb-1 uppercase tracking-wider">
                      Authoritative Reasoning Summary:
                    </span>
                    {d.reasoningSummary}
                  </div>
                  <span className="text-[10px] font-mono text-[#667085] block text-right">
                    {new Date(d.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* 5. TIMELINE / ACTIVITY TAB */}
        {selectedTab === "activity" && <OverseerActivity events={activity} />}
      </div>
    </aside>
  );
});

OverseerProgressiveDisclosure.displayName = "OverseerProgressiveDisclosure";
