"use client";

import React, { useState } from "react";
import { 
  Activity, ShieldAlert, Cpu, CheckCircle2, Clock, 
  AlertTriangle, DollarSign, Layers, X, RefreshCw 
} from "lucide-react";

interface AdminOperationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminOperationsDrawer({ isOpen, onClose }: AdminOperationsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"MISSIONS" | "WORKERS" | "PROVIDERS" | "SKILLS" | "COST">("MISSIONS");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl z-50 flex flex-col text-zinc-100 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase text-zinc-200">ShortForge Operations</h2>
            <p className="text-xs text-zinc-400">Progressive Operations Diagnostics & Telemetry</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Attention Bar */}
      <div className="p-3 bg-zinc-900 border-b border-zinc-800 grid grid-cols-5 gap-2 text-center text-xs font-mono">
        <div className="p-2 rounded bg-amber-950/40 border border-amber-800/40 text-amber-300">
          <div className="text-[10px] text-amber-500 uppercase">Needs Approval</div>
          <div className="text-base font-bold">1</div>
        </div>
        <div className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300">
          <div className="text-[10px] text-rose-500 uppercase">Failed</div>
          <div className="text-base font-bold">0</div>
        </div>
        <div className="p-2 rounded bg-yellow-950/40 border border-yellow-800/40 text-yellow-300">
          <div className="text-[10px] text-yellow-500 uppercase">Degraded</div>
          <div className="text-base font-bold">1</div>
        </div>
        <div className="p-2 rounded bg-blue-950/40 border border-blue-800/40 text-blue-300">
          <div className="text-[10px] text-blue-500 uppercase">Working</div>
          <div className="text-base font-bold">4</div>
        </div>
        <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-300">
          <div className="text-[10px] text-emerald-500 uppercase">Idle</div>
          <div className="text-base font-bold">2</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 px-4 gap-4 text-xs font-medium bg-zinc-900/30">
        {(["MISSIONS", "WORKERS", "PROVIDERS", "SKILLS", "COST"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-2.5 border-b-2 transition ${
              activeTab === tab 
                ? "border-emerald-500 text-emerald-400 font-semibold" 
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {activeTab === "MISSIONS" && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-emerald-400 font-bold">mission_001_quantum</span>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]">AUTO</span>
              </div>
              <p className="text-zinc-300">"Create 30-second educational short on Quantum Computing"</p>
              <div className="flex justify-between text-zinc-400 text-[11px]">
                <span>Phase: RENDERING</span>
                <span>DoD Verified: 4 / 7</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-[65%]" />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-amber-400 font-bold">mission_pub_youtube_09</span>
                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px]">WAITING_FOR_APPROVAL</span>
              </div>
              <p className="text-zinc-300">"Publish Video #104 to YouTube Public Channel"</p>
              <p className="text-amber-400 text-[11px]">Action requires human confirmation before public release.</p>
              <div className="flex gap-2 pt-1">
                <button className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold rounded text-xs transition">
                  Approve Publication
                </button>
                <button className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition">
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "WORKERS" && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex justify-between items-center">
              <div>
                <div className="font-semibold text-zinc-200">Distributed GPU Render Pool</div>
                <div className="text-zinc-400 text-[11px]">Role Target: ADMIN / OWNER</div>
              </div>
              <span className="px-2 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px]">ONLINE (Scale-to-Zero)</span>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex justify-between items-center">
              <div>
                <div className="font-semibold text-zinc-200">GitHub Actions Basic Pool</div>
                <div className="text-zinc-400 text-[11px]">Role Target: VIEWER / EDITOR</div>
              </div>
              <span className="px-2 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[11px]">ONLINE (4 Active Runners)</span>
            </div>
          </div>
        )}

        {activeTab === "PROVIDERS" && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex justify-between items-center">
              <div>
                <div className="font-semibold text-zinc-200">Google Gemini 2.5 Flash</div>
                <div className="text-zinc-400 text-[11px]">Text, Vision, Structured JSON • Free Tier</div>
              </div>
              <span className="font-mono text-emerald-400 text-xs">182ms</span>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex justify-between items-center">
              <div>
                <div className="font-semibold text-zinc-200">Ollama Local (Qwen 2.5)</div>
                <div className="text-zinc-400 text-[11px]">Local Inference • Zero-Cost</div>
              </div>
              <span className="font-mono text-emerald-400 text-xs">118ms</span>
            </div>
          </div>
        )}

        {activeTab === "SKILLS" && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-zinc-200">quota-management@1.0.0</span>
                <span className="text-emerald-400 font-mono">PROMOTED</span>
              </div>
              <div className="text-zinc-400 text-[11px]">NVIDIA Evaluator: Tier 1 PASS • Tier 2 PASS • pass@k: 0.99</div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-zinc-200">render-orchestration@1.0.0</span>
                <span className="text-emerald-400 font-mono">PROMOTED</span>
              </div>
              <div className="text-zinc-400 text-[11px]">NVIDIA Evaluator: Skill Lift +8.5% • pass@k: 0.95</div>
            </div>
          </div>
        )}

        {activeTab === "COST" && (
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
              <div className="text-zinc-400 text-[11px] uppercase tracking-wider">Active Cost Governor Mode</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">FREE_FIRST (Default)</div>
              <div className="text-zinc-300">Daily Spend: $0.00 / Max: $0.00 (Zero-Cost Local & Free APIs Priority)</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
