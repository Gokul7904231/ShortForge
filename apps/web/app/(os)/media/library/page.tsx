"use client";

import React, { useState, useEffect } from "react";
import {
  Film,
  Play,
  Edit3,
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

export default function MediaLibraryPage() {
  const [items, setItems] = useState<VideoLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [engineFilter, setEngineFilter] = useState("all");

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (engineFilter !== "all") params.set("engine", engineFilter);

      const res = await fetch(`/api/library?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setItems(data.items);
      }
    } catch (err) {
      console.error("[Library Load Error]:", err);
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
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-mono font-bold">
                        Pending Upload
                      </span>
                    ) : (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-black/[0.05] text-[#667085] font-mono">
                        Local Outbox
                      </span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h3 className="text-sm font-bold text-[#111827] dark:text-[#F5F7FA] line-clamp-2">{item.title}</h3>
                  <p className="text-[11px] text-[#667085] dark:text-[#A8B2C1] mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {item.durationSeconds}s
                    </span>
                    <span>•</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
                <Link
                  href={`/media/library/${item.videoId}`}
                  className="px-3.5 py-1.5 rounded-xl bg-[#1677FF] hover:bg-[#0F63D8] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" /> Watch & Details
                </Link>

                <Link
                  href={`/factory/editor?jobId=${encodeURIComponent(item.videoId)}`}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" /> Edit
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
