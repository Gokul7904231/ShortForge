"use client";

import React, { useState } from "react";
import { 
  GitBranch, Clock, ShieldCheck, Database, FileText, ChevronRight, Plus, 
  ArrowRight, Cpu, Layers, CheckCircle2
} from "lucide-react";
import NewWorkflowForm from "@/components/NewWorkflowForm";
import WebsiteModal from "@/components/WebsiteModal";

export interface WorkflowStep {
  id: string;
  name: string;
  enabled: boolean;
  dependsOn?: string[];
  retry: number;
  timeoutMs: number;
  primaryModel: string;
  fallbackModel: string;
  cacheKey?: string;
  avgDurationMs: number;
  logs?: string[];
}

export default function WorkflowsPage() {
  const [showNewWorkflowModal, setShowNewWorkflowModal] = useState(false);
  const [websiteToast, setWebsiteToast] = useState<{ isOpen: boolean; title: string; desc: string }>({
    isOpen: false,
    title: "",
    desc: "",
  });

  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: "script",
      name: "AI Script Generator",
      enabled: true,
      retry: 2,
      timeoutMs: 15000,
      primaryModel: "gemini-1.5-flash",
      fallbackModel: "llama-3.3-70b-versatile",
      cacheKey: "script_hash_v1",
      avgDurationMs: 4200,
      logs: ["Generated script successfully.", "Temperature set to 0.7", "Prompt tokens: 1,240"],
    },
    {
      id: "critic",
      name: "AI Script Critic & Validator",
      enabled: true,
      dependsOn: ["script"],
      retry: 1,
      timeoutMs: 10000,
      primaryModel: "llama-3.3-70b-versatile",
      fallbackModel: "deepseek-chat",
      avgDurationMs: 1400,
      logs: ["Validated fact checklist.", "Safety score: 0.99", "Grammar check passed."],
    },
    {
      id: "scene",
      name: "Visual Scene & Overlay Planner",
      enabled: true,
      dependsOn: ["critic"],
      retry: 2,
      timeoutMs: 20000,
      primaryModel: "gemini-1.5-pro",
      fallbackModel: "claude-3-5-sonnet",
      avgDurationMs: 2800,
      logs: ["Mapped 5 visual scenes.", "Visual layout & timestamps aligned."],
    },
    {
      id: "voice",
      name: "Speech & Audio Synthesizer",
      enabled: true,
      dependsOn: ["scene"],
      retry: 3,
      timeoutMs: 30000,
      primaryModel: "local/kokoro-tts",
      fallbackModel: "edge-tts",
      avgDurationMs: 3200,
      logs: ["Synthesized audio track.", "Pitch modifier: 1.05", "Duration: 42.5s"],
    },
    {
      id: "image",
      name: "Visual Asset Generator",
      enabled: true,
      dependsOn: ["scene"],
      retry: 2,
      timeoutMs: 45000,
      primaryModel: "wikimedia-commons",
      fallbackModel: "openverse-api",
      avgDurationMs: 8900,
      logs: ["Fetched 5 media frames from Wikimedia Commons.", "Fallback to Openverse enabled.", "License: CC BY-SA / Public Domain"],
    },
    {
      id: "render",
      name: "FFmpeg Hardware Composite Engine",
      enabled: true,
      dependsOn: ["voice", "image"],
      retry: 1,
      timeoutMs: 120000,
      primaryModel: "distributed-render-fabric",
      fallbackModel: "services/rendering-engine",
      avgDurationMs: 14500,
      logs: ["Assembled scene blocks through distributed Render Fabric.", "Provider selected by ComputeRouter.", "F07 verification remains authoritative."],
    },
    {
      id: "upload",
      name: "Cloud Storage Uploader",
      enabled: true,
      dependsOn: ["render"],
      retry: 3,
      timeoutMs: 90000,
      primaryModel: "google/drive-api",
      fallbackModel: "backblaze/b2-api",
      avgDurationMs: 2500,
      logs: ["Synced file to cloud folder.", "Generated public streaming URL."],
    },
    {
      id: "publish",
      name: "YouTube Shorts Publisher",
      enabled: true,
      dependsOn: ["upload"],
      retry: 2,
      timeoutMs: 60000,
      primaryModel: "youtube/publishing-queue",
      fallbackModel: "scheduled-drafts",
      avgDurationMs: 1800,
      logs: ["Added YouTube shorts queue.", "SEO Tags attached."],
    },
  ]);

  const [selectedNode, setSelectedNode] = useState<WorkflowStep>(steps[0]);

  // Topological sorting algorithm to group DAG steps into execution levels/layers
  const computeDagLevels = (nodes: WorkflowStep[]): WorkflowStep[][] => {
    const levelMap = new Map<string, number>();

    const getLevel = (node: WorkflowStep): number => {
      if (levelMap.has(node.id)) return levelMap.get(node.id)!;
      if (!node.dependsOn || node.dependsOn.length === 0) {
        levelMap.set(node.id, 0);
        return 0;
      }
      let maxParentLevel = 0;
      for (const parentId of node.dependsOn) {
        const parentNode = nodes.find((n) => n.id === parentId);
        if (parentNode) {
          maxParentLevel = Math.max(maxParentLevel, getLevel(parentNode) + 1);
        }
      }
      levelMap.set(node.id, maxParentLevel);
      return maxParentLevel;
    };

    nodes.forEach((n) => getLevel(n));

    const levels: WorkflowStep[][] = [];
    levelMap.forEach((lvl, nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        if (!levels[lvl]) levels[lvl] = [];
        levels[lvl].push(node);
      }
    });

    return levels;
  };

  const dagLevels = computeDagLevels(steps);

  const handleSelectNode = (node: WorkflowStep) => {
    setSelectedNode(node);
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto font-body-base">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-900">
        <div>
          <h1 className="text-xl font-bold text-zinc-50 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-emerald-400" />
            Factory Pipeline DAGs
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Topologically-sorted Directed Acyclic Graph (DAG) pipeline structure. Click nodes to inspect stage telemetry & multi-model fallback chains.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewWorkflowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10"
          >
            <Plus className="w-4 h-4" /> Custom DAG Builder
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Dynamic Topologically-Sorted Real DAG Tree Structure */}
        <div className="lg:col-span-8 bg-zinc-950/60 border border-zinc-850 rounded-2xl p-6 flex flex-col justify-between min-h-[500px]">
          <div className="flex justify-between items-center border-b border-zinc-850 pb-3 mb-6">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-emerald-400" /> Topologically Evaluated DAG Pipeline Structure
            </span>
            <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              {steps.length} Stages • {dagLevels.length} Topological Layers
            </span>
          </div>

          {/* Render DAG Tree Levels */}
          <div className="flex flex-col items-center gap-6 my-auto py-4">
            {dagLevels.map((levelNodes, levelIndex) => (
              <div key={levelIndex} className="flex flex-col items-center w-full">
                {/* Connecting Arrow from Previous Level */}
                {levelIndex > 0 && (
                  <div className="flex items-center justify-center my-2 text-zinc-700">
                    <div className="h-6 w-px bg-zinc-800" />
                  </div>
                )}

                {/* Level Nodes Row */}
                <div className="flex items-center justify-center gap-6 flex-wrap">
                  {levelNodes.map((node) => {
                    const isSelected = selectedNode?.id === node.id;
                    return (
                      <button
                        key={node.id}
                        onClick={() => handleSelectNode(node)}
                        className={`group relative px-5 py-2.5 rounded-2xl border text-xs font-mono font-bold transition-all shadow-lg flex flex-col items-center justify-center min-w-[120px] ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-300 ring-2 ring-emerald-500/20"
                            : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        <span>{node.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-zinc-850 flex justify-between items-center text-[10px] font-mono text-zinc-500">
            <span>Execution Model: Parallel Isolate Queue</span>
            <span>Failover: Multi-Provider Strategy Enabled</span>
          </div>
        </div>

        {/* Right: Node Inspector Pane */}
        <div className="lg:col-span-4 bg-zinc-950/60 border border-zinc-850 rounded-2xl p-6 space-y-5 flex flex-col justify-between min-h-[500px]">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3 mb-4">
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-2 font-mono">
                <GitBranch className="w-4 h-4 text-emerald-400" /> Node Stage Inspector
              </h3>
            </div>

            {selectedNode ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">{selectedNode.name}</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                    Stage Identifier: <span className="text-emerald-400 font-bold">{selectedNode.id}</span>
                  </p>
                </div>

                {/* AI Router & Fallback Chain */}
                <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono block">
                    AI ROUTER & FALLBACK CHAIN
                  </span>
                  <div className="flex flex-col gap-1.5 text-xs font-mono">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Primary:</span>
                      <span className="text-emerald-400 font-bold">{selectedNode.primaryModel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Fallback:</span>
                      <span className="text-amber-400 font-bold">{selectedNode.fallbackModel}</span>
                    </div>
                  </div>
                </div>

                {/* Stage Execution Parameters */}
                <div className="space-y-2 text-xs font-mono bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-800/80 text-zinc-400">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Max Retries:</span>
                    <span className="text-zinc-200 font-bold">{selectedNode.retry}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Timeout Limit:</span>
                    <span className="text-zinc-200 font-bold">{(selectedNode.timeoutMs / 1000).toFixed(0)}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Cache Etag:</span>
                    <span className="text-zinc-200 font-bold truncate max-w-[130px]">{selectedNode.cacheKey ?? "None"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Average Latency:</span>
                    <span className="text-zinc-200 font-bold">{(selectedNode.avgDurationMs / 1000).toFixed(1)}s</span>
                  </div>
                </div>

                {/* Telemetry Logs */}
                {selectedNode.logs && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono block">
                      LIVE TELEMETRY EVENT STREAM
                    </span>
                    <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800 font-mono text-[10px] text-zinc-400 space-y-1.5">
                      {selectedNode.logs.map((log, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-400 shrink-0">➔</span>
                          <span>{log}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-20 text-zinc-500 font-medium">
                <Clock className="w-8 h-8 text-zinc-700 mb-2" />
                Select any node in the pipeline tree to inspect telemetry.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CUSTOM DAG BUILDER MODAL */}
      {showNewWorkflowModal && (
        <NewWorkflowForm
          isModal={true}
          onDismiss={() => {
            setShowNewWorkflowModal(false);
            setWebsiteToast({
              isOpen: true,
              title: "Custom DAG Workflow Registered",
              desc: "Workflow DAG structure saved and compiled into topological execution layers.",
            });
          }}
        />
      )}

      {/* WEBSITE TOAST */}
      <WebsiteModal
        isOpen={websiteToast.isOpen}
        onClose={() => setWebsiteToast((prev) => ({ ...prev, isOpen: false }))}
        title={websiteToast.title}
        description={websiteToast.desc}
        icon="info"
        confirmText="OK / Dismiss"
      />
    </div>
  );
}
