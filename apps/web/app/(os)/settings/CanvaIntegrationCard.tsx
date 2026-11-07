"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Palette, ExternalLink, CheckCircle, AlertTriangle, 
  RefreshCw, ShieldCheck, Unlink, Layers, Sparkles, AlertCircle
} from "lucide-react";

interface CanvaStatusResponse {
  success: boolean;
  connected: boolean;
  status: "CONNECTED" | "NOT_CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR";
  userId?: string;
  displayName?: string;
  expiresAt?: string;
  scope?: string;
  hasCredentials: boolean;
  redirectUri?: string;
  capabilities?: {
    canAutofill: boolean;
    canExport: boolean;
    canReadDesigns: boolean;
    canWriteAssets: boolean;
    subscriptionTier?: string;
    note?: string;
  };
}

export function CanvaIntegrationCard() {
  const queryClient = useQueryClient();
  const [disconnecting, setDisconnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<CanvaStatusResponse>({
    queryKey: ["canva-integration-status"],
    queryFn: async () => {
      const res = await fetch("/api/canva/status");
      if (!res.ok) throw new Error("Failed to load Canva status");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      setDisconnecting(true);
      setErrorMsg(null);
      const res = await fetch("/api/canva/disconnect", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to disconnect Canva");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canva-integration-status"] });
      setDisconnecting(false);
    },
    onError: (err: any) => {
      setErrorMsg(err.message);
      setDisconnecting(false);
    },
  });

  const isConnected = data?.connected && data?.status === "CONNECTED";

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-800 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2 uppercase tracking-wider font-mono">
              <Palette className="w-4 h-4 text-cyan-400" />
              Canva Hybrid Visual Design Integration
            </h2>
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-wider ${
                isConnected
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : data?.hasCredentials
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
              }`}
            >
              {isConnected ? "CONNECTED" : data?.status || "NOT CONNECTED"}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Author 9:16 portrait design templates in Canva while ShortForge handles native rendering, narration, and 5-second think gates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnecting}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Unlink className="w-3.5 h-3.5" />
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          ) : (
            <a
              href="/api/canva/connect"
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/10"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Connect Canva Account
            </a>
          )}
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Feature & Architecture Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Account & Connection */}
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest font-mono">
              Identity & Auth
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400">
              RFC 7636 PKCE
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-bold text-zinc-200">
              {isConnected ? (data?.displayName || data?.userId || "Canva User") : "Not Linked"}
            </div>
            <p className="text-[11px] text-zinc-500 font-mono truncate">
              {isConnected
                ? `Expires: ${data?.expiresAt ? new Date(data.expiresAt).toLocaleTimeString() : "Session Active"}`
                : "Awaiting OAuth authorization code grant"}
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-850 text-[11px] font-mono text-zinc-400 flex justify-between">
            <span>OAuth Client:</span>
            <span className={data?.hasCredentials ? "text-emerald-400" : "text-rose-400"}>
              {data?.hasCredentials ? "Configured in .env" : "Missing Client ID"}
            </span>
          </div>
        </div>

        {/* Card 2: Canva Capabilities & Pro Lite Decoupling */}
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest font-mono">
              Capability Status
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/20 text-purple-300">
              PRO LITE SAFE
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between font-mono">
              <span className="text-zinc-400">Design Read:</span>
              <span className="text-emerald-400">Available</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-zinc-400">Asset Ingest:</span>
              <span className="text-emerald-400">Available</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-zinc-400">Canva Autofill:</span>
              <span className="text-amber-400">Bypassed (Native Engine)</span>
            </div>
          </div>
          <div className="pt-2 border-t border-zinc-850 text-[10px] text-zinc-500 leading-snug">
            Canva Pro Lite restriction detected. Dynamic content uses native ShortForge composition.
          </div>
        </div>

        {/* Card 3: Native Production Pipeline */}
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">
              Rendering Engine
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-400">
              FACTORYOS-RENDER
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-bold text-zinc-200">Pillow + FFmpeg Native</div>
            <p className="text-[11px] text-zinc-400">
              Template: <code className="text-emerald-400 font-mono">quiz.universal.cinematic.v2</code>
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-850 text-[11px] font-mono text-zinc-400 flex justify-between">
            <span>5-Sec Think Gate:</span>
            <span className="text-emerald-400">150 Frames (Silent)</span>
          </div>
        </div>
      </div>

      {/* Developer Portal Redirect URI Guidance */}
      <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-4 space-y-2 font-mono text-xs">
        <div className="flex items-center gap-2 text-zinc-300 font-bold">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>Canva Developer Portal Configuration</span>
        </div>
        <p className="text-[11px] text-zinc-500">
          Register the following Redirect URI in your Canva Developer App Settings to authorize authorization code callbacks:
        </p>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-cyan-300 select-all text-[11px]">
          {data?.redirectUri || "http://localhost:3000/api/canva/callback"}
        </div>
      </div>
    </div>
  );
}
