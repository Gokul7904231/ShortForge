"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Settings, Key, Trash2, RefreshCw, CheckCircle, 
  AlertTriangle, HardDrive, Clock, Sliders, ArrowRight,
  Server, Cpu, ShieldCheck, Copy, Download, Terminal,
  Zap, Lock, ShieldAlert, Monitor, Activity, Radio
} from "lucide-react";
import { useThemeStore } from "@/lib/theme-store";
import { useMounted } from "@/lib/useMounted";

export default function SettingsPage() {
  const mounted = useMounted();
  const { theme, setTheme } = useThemeStore();
  const [newKeyPath, setNewKeyPath] = useState("");
  const [deleteOld, setDeleteOld] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [rotating, setRotating] = useState(false);

  // Pairing Modal & Worker State
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [lockdownActive, setLockdownActive] = useState(false);

  // Fetch Current Service Account Key Settings
  const { data: keyData, refetch: refetchKeys, isLoading: keysLoading } = useQuery({
    queryKey: ["key-rotation-settings"],
    queryFn: async () => {
      const res = await fetch("/api/storage/rotate-key");
      if (!res.ok) throw new Error("Failed to load key settings");
      return res.json();
    }
  });

  // Fetch Live Render Workers Pool & Infrastructure State
  const { data: workerPoolData, refetch: refetchWorkers, isLoading: workersLoading } = useQuery({
    queryKey: ["render-workers-pool"],
    queryFn: async () => {
      const res = await fetch("/api/rendering/workers");
      if (!res.ok) throw new Error("Failed to load rendering worker pool");
      return res.json();
    },
    refetchInterval: 10000 // Poll every 10 seconds
  });

  // Hot-swap service account key mutation
  const rotateKey = useMutation({
    mutationFn: async () => {
      setRotating(true);
      setSuccess("");
      setError("");
      const res = await fetch("/api/storage/rotate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newKeyPath, deleteOld })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to rotate key");
      return data;
    },
    onSuccess: () => {
      setSuccess("Service Account key rotated successfully! Google Drive client reinitialized.");
      setNewKeyPath("");
      refetchKeys();
      setRotating(false);
    },
    onError: (err: any) => {
      setError(err.message);
      setRotating(false);
    }
  });

  // Generate One-Time BYOR Pairing Code
  const generatePairingCode = async () => {
    try {
      setError("");
      const res = await fetch("/api/render-workers/pair", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to generate pairing code");
      setPairingCode(data.pairingCode);
      setPairingExpiresAt(data.expiresAt);
      setShowPairModal(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Revoke Worker Mutation
  const revokeWorker = async (workerId: string) => {
    try {
      setError("");
      const res = await fetch(`/api/render-workers/${workerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to revoke worker");
      setSuccess(`Worker ${workerId} revoked successfully.`);
      refetchWorkers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="border-b border-zinc-900 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-50 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            OS Settings & Infrastructure Control
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Configure distributed render workers, BYOR capacity, FinOps guardrails, and credentials.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchWorkers()}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${workersLoading ? "animate-spin text-blue-400" : ""}`} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* SECTION 1: RENDERING PLANES & BYOR WORKERS */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-800 pb-4 gap-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2 uppercase tracking-wider font-mono">
              <Server className="w-4 h-4 text-emerald-400" />
              Multi-Plane Rendering Infrastructure (BYOR & Cloud)
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Connect local/VPS BYOR workers and inspect provider-neutral distributed compute capacity.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generatePairingCode}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
            >
              <Zap className="w-4 h-4" />
              Pair Render Worker (BYOR)
            </button>
          </div>
        </div>

        {/* Multi-Plane Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Persistent / Distributed Worker */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest font-mono">Plane 1: Distributed Compute</span>
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 font-mono">SERVER AUTHORIZED</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">Distributed Render Fabric</span>
              <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ComputeRouter
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              F06 RenderFabric routes work to qualified workers using capability, health, policy, lease, and fencing checks.
            </p>
            <div className="pt-2 border-t border-zinc-850 flex justify-between text-[11px] font-mono text-zinc-500">
              <span>Routing: policy-based</span>
              <span>Guard: ComputePolicy + F07</span>
            </div>
          </div>

          {/* GitHub Actions Basic Cloud */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest font-mono">Plane 2: Basic Cloud</span>
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 font-mono">BASIC / FREE</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">GitHub Actions Runner</span>
              <span className="inline-flex items-center gap-1 text-xs font-mono text-purple-400">
                <Radio className="w-3 h-3 text-purple-400" />
                Ephemeral Workflow
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Default cloud rendering plane for Basic users via workflow_dispatch.
            </p>
            <div className="pt-2 border-t border-zinc-850 flex justify-between text-[11px] font-mono text-zinc-500">
              <span>Quota: 5 Shorts/mo</span>
              <span>Capacity: AVAILABLE</span>
            </div>
          </div>

          {/* BYOR User Owned */}
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">Plane 3: User Owned</span>
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 font-mono">BYOR WORKER</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">User PC / VPS Renderer</span>
              <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400">
                <Monitor className="w-3 h-3" />
                Outbound TLS
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Connect your own Windows/Linux desktop or VPS as a high-performance FFmpeg worker.
            </p>
            <div className="pt-2 border-t border-zinc-850 flex justify-between text-[11px] font-mono text-zinc-500">
              <span>Cost: N/A (User Compute)</span>
              <span>NAT / Router Compatible</span>
            </div>
          </div>
        </div>

        {/* Live Registered Workers Table */}
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            Registered Worker Pool & Live Telemetry
          </h3>

          <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950/40">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="p-3">Worker ID / Name</th>
                  <th className="p-3">Vendor / Tier</th>
                  <th className="p-3">State</th>
                  <th className="p-3">CPU / RAM</th>
                  <th className="p-3">FFmpeg / Arch</th>
                  <th className="p-3">Last Heartbeat</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850 text-zinc-300">
                {workerPoolData?.workers?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-zinc-500 text-xs">
                      No active render workers registered. Click "Pair Render Worker" to add a BYOR worker.
                    </td>
                  </tr>
                ) : (
                  workerPoolData?.workers?.map((w: any) => (
                    <tr key={w.workerId} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-zinc-200">{w.name}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{w.workerId}</div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 border border-zinc-800 uppercase text-zinc-300">
                          {w.vendor || "custom"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          w.status === "READY" ? "bg-emerald-500/20 text-emerald-400" :
                          w.status === "BUSY" ? "bg-amber-500/20 text-amber-400" :
                          "bg-zinc-800 text-zinc-400"
                        }`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-400">
                        {w.vCPU || 4} vCPU / {w.memoryMb ? `${Math.round(w.memoryMb / 1024)}GB` : "8GB"}
                      </td>
                      <td className="p-3 text-zinc-400">
                        {w.ffmpegVersion || "FFmpeg 6.1"} ({w.architecture || "x86_64"})
                      </td>
                      <td className="p-3 text-zinc-500 text-[10px]">
                        {w.lastHeartbeat ? new Date(w.lastHeartbeat).toLocaleTimeString() : "Just now"}
                      </td>
                      <td className="p-3 text-right">
                        {w.vendor === "byor" && (
                          <button
                            onClick={() => revokeWorker(w.workerId)}
                            className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-bold transition-all"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Worker CLI Package Download Cards */}
        <div className="pt-2 border-t border-zinc-800 space-y-3">
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-400" />
            Download ShortForge Render Worker Agent Packages
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-200">
                  <Terminal className="w-4 h-4 text-blue-400" />
                  Windows x64 Worker CLI
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 font-mono">shortforge-worker-v1.0-win-x64.zip</p>
              </div>
              <a
                href="/downloads/shortforge-worker-windows-x64.zip"
                download
                className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" /> Download Windows Package
              </a>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-200">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  Linux x64 Worker CLI
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 font-mono">shortforge-worker-v1.0-linux-x64.tar.gz</p>
              </div>
              <a
                href="/downloads/shortforge-worker-linux-x64.tar.gz"
                download
                className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" /> Download Linux Package
              </a>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col justify-between opacity-60">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-400">
                  <Terminal className="w-4 h-4 text-zinc-500" />
                  macOS Worker CLI
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 font-mono">macOS Apple Silicon / Intel</p>
              </div>
              <button disabled className="w-full py-2 bg-zinc-900 border border-zinc-850 text-zinc-500 text-xs font-bold rounded-lg cursor-not-allowed">
                COMING SOON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: SERVICE ACCOUNT & STORAGE RETENTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Key Rotation */}
        <div className="lg:col-span-7 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3 font-mono">
            <Key className="w-4 h-4 text-blue-400" />
            Service Account Key Rotation
          </h3>

          <div className="space-y-4">
            <div className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-4 space-y-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Active Key File</span>
              {keysLoading ? (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <div className="space-y-1.5 font-mono text-xs text-zinc-400">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Path:</span>
                    <span className="text-zinc-300 select-all">{keyData?.currentKey?.path ?? "None"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Client Email:</span>
                    <span className="text-zinc-300">{keyData?.currentKey?.clientEmail ?? "None"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Project ID:</span>
                    <span className="text-zinc-300">{keyData?.currentKey?.projectId ?? "None"}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">Rotate to New Credentials</span>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">New Key File Path</label>
                <input
                  type="text"
                  placeholder="e.g. credentials/service-account-new.json"
                  value={newKeyPath}
                  onChange={(e) => setNewKeyPath(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="deleteOld"
                  checked={deleteOld}
                  onChange={(e) => setDeleteOld(e.target.checked)}
                  className="rounded border-zinc-850 bg-zinc-950 focus:ring-blue-500"
                />
                <label htmlFor="deleteOld" className="text-xs text-zinc-400 font-medium">
                  Delete old key file upon successful rotation
                </label>
              </div>

              <button
                onClick={() => rotateKey.mutate()}
                disabled={rotating || !newKeyPath}
                className="w-full bg-blue-500 hover:bg-blue-600 text-zinc-950 font-bold text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {rotating ? "Rotating Key..." : "Rotate Credentials (Hot Swap)"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Retention Policies */}
        <div className="lg:col-span-5 space-y-6">

          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest flex items-center gap-2 border-b border-zinc-800 pb-3 font-mono">
              <Clock className="w-4 h-4 text-blue-400" />
              B2 Render Storage Retention Policies
            </h3>

            <div className="space-y-3">
              {[
                { id: "quiz", name: "Quiz Engine Renders", hours: 0.5 },
                { id: "news", name: "News Engine Renders", hours: 0.5 },
                { id: "story", name: "Story Engine Renders", hours: 0.5 },
                { id: "permanent", name: "Permanent Assets (B2 permanent/)", hours: 0 },
              ].map((policy) => (
                <div key={policy.id} className="bg-zinc-950/20 border border-zinc-800/40 rounded-lg p-3 flex justify-between items-center text-xs font-mono">
                  <div>
                    <span className="font-bold text-zinc-300 capitalize">{policy.name}</span>
                    <span className="text-[9px] text-zinc-500 block font-mono">bucketId: {policy.id}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400">
                    {policy.hours === 0 ? "Never Delete (~7GB Budget)" : "30-Min Server TTL"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ONE-TIME BYOR PAIRING MODAL */}
      {showPairModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex justify-between items-start border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2 font-mono">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Pair Render Worker Agent (BYOR)
                </h3>
                <p className="text-xs text-zinc-400 mt-1">Single-use 10-minute pairing code bound to your tenant ID.</p>
              </div>
              <button
                onClick={() => setShowPairModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="bg-zinc-950/80 border border-emerald-500/30 rounded-xl p-5 text-center space-y-3">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">One-Time Pairing Code</span>
              <div className="text-2xl font-black font-mono tracking-widest text-emerald-300 select-all bg-zinc-900 py-3 rounded-lg border border-zinc-800">
                {pairingCode || "FOS-7K29-XP41"}
              </div>
              <button
                onClick={() => copyToClipboard(pairingCode || "FOS-7K29-XP41")}
                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors font-mono"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                {copiedCode ? "Copied to Clipboard!" : "Copy Code"}
              </button>
            </div>

            <div className="space-y-2 text-xs text-zinc-400 font-mono">
              <div className="font-bold text-zinc-300">Instructions:</div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-400">
                <li>Start <code className="text-emerald-400">factoryos-render-worker</code> on your PC/VPS.</li>
                <li>Enter pairing code <code className="text-emerald-400">{pairingCode}</code> when prompted.</li>
                <li>Worker receives revocable token and registers <code className="text-emerald-400">READY</code>.</li>
              </ol>
            </div>

            <button
              onClick={() => setShowPairModal(false)}
              className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-xl transition-colors font-mono"
            >
              Done / Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
