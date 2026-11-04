"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpFromLine, Cloud, CheckCircle, Clock, AlertCircle, HardDrive, RefreshCw } from "lucide-react";
import type { VideoLibraryItem } from "@/app/api/library/route";

export default function DriveSyncPage() {
  const { data, isLoading, isError, error, refetch } = useQuery<{ items: VideoLibraryItem[] }>({
    queryKey: ["drive-delivery-records"],
    queryFn: async () => {
      const res = await fetch("/api/library?limit=50");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Delivery records could not be loaded.");
      }
      return { items: json.items ?? [] };
    },
  });

  const jobs = data?.items ?? [];
  const delivered = jobs.filter((job) => job.deliveryStatus === "DELIVERED").length;
  const outbox = jobs.filter((job) => job.deliveryStatus === "LOCAL_OUTBOX").length;
  const pending = jobs.filter((job) => job.deliveryStatus === "PENDING_UPLOAD" || job.deliveryStatus === "NOT_CONFIGURED").length;
  const failed = jobs.filter((job) => job.deliveryStatus === "DELIVERY_FAILED").length;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Google Drive Sync</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Delivery state per job, read from each stored delivery receipt. A local outbox copy is not a Drive upload.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="self-start sm:self-auto px-3.5 py-2 rounded-xl border border-zinc-700 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 flex items-center gap-3">
          <Cloud className="w-5 h-5 text-emerald-400" />
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest">Delivered to Drive</div>
            <div className="text-lg font-bold text-zinc-200 mt-0.5">{delivered} jobs</div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 flex items-center gap-3">
          <HardDrive className="w-5 h-5 text-zinc-400" />
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest">Local Outbox</div>
            <div className="text-lg font-bold text-zinc-200 mt-0.5">{outbox} jobs</div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-400" />
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest">Upload Not Confirmed</div>
            <div className="text-lg font-bold text-zinc-200 mt-0.5">{pending} jobs</div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest">Delivery Failed</div>
            <div className="text-lg font-bold text-zinc-200 mt-0.5">{failed} jobs</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/40">
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-sm font-semibold text-zinc-300">Delivery Records</h2>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-xs text-zinc-500 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading delivery records...
          </div>
        ) : isError ? (
          <div className="px-5 py-10 text-xs text-red-400 space-y-2">
            <p className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error?.message || "Delivery records could not be loaded."}
            </p>
            <button type="button" onClick={() => refetch()} className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 cursor-pointer">
              Try again
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-5 py-10 text-xs text-zinc-500 space-y-1">
            <p className="text-zinc-300 font-semibold">No jobs recorded yet</p>
            <p>Completed jobs appear here once a delivery receipt has been written. An empty list is not evidence of an upload.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-zinc-400">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="text-left px-5 py-3">Video Title</th>
                  <th className="text-left px-5 py-3">File Size</th>
                  <th className="text-left px-5 py-3">Job ID</th>
                  <th className="text-left px-5 py-3">Delivery</th>
                  <th className="text-left px-5 py-3">Target</th>
                  <th className="text-left px-5 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.videoId} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                    <td className="px-5 py-3 text-zinc-300 font-medium">{job.title}</td>
                    <td className="px-5 py-3 font-mono">{job.sizeMb != null ? `${job.sizeMb} MB` : "Not recorded"}</td>
                    <td className="px-5 py-3 font-mono text-zinc-500">{job.jobId}</td>
                    <td className="px-5 py-3">
                      {job.deliveryStatus === "DELIVERED" ? (
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle className="w-3.5 h-3.5" /> Delivered to Drive
                        </span>
                      ) : job.deliveryStatus === "LOCAL_OUTBOX" ? (
                        <span className="flex items-center gap-1.5 text-zinc-400">
                          <HardDrive className="w-3.5 h-3.5" /> Local outbox only
                        </span>
                      ) : job.deliveryStatus === "DELIVERY_FAILED" ? (
                        <span className="flex items-center gap-1.5 text-red-400">
                          <AlertCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      ) : job.deliveryStatus === "PENDING_UPLOAD" ? (
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <Clock className="w-3.5 h-3.5" /> Upload not confirmed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-zinc-500">
                          <ArrowUpFromLine className="w-3.5 h-3.5" /> Not delivered
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-zinc-500">{job.deliveryTarget ?? "Not recorded"}</td>
                    <td className="px-5 py-3 text-zinc-500 font-mono">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
