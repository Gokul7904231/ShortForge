"use client";

import React, { useState } from "react";
import { Mic, Activity, CheckCircle, Volume2, ShieldCheck, Zap, AlertTriangle, XCircle, KeyRound, Radio } from "lucide-react";

export type VoiceEngineVerificationState =
  | "NOT_TESTED"
  | "PRECHECK_PASSED"
  | "CONFIGURED"
  | "SYNTHESIZING"
  | "ARTIFACT_VERIFIED"
  | "DEGRADED_FALLBACK"
  | "PROVIDER_UNAVAILABLE"
  | "CREDENTIALS_REQUIRED"
  | "AUTH_FAILED"
  | "FAILED"
  | "UNKNOWN";

export interface VoiceSynthesisEvidence {
  executionId?: string;
  provider: string;
  artifactId?: string;
  artifactSha256?: string;
  byteLength?: number;
  durationSeconds?: number;
  codec?: string;
  providerExecutionStatus?: "SUCCESS" | "DEGRADED_FALLBACK" | "FAILED";
  actualSynthesisStatus?: "REAL_SYNTHESIS" | "DEGRADED_FALLBACK" | "UNAVAILABLE";
}

export interface VoiceEngineStatus {
  id: string;
  name: string;
  isAvailable: boolean;
  estimatedLatencyMs?: number | null;
  latencyMeasurementStatus?: "OBSERVED" | "ESTIMATED" | "DECLARED" | "UNMEASURED" | "UNKNOWN";
  costPerSecUsd: number;
  format: string;
  qualityClass?: "PRIMARY" | "FALLBACK" | "DEGRADED_FALLBACK" | "PROTOTYPE";
}

export interface VoiceFabricPanelProps {
  activeProfile?: string;
  selectedEngine?: string;
  engines?: VoiceEngineStatus[];
  fallbackReady?: boolean;
}

