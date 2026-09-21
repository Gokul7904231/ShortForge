"use client";

import React, { useState } from "react";
import { Search, ShieldCheck, AlertCircle, FileText, Globe, CheckCircle2 } from "lucide-react";

export interface ResearchClaimItem {
  claimId: string;
  statement: string;
  type: "MODEL_CLAIM" | "SOURCE_CLAIM" | "VERIFIED_FACT" | "UNVERIFIED_ASSERTION" | "CONTRADICTED_CLAIM" | "AMBIGUOUS_CLAIM";
  confidence: number;
  sourcesCount: number;
}

export interface AnalystResearchPanelProps {
  passportId?: string | null;
  topic?: string | null;
  domain?: string | null;
  claims?: ResearchClaimItem[];
  overallConfidence?: number | null;
  confidenceStatus?: "OBSERVED" | "ESTIMATED" | "DECLARED" | "UNKNOWN" | "UNAVAILABLE";
  reachStatus?: "ONLINE" | "RESTRICTED" | "STANDBY" | "UNKNOWN";
  lightpandaEngineStatus?: "ACTIVE" | "IDLE" | "UNKNOWN";
}

export const AnalystResearchPanel: React.FC<AnalystResearchPanelProps> = ({
  passportId = null,
  topic = null,
  domain = null,
  claims = [],
  overallConfidence = null,
  confidenceStatus = "UNKNOWN",
  reachStatus = "STANDBY",
  lightpandaEngineStatus = "UNKNOWN",
}) => {
  const [filterType, setFilterType] = useState<string>("ALL");

  const filteredClaims =
    filterType === "ALL" ? claims : claims.filter((c) => c.type === filterType);

  const getClaimBadge = (type: string) => {
    switch (type) {
      case "VERIFIED_FACT":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "MODEL_CLAIM":
        return "bg-sky-500/10 text-sky-400 border-sky-500/30";
      case "SOURCE_CLAIM":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
      case "UNVERIFIED_ASSERTION":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "CONTRADICTED_CLAIM":
        return "bg-rose-500/10 text-rose-400 border-rose-500/30";
      case "AMBIGUOUS_CLAIM":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-white/10 text-white/70 border-white/20";
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl bg-[#080D1A]/90 border border-white/[0.08] backdrop-blur-xl text-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider">
                Floor 00 — Analyst Subsystem
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                CONDITIONAL DAG NODE
              </span>
            </div>
            <h3 className="text-sm font-semibold text-white/90 mt-0.5">
              {topic ?? <span className="text-white/40 italic">No topic under active research</span>}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-white/60">Reach:</span>
            <span className="text-emerald-400 font-semibold">{reachStatus}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-white/60">Engine:</span>
            <span className="text-white/90 font-semibold">{lightpandaEngineStatus}</span>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-3 gap-3 text-xs font-mono">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <span className="text-white/50 block text-[11px]">Research Passport</span>
          <span className="text-sky-400 font-bold mt-1 block truncate">
            {passportId ?? <span className="text-white/30 italic">NONE</span>}
          </span>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <span className="text-white/50 block text-[11px]">Overall Confidence</span>
          {overallConfidence !== null ? (
            <span className="text-emerald-400 font-bold mt-1 block">
              {(overallConfidence * 100).toFixed(1)}% ({confidenceStatus})
            </span>
          ) : (
            <span className="text-amber-400 font-bold mt-1 block">UNMEASURED ({confidenceStatus})</span>
          )}
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <span className="text-white/50 block text-[11px]">Domain Sandbox</span>
          <span className="text-indigo-400 font-bold mt-1 block uppercase">
            {domain ?? <span className="text-white/30 italic">UNBOUND</span>}
          </span>
        </div>
      </div>

      {/* Claim Type Filter Tabs */}
      <div className="flex items-center gap-2 pt-2 overflow-x-auto text-[11px] font-mono">
        {["ALL", "VERIFIED_FACT", "MODEL_CLAIM", "SOURCE_CLAIM", "UNVERIFIED_ASSERTION"].map((type) => {
          const count = type === "ALL" ? claims.length : claims.filter((c) => c.type === type).length;
          const isActive = filterType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                isActive
                  ? "bg-sky-500/20 border-sky-500/50 text-white font-bold"
                  : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <span>{type.replace(/_/g, " ")}</span>
              <span className="px-1.5 py-0.2 rounded bg-black/40 text-[10px] text-white/50">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Claim List */}
      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
        {filteredClaims.map((claim) => (
          <div
            key={claim.claimId}
            className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${getClaimBadge(claim.type)}`}>
                {claim.type}
              </span>
              <div className="flex items-center gap-3 text-[11px] font-mono text-white/60">
                <span>Sources: {claim.sourcesCount}</span>
                <span className="text-emerald-400 font-semibold">
                  {(claim.confidence * 100).toFixed(0)}% conf
                </span>
              </div>
            </div>
            <p className="text-xs text-white/80 leading-relaxed font-sans">{claim.statement}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
