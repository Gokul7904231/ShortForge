"use client";

import React, { useState, useEffect } from "react";
import { 
  Video, CheckCircle2, Clock, 
  Film, ArrowUpFromLine, RefreshCw,
  AlertCircle, ChevronRight, HardDrive,
  Download, HelpCircle, Lightbulb, Play
} from "lucide-react";
import BrandIcon from "@/components/BrandIcon";
import Link from "next/link";
import { useFactoryStore } from "@/lib/factory-store";
import { useOSStore } from "@/lib/os-store";
import { projectCreatorJobStatus } from "@/lib/presentation/JobStatusProjection";

interface BasicUserDashboardProps {
  userRole: string;
  userEmail?: string;
}

export default function BasicUserDashboard({ userRole, userEmail }: BasicUserDashboardProps) {
  const { jobs, fetchState, isLoading, queues } = useFactoryStore();
  const toggleQuickGenerate = useOSStore((state) => state.toggleQuickGenerate);

  const [activeTab, setActiveTab] = useState<"all" | "completed" | "processing">("all");
  const [quota, setQuota] = useState<{
    limit: number;
    completed: number;
    reserved: number;
    totalUsed: number;
    remaining: number;
    isExceeded: boolean;
  } | null>(null);

  const isViewer = userRole === "VIEWER";

  const fetchQuota = async () => {
    try {
      const res = await fetch("/api/user/quota");
      const data = await res.json();
      if (data?.success && data.quota) {
        setQuota(data.quota);
      }
    } catch {}
  };

  useEffect(() => {
    fetchState();
    fetchQuota();
  }, [fetchState]);

  const activeJobs = jobs.filter((j) => (j.status as string) === "running" || (j.status as string) === "processing" || (j.status as string) === "queued");
  const completedJobs = jobs.filter((j) => (j.status as string) === "completed" || (j.status as string) === "rendered");
  const failedJobs = jobs.filter((j) => (j.status as string) === "failed");

  const filteredJobs = jobs.filter((job) => {
    if (activeTab === "completed") return (job.status as string) === "completed" || (job.status as string) === "rendered";
    if (activeTab === "processing") return (job.status as string) === "running" || (job.status as string) === "processing" || (job.status as string) === "queued";
    return true;
  });

  const activeOutboxCount = (queues?.storageQueue?.length ?? 0) + (queues?.publisherQueue?.length ?? 0);
  const isQuotaReached = quota ? quota.totalUsed >= quota.limit : completedJobs.length >= 5;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 select-none font-sans text-[#111827] dark:text-[#F5F7FA]">
      
      {/* 1. ⚡ Server-Authoritative Quota Bar with No-Dead-End Recovery */}
      <div className="bg-white dark:bg-[#0A1220] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1]">
              Video Generation Quota
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${isQuotaReached ? "bg-[#FF5A67]/10 text-[#FF5A67] border border-[#FF5A67]/20" : "bg-[#19C37D]/10 text-[#19C37D] border border-[#19C37D]/20"}`}>
              {isQuotaReached ? "● QUOTA EXHAUSTED" : "● ACTIVE PLAN"}
            </span>
          </div>
          <div className="text-xs font-mono font-bold text-[#111827] dark:text-[#F5F7FA]">
            {quota ? `${quota.completed} / ${quota.limit} Videos Rendered` : `${completedJobs.length} / 5 Videos Rendered`}
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-black/[0.04] dark:bg-[#070D18] h-3 rounded-full overflow-hidden p-0.5 border border-black/[0.04] dark:border-white/[0.04]">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              isQuotaReached 
                ? "bg-[#FF5A67]" 
                : (quota?.totalUsed ?? completedJobs.length) >= 4 
                  ? "bg-[#F5B942]" 
                  : "bg-[#1677FF]"
            }`}
            style={{ width: `${Math.min(100, (((quota?.totalUsed ?? completedJobs.length) / 5) * 100))}%` }}
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[#667085] dark:text-[#A8B2C1] font-mono gap-2 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
          <span>Tier: <strong>Basic Free Creator (5 Videos Limit)</strong></span>
          <div className="flex items-center gap-3">
            {isQuotaReached ? (
              <span className="text-[#FF5A67] font-semibold">
                All 5 slots used.
              </span>
            ) : (
              <span>Remaining: <strong>{quota ? `${quota.remaining} slots` : `${Math.max(0, 5 - completedJobs.length)} slots`}</strong></span>
            )}
            <Link
              href="/pricing"
              className="px-2.5 py-1 rounded-lg bg-[#1677FF] hover:bg-[#0F63D8] text-white font-bold text-[10px] transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <BrandIcon className="w-3 h-3" variant="white" />
              <span>{isQuotaReached ? "Upgrade to Pro" : "View Plans"}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 3. 📊 Production Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[
          { 
            label: "Total Projects", 
            value: jobs.length, 
            sub: "Personal pipeline jobs", 
            icon: Film, 
            color: "text-[#111827] dark:text-[#F5F7FA]", 
            bg: "bg-white dark:bg-[#0A1220]" 
          },
          { 
            label: "Active Generations", 
            value: activeJobs.length, 
            sub: activeJobs.length > 0 ? "Rendering in progress" : "No active jobs", 
            icon: Clock, 
            color: activeJobs.length > 0 ? "text-[#1677FF] animate-pulse" : "text-[#667085]", 
            bg: "bg-white dark:bg-[#0A1220]" 
          },
          { 
            label: "Renders Completed", 
            value: completedJobs.length, 
            sub: "Ready for delivery", 
            icon: CheckCircle2, 
            color: "text-[#19C37D]", 
            bg: "bg-white dark:bg-[#0A1220]" 
          },
          { 
            label: "Google Drive Delivery", 
            value: completedJobs.filter(j => (j as any).driveUrl || (j as any).driveFileId).length, 
            sub: "Synced to cloud drive", 
            icon: HardDrive, 
            color: "text-[#1677FF]", 
            bg: "bg-white dark:bg-[#0A1220]" 
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`${stat.bg} border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-colors`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1]">{stat.label}</span>
                <div className="w-8 h-8 rounded-xl bg-black/[0.03] dark:bg-[#0E1728] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <div>
                <span className={`text-3xl sm:text-4xl font-bold font-display tracking-tight block ${stat.color}`}>{stat.value}</span>
                <span className="text-[11px] text-[#667085] font-medium block mt-1">{stat.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. ⚡ Active Generations Section */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight text-[#111827] dark:text-[#F5F7FA] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#1677FF] animate-ping" />
              Active Video Generations ({activeJobs.length})
            </h2>
            <button 
              onClick={() => fetchState()} 
              className="text-xs font-medium text-[#1677FF] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh State
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeJobs.map((job) => (
              <div key={job.id} className="bg-white dark:bg-[#0A1220] border border-[#1677FF]/30 rounded-3xl p-5 shadow-xs space-y-4 relative overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#1677FF]/10 text-[#1677FF] text-[10px] font-semibold uppercase tracking-wider border border-[#1677FF]/20">
                      {(job as any).contentType || "QUIZ_SHORTS"}
                    </span>
                    <h3 className="text-sm font-bold text-[#111827] dark:text-[#F5F7FA] mt-1.5 truncate max-w-xs">{job.topic}</h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#1677FF]/10 text-[#1677FF] text-xs font-semibold flex items-center gap-1.5 border border-[#1677FF]/20">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Processing
                  </span>
                </div>

                {/* Pipeline Progress Indicator — real status only, never fake 2/3 */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-[#667085] dark:text-[#A8B2C1]">
                    <span>Stage: <strong className="text-[#111827] dark:text-[#F5F7FA]">{projectCreatorJobStatus(job.status, (job as any).stage || (job as any).detailedStatus || (job as any).currentStep).label}</strong></span>
                    <span className="font-mono">{(job as any).progress != null || (job as any).progress_percentage != null ? `${Math.round((job as any).progress ?? (job as any).progress_percentage)}%` : "In Progress"}</span>
                  </div>
                  <div className="w-full bg-black/[0.04] dark:bg-[#070D18] h-2 rounded-full overflow-hidden">
                    {((job as any).progress != null || (job as any).progress_percentage != null) ? (
                      <div className="bg-[#1677FF] h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, Math.round((job as any).progress ?? (job as any).progress_percentage)))}%` }} />
                    ) : (
                      <div className="bg-[#1677FF]/60 h-full rounded-full w-1/3 animate-pulse" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. 🎬 Recent Projects & Renders Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.08] pb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#111827] dark:text-[#F5F7FA]">My Videos</h2>
            <p className="text-xs text-[#667085] mt-0.5">Browse and download your generated video shorts</p>
          </div>

          <div className="flex items-center gap-2">
            {[
              { id: "all", label: `All (${jobs.length})` },
              { id: "completed", label: `Completed (${completedJobs.length})` },
              { id: "processing", label: `In Progress (${activeJobs.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-[#1677FF] text-white"
                    : "bg-black/[0.03] dark:bg-[#0E1728] text-[#667085] dark:text-[#A8B2C1] hover:text-[#111827] dark:hover:text-[#F5F7FA] hover:bg-black/[0.06] dark:hover:bg-[#121E32] border border-black/[0.06] dark:border-white/[0.08]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Empty State */}
        {filteredJobs.length === 0 ? (
          <div className="bg-white dark:bg-[#0A1220] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-10 sm:p-14 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-3xl bg-[#1677FF]/10 border border-[#1677FF]/20 flex items-center justify-center mx-auto text-[#1677FF]">
              <Video className="w-8 h-8" />
            </div>
            <div className="max-w-sm mx-auto space-y-1">
              <h3 className="text-lg font-bold text-[#111827] dark:text-[#F5F7FA]">No videos created yet</h3>
              <p className="text-xs text-[#667085] dark:text-[#A8B2C1]">
                Start by creating your first automated short with AI topic brief and instant video rendering.
              </p>
            </div>
            {!isViewer && (
              <button
                onClick={toggleQuickGenerate}
                className="px-6 py-2.5 rounded-2xl bg-[#1677FF] hover:bg-[#0F63D8] text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2 shadow-xs"
              >
                <BrandIcon className="w-4 h-4" variant="white" />
                <span>Create Video</span>
              </button>
            )}
          </div>
        ) : (
          /* Projects Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredJobs.map((job) => {
              const isCompleted = (job.status as string) === "completed" || (job.status as string) === "rendered";
              const isFailed = (job.status as string) === "failed";
              const driveUrl = (job as any).driveUrl;
              const projection = projectCreatorJobStatus(job.status, (job as any).stage || (job as any).detailedStatus || (job as any).currentStep);

              return (
                <div key={job.id} className="bg-white dark:bg-[#0A1220] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-md bg-black/[0.03] dark:bg-[#0E1728] border border-black/[0.06] dark:border-white/[0.08] text-[#667085] dark:text-[#A8B2C1] text-[10px] font-semibold uppercase tracking-wider">
                        {(job as any).contentType || "QUIZ_SHORTS"}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${projection.badgeClass}`}>
                        {projection.isInProgress && <RefreshCw className="w-3 h-3 animate-spin" />}
                        {projection.isError && <AlertCircle className="w-3 h-3" />}
                        {projection.label === "Ready" && <CheckCircle2 className="w-3 h-3" />}
                        <span>{projection.label}</span>
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-[#111827] dark:text-[#F5F7FA] leading-snug line-clamp-2">{job.topic}</h3>
                    <p className="text-xs text-[#667085] flex items-center gap-2 font-mono">
                      <span>ID: {job.id.slice(0, 12)}...</span>
                      <span>•</span>
                      <span>{job.createdAt ? new Date(job.createdAt).toLocaleDateString() : "Recent"}</span>
                    </p>
                  </div>

                  <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between text-xs">
                    <span className="text-[#667085] font-medium text-[11px] font-mono">
                      {(job as any).renderProfile || "FAST_QUIZ"}
                    </span>
                    <div className="flex items-center gap-2">
                      {driveUrl && (
                        <a
                          href={driveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-xl bg-[#19C37D]/10 text-[#19C37D] hover:bg-[#19C37D]/20 font-bold text-[11px] transition-colors inline-flex items-center gap-1"
                        >
                          <HardDrive className="w-3 h-3" />
                          <span>Drive</span>
                        </a>
                      )}
                      {isCompleted && !driveUrl && (
                        <a
                          href={`/api/download/${job.id}`}
                          download
                          className="px-2.5 py-1 rounded-xl bg-[#1677FF]/10 text-[#1677FF] hover:bg-[#1677FF]/20 font-semibold text-[11px] transition-colors inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>MP4</span>
                        </a>
                      )}
                      <Link
                        href={`/media/library`}
                        className="text-[#667085] hover:text-[#111827] dark:hover:text-[#F5F7FA] font-medium hover:underline flex items-center gap-0.5 text-[11px]"
                      >
                        <span>Library</span>
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
