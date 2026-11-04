"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Film,
  Play,
  HardDrive,
  Clock,
  Search,
  Filter,
  Calendar,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { VideoLibraryItem } from "@/app/api/library/route";

interface DriveConnectionState {
  connected: boolean;
  status: string;
  googleEmail?: string;
}

function DriveDeliveryCard() {
  const [connection, setConnection] = useState<DriveConnectionState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const loadConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/drive/connection");
      const json = await res.json();
      if (res.ok && json.success) {
        setConnection(json.connection);
        setMessage(null);
      } else {
        setMessage(json.error || "Drive connection status is unavailable.");
      }
    } catch {
      setMessage("Drive connection status is unavailable.");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  const startConnect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/drive/connect");
      const json = await res.json();
      if (!res.ok || !json.authUrl) {
        setMessage(json.error || "Could not start the Google Drive connection.");
        return;
      }
      window.location.href = json.authUrl;
    } catch {
      setMessage("Could not start the Google Drive connection.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/drive/connection", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error || "Could not disconnect Google Drive.");
        return;
      }
      await loadConnection();
    } catch {
      setMessage("Could not disconnect Google Drive.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#070D18] p-5 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1] flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[#1677FF]" /> Google Drive delivery
          </h2>
          {checking ? (
            <p className="text-[11px] text-[#667085] dark:text-[#A8B2C1]">Checking your Drive connection...</p>
          ) : connection?.connected ? (
            <p className="text-[11px] text-[#667085] dark:text-[#A8B2C1]">
              Connected{connection.googleEmail ? ` as ${connection.googleEmail}` : ""}. Rendered videos are delivered here when the Drive upload succeeds.
            </p>
          ) : (
            <p className="text-[11px] text-[#667085] dark:text-[#A8B2C1]">
              Not connected. Rendered videos stay in the local delivery outbox until you connect Drive.
            </p>
          )}
        </div>

        {!checking && connection && (
          connection.connected ? (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy ? "Disconnecting..." : "Disconnect Drive"}
            </button>
          ) : (
            <button
              type="button"
              onClick={startConnect}
              disabled={busy}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-[#1677FF] hover:bg-[#0F63D8] text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy ? "Opening Google..." : "Connect Google Drive (Pro)"}
            </button>
          )
        )}
      </div>
      <p aria-live="polite" className="text-[11px] text-amber-600 dark:text-amber-400">{message}</p>
    </div>
  );
}

export default function MediaLibraryPage() {  const [items, setItems] = useState<VideoLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [engineFilter, setEngineFilter] = useState("all");

  const loadLibrary = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (engineFilter !== "all") params.set("engine", engineFilter);

      const res = await fetch(`/api/library?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "The library could not be loaded.");
      }
      if (Array.isArray(data.items)) {
        setItems(data.items);
      }
    } catch (err: any) {
      console.error("[Library Load Error]:", err);
      setItems([]);
      setError(err?.message || "The library could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, [engineFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLibrary();
  };

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#111827] dark:text-[#F5F7FA] flex items-center gap-2">
            <Film className="w-5 h-5 text-[#1677FF]" /> Media Library
          </h1>
          <p className="text-xs text-[#667085] dark:text-[#A8B2C1] mt-0.5">
            Canonical ledger of generated videos, delivery statuses, and cloud assets
          </p>
        </div>

        <button
          onClick={loadLibrary}
          className="px-3.5 py-2 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-xs font-semibold text-[#111827] dark:text-[#F5F7FA] flex items-center gap-2 transition-colors self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <DriveDeliveryCard />

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-[#070D18] p-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#667085]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by video title, topic, or job ID..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.06] dark:border-white/[0.06] text-[#111827] dark:text-[#F5F7FA] focus:outline-none focus:border-[#1677FF]"
          />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[#667085]" />
          <select
            value={engineFilter}
            onChange={(e) => setEngineFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.06] dark:border-white/[0.06] text-[#111827] dark:text-[#F5F7FA] focus:outline-none focus:border-[#1677FF] cursor-pointer"
          >
            <option value="all">All Engines</option>
            <option value="quiz">Quiz Engine</option>
            <option value="facts">Facts Engine</option>
            <option value="history">History Engine</option>
            <option value="motivation">Motivation Engine</option>
          </select>
        </div>
      </div>

      {/* Library Grid */}
      {loading ? (
        <div className="py-16 text-center text-[#667085] text-xs flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-[#1677FF]" />
          <span>Loading video library...</span>
        </div>
      ) : error ? (
        <div className="py-16 px-6 text-center text-xs rounded-3xl bg-red-500/10 border border-red-500/20 space-y-3">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="font-semibold text-sm text-red-600 dark:text-red-400">Library unavailable</p>
          <p className="max-w-md mx-auto text-red-600/80 dark:text-red-400/80">{error}</p>
          <button
            onClick={loadLibrary}
            className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-300 font-bold transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-xs text-[#667085] bg-white dark:bg-[#070D18] rounded-3xl border border-black/[0.06] dark:border-white/[0.08] space-y-3">
          <Film className="w-10 h-10 text-[#667085]/40 mx-auto" />
          <p className="font-semibold text-sm text-[#111827] dark:text-[#F5F7FA]">No videos generated yet</p>
          <p className="text-[11px] max-w-sm mx-auto">
            Videos created through Create Video or scheduled automations will appear here with delivery links.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <div
              key={item.videoId}
              className="bg-white dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-5 space-y-4 hover:border-black/[0.15] dark:hover:border-white/[0.2] transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Badges Bar */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono uppercase font-bold bg-[#1677FF]/10 text-[#1677FF]">
                    {item.engineId}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {item.isScheduled && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 font-mono font-bold flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Scheduled
                      </span>
                    )}

                    {item.deliveryStatus === "DELIVERED" ? (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#19C37D]/10 text-[#19C37D] font-mono font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Google Drive
                      </span>
                    ) : item.deliveryStatus === "PENDING_UPLOAD" ? (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono font-bold">
                        Upload not confirmed
                      </span>
                    ) : item.deliveryStatus === "LOCAL_OUTBOX" ? (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[#667085] font-mono font-bold">
                        Local outbox
                      </span>
                    ) : item.deliveryStatus === "DELIVERY_FAILED" ? (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-mono font-bold">
                        Delivery failed
                      </span>
                    ) : (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[#667085] font-mono">
                        Not delivered
                      </span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h3 className="text-sm font-bold text-[#111827] dark:text-[#F5F7FA] line-clamp-2">{item.title}</h3>
                  <p className="text-[11px] text-[#667085] dark:text-[#A8B2C1] mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {item.durationSeconds != null ? `${item.durationSeconds}s` : "Duration not recorded"}
                    </span>
                    <span>•</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between gap-2">
                <Link
                  href={`/media/library/${item.videoId}`}
                  className="px-3.5 py-1.5 rounded-xl bg-[#1677FF] hover:bg-[#0F63D8] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" /> Watch & Details
                </Link>

                {item.driveUrl && (
                  <a
                    href={item.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-[#19C37D]/10 hover:bg-[#19C37D]/20 text-[#19C37D] transition-colors cursor-pointer"
                    title="Open in Google Drive"
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