export const VoiceFabricPanel: React.FC<VoiceFabricPanelProps> = ({
  activeProfile = "Deep Dramatic Narrator",
  selectedEngine = "GEMINI",
  engines = [
    {
      id: "GEMINI",
      name: "Google Gemini Neural TTS",
      isAvailable: false,
      estimatedLatencyMs: null,
      latencyMeasurementStatus: "UNMEASURED",
      costPerSecUsd: 0.0008,
      format: "WAV 24kHz",
      qualityClass: "PRIMARY",
    },
    {
      id: "ELEVENLABS",
      name: "ElevenLabs Multilingual v2",
      isAvailable: false,
      estimatedLatencyMs: null,
      latencyMeasurementStatus: "UNMEASURED",
      costPerSecUsd: 0.0035,
      format: "MP3 44.1kHz",
      qualityClass: "PRIMARY",
    },
    {
      id: "EDGE",
      name: "Microsoft Edge Speech TTS",
      isAvailable: false,
      estimatedLatencyMs: null,
      latencyMeasurementStatus: "UNMEASURED",
      costPerSecUsd: 0.0,
      format: "WAV 24kHz",
      qualityClass: "FALLBACK",
    },
    {
      id: "SILENT_WAV_FALLBACK",
      name: "Deterministic Silent WAV Engine (Silence)",
      isAvailable: true,
      estimatedLatencyMs: null,
      latencyMeasurementStatus: "UNMEASURED",
      costPerSecUsd: 0.0,
      format: "16-bit PCM Mono WAV (44-byte RIFF)",
      qualityClass: "DEGRADED_FALLBACK",
    },
  ],
  fallbackReady = true,
}) => {
  const [engineStates, setEngineStates] = useState<Record<string, VoiceEngineVerificationState>>({});
  const [evidenceRecords, setEvidenceRecords] = useState<Record<string, VoiceSynthesisEvidence>>({});

  const handleTestSynthesis = async (engineId: string) => {
    setEngineStates((prev) => ({ ...prev, [engineId]: "SYNTHESIZING" }));

    try {
      const res = await fetch("/api/fabric/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineId, phrase: "Testing FactoryOS voice synthesis." }),
      }).catch(() => null);

      if (!res) {
        setEngineStates((prev) => ({ ...prev, [engineId]: "FAILED" }));
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401 || data.verificationState === "AUTH_FAILED" || data.code === "AUTHENTICATION_FAILED") {
          setEngineStates((prev) => ({ ...prev, [engineId]: "AUTH_FAILED" }));
        } else if (res.status === 409 || data.verificationState === "CREDENTIALS_REQUIRED") {
          setEngineStates((prev) => ({ ...prev, [engineId]: "CREDENTIALS_REQUIRED" }));
        } else if (res.status === 502 || res.status === 503 || res.status === 504 || data.verificationState === "PROVIDER_UNAVAILABLE") {
          setEngineStates((prev) => ({ ...prev, [engineId]: "PROVIDER_UNAVAILABLE" }));
        } else {
          setEngineStates((prev) => ({ ...prev, [engineId]: "FAILED" }));
        }
        return;
      }

      const evidence: VoiceSynthesisEvidence = {
        executionId: data.executionId,
        provider: data.provider,
        artifactId: data.artifactId,
        artifactSha256: data.artifactSha256,
        byteLength: data.byteLength,
        durationSeconds: data.durationSeconds,
        codec: data.codec,
        providerExecutionStatus: data.providerExecutionStatus,
        actualSynthesisStatus: data.actualSynthesisStatus,
      };

      setEvidenceRecords((prev) => ({ ...prev, [engineId]: evidence }));

      if (data.actualSynthesisStatus === "REAL_SYNTHESIS") {
        setEngineStates((prev) => ({ ...prev, [engineId]: "ARTIFACT_VERIFIED" }));
      } else if (data.actualSynthesisStatus === "DEGRADED_FALLBACK") {
        setEngineStates((prev) => ({ ...prev, [engineId]: "DEGRADED_FALLBACK" }));
      } else {
        setEngineStates((prev) => ({ ...prev, [engineId]: "FAILED" }));
      }
    } catch {
      setEngineStates((prev) => ({ ...prev, [engineId]: "FAILED" }));
    }
  };

  const renderBadge = (state: VoiceEngineVerificationState) => {
    switch (state) {
      case "ARTIFACT_VERIFIED":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
            <CheckCircle className="w-3 h-3" /> ARTIFACT_VERIFIED
          </span>
        );
      case "DEGRADED_FALLBACK":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" /> DEGRADED_FALLBACK
          </span>
        );
      case "CREDENTIALS_REQUIRED":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/30">
            <KeyRound className="w-3 h-3" /> CREDENTIALS_REQUIRED
          </span>
        );
      case "PROVIDER_UNAVAILABLE":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
            <Radio className="w-3 h-3" /> PROVIDER_UNAVAILABLE
          </span>
        );
      case "AUTH_FAILED":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
            <XCircle className="w-3 h-3" /> AUTH_FAILED
          </span>
        );
      case "FAILED":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
            <XCircle className="w-3 h-3" /> FAILED
          </span>
        );
      case "SYNTHESIZING":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/30">
            <Activity className="w-3 h-3 animate-spin" /> SYNTHESIZING...
          </span>
        );
      case "CONFIGURED":
        return (
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
            CONFIGURED
          </span>
        );
      case "PRECHECK_PASSED":
        return (
          <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
            PRECHECK_PASSED
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono text-white/40 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
            NOT_TESTED
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl bg-[#080D1A]/90 border border-white/[0.08] backdrop-blur-xl text-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-400">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-violet-400 uppercase tracking-wider">
                Floor 04 — Voice Fabric
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                MULTI-ENGINE REGISTRY
              </span>
            </div>
            <h3 className="text-sm font-semibold text-white/90 mt-0.5">
              Active Profile: <span className="text-violet-300 font-mono">{activeProfile}</span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-white/60">Fallback:</span>
            <span className="text-emerald-400 font-semibold">{fallbackReady ? "ARMED" : "OFFLINE"}</span>
          </div>
        </div>
      </div>

      {/* Engine Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {engines.map((eng) => {
          const isSelected = selectedEngine === eng.id;
          const currentState = engineStates[eng.id] || "NOT_TESTED";
          const evidence = evidenceRecords[eng.id];

          return (
            <div
              key={eng.id}
              className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                isSelected
                  ? "bg-violet-500/10 border-violet-500/40 shadow-xs"
                  : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white/90">{eng.name}</span>
                    {eng.qualityClass && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${
                          eng.qualityClass === "PRIMARY"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : eng.qualityClass === "DEGRADED_FALLBACK"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                        }`}
                      >
                        {eng.qualityClass}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-white/50 block mt-0.5">{eng.format}</span>
                </div>
                <span
                  className={`w-2 h-2 rounded-full mt-1 ${
                    eng.isAvailable ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-red-400"
                  }`}
                />
              </div>

              {evidence && (
                <div className="p-2 rounded bg-black/40 border border-white/[0.04] text-[10px] font-mono text-white/70 flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span className="text-white/40">Artifact:</span>
                    <span>{evidence.artifactId || "none"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">SHA-256:</span>
                    <span>{evidence.artifactSha256 ? `${evidence.artifactSha256.slice(0, 10)}...` : "none"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Size / Duration:</span>
                    <span>{evidence.byteLength ? `${evidence.byteLength}B` : "0B"} / {evidence.durationSeconds || 0}s</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] font-mono text-white/60 pt-2 border-t border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    {eng.estimatedLatencyMs != null ? `${eng.estimatedLatencyMs}ms` : "UNMEASURED"}
                  </span>
                  <span>${eng.costPerSecUsd}/s</span>
                </div>

                <div className="flex items-center gap-2">
                  {renderBadge(currentState)}
                  <button
                    type="button"
                    onClick={() => handleTestSynthesis(eng.id)}
                    disabled={currentState === "SYNTHESIZING"}
                    className="px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] font-mono text-white/80 transition-colors flex items-center gap-1"
                  >
                    <Volume2 className="w-3 h-3 text-white/60" />
                    <span>Test</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
