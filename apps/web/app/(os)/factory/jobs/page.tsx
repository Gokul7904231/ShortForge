"use client";

import React, { useState, useEffect } from "react";
import { useFactoryStore } from "@/lib/factory-store";
import { 
  Search, RefreshCw, ChevronDown, ChevronUp, Play, 
  ExternalLink, Clock, Cpu, HardDrive, Share2, Layers, AlertCircle, CheckCircle2
} from "lucide-react";
import { projectCreatorJobStatus } from "@/lib/presentation/JobStatusProjection";

export default function JobsPage() {
  const { jobs, fetchState, isLoading, initSSE } = useFactoryStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  useEffect(() => {
    initSSE();
  }, [initSSE]);

  const toggleExpand = (jobId: string) => {
    setExpandedJobId(expandedJobId === jobId ? null : jobId);
  };

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-black/[0.08] dark:border-white/[0.08]">
        <div>
          <h2 className="text-xl font-bold text-[#111827] dark:text-[#F5F7FA] tracking-tight">Video Generation Jobs</h2>
          <p className="text-xs text-[#667085] dark:text-[#98A2B3] mt-1">Track, monitor, and view your AI-generated videos across all content engines.</p>
        </div>
        <button 
          onClick={() => fetchState()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-xs font-semibold text-[#111827] dark:text-[#F5F7FA] hover:bg-[#1769E8]/10 hover:border-[#1769E8]/30 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Status
        </button>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-150 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-emerald-500 cursor-pointer font-semibold"
          >
            <option value="all">All Jobs</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Jobs Log Table */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] uppercase font-bold text-zinc-500 select-none">
                <th className="p-4 w-6"></th>
                <th className="p-4">Job ID</th>
                <th className="p-4">Topic</th>
                <th className="p-4">Status</th>
                <th className="p-4">Created At</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-zinc-500">
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-zinc-500 font-mono">
                    No matching jobs found.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const isExpanded = expandedJobId === job.id;
                  const projection = projectCreatorJobStatus(job.status, (job as any).currentStep || (job as any).step);

                  return (
                    <React.Fragment key={job.id}>
                      <tr className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] text-xs transition-colors">
                        <td className="p-4">
                          <button onClick={() => toggleExpand(job.id)} className="text-[#667085] hover:text-[#111827] dark:hover:text-[#F5F7FA]">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="p-4 font-mono text-[10px] text-[#667085] dark:text-[#98A2B3]">{job.id.slice(0, 14)}…</td>
                        <td className="p-4 font-semibold text-[#111827] dark:text-[#F5F7FA]">{job.topic}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide inline-flex items-center gap-1.5 ${projection.badgeClass}`}>
                            {projection.label}
                          </span>
                        </td>
                        <td className="p-4 text-[#667085] dark:text-[#98A2B3]">
                          {new Date(job.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4 text-right">
                          {job.videoUrl && (
                            <a 
                              href={job.videoUrl} 
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex p-1.5 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-[#1769E8]/10 rounded border border-black/[0.08] dark:border-white/[0.08] text-[#111827] dark:text-[#F5F7FA] hover:text-[#1769E8] transition-colors"
                              title="Play Video"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </a>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-black/[0.01] dark:bg-white/[0.01]">
                          <td colSpan={6} className="p-5 border-t border-black/[0.08] dark:border-white/[0.08]">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                              {/* Left: Creation Progress */}
                              <div className="md:col-span-6 space-y-4 p-4 bg-white dark:bg-[#0A101D] border border-black/[0.08] dark:border-white/[0.08] rounded-xl shadow-2xs">
                                <div className="text-[10px] font-bold text-[#667085] dark:text-[#98A2B3] uppercase tracking-wider">Creation Progress</div>
                                <div className="flex flex-wrap items-center gap-2 text-xs select-none">
                                  <span className="text-emerald-500 font-medium">Writing Script</span>
                                  <span className="text-zinc-400">➔</span>
                                  <span className="text-emerald-500 font-medium">Generating Visuals</span>
                                  <span className="text-zinc-400">➔</span>
                                  <span className="text-emerald-500 font-medium">Synthesizing Voice</span>
                                  <span className="text-zinc-400">➔</span>
                                  <span className={job.status === "completed" ? "text-emerald-500 font-semibold" : job.status === "failed" ? "text-rose-500 font-semibold" : "text-blue-500 animate-pulse font-semibold"}>
                                    {job.status === "completed" ? "Rendering Complete" : job.status === "failed" ? "Needs Attention" : "Rendering Video"}
                                  </span>
                                </div>

                                <div className="text-[10px] font-bold text-[#667085] dark:text-[#98A2B3] uppercase tracking-wider border-t border-black/[0.08] dark:border-white/[0.08] pt-3 mt-3">Generation Details</div>
                                <div className="text-xs space-y-1 text-[#667085] dark:text-[#98A2B3]">
                                  <div>Topic: <span className="text-[#111827] dark:text-[#F5F7FA] font-medium">{job.topic}</span></div>
                                  <div>Current Stage: <span className="text-[#111827] dark:text-[#F5F7FA] font-medium">{projection.label}</span></div>
                                </div>
                              </div>

                              {/* Right: Output Details */}
                              <div className="md:col-span-6 p-4 bg-white dark:bg-[#0A101D] border border-black/[0.08] dark:border-white/[0.08] rounded-xl shadow-2xs">
                                <div className="text-[10px] font-bold text-[#667085] dark:text-[#98A2B3] uppercase tracking-wider mb-3">Job Details</div>
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                  <div>
                                    <span className="text-[#667085] dark:text-[#98A2B3] block text-[9px] uppercase font-semibold">Render Duration</span>
                                    <span className="text-[#111827] dark:text-[#F5F7FA] font-medium">{job.renderDurationSeconds ? `${job.renderDurationSeconds}s` : "—"}</span>
                                  </div>
                                  <div>
                                    <span className="text-[#667085] dark:text-[#98A2B3] block text-[9px] uppercase font-semibold">Created</span>
                                    <span className="text-[#111827] dark:text-[#F5F7FA] font-medium">{new Date(job.createdAt).toLocaleTimeString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-[#667085] dark:text-[#98A2B3] block text-[9px] uppercase font-semibold">Job ID</span>
                                    <span className="text-[#111827] dark:text-[#F5F7FA] font-mono text-[10px]">{job.id}</span>
                                  </div>
                                  <div>
                                    <span className="text-[#667085] dark:text-[#98A2B3] block text-[9px] uppercase font-semibold">Video Ready</span>
                                    <span className="text-[#111827] dark:text-[#F5F7FA] font-medium">{job.videoUrl ? "Yes" : "In Progress"}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
