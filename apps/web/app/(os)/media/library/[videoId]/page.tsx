"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Film,
  Play,
  HardDrive,
  Clock,
  ShieldCheck,
  Calendar,
  Layers,
  FileText,
  ChevronLeft,
  RefreshCw,
  ExternalLink,
  Download,
} from "lucide-react";
import Link from "next/link";
import { describeDelivery } from "@/lib/presentation/JobStatusProjection";

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params?.videoId as string;

  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!videoId) return;

    async function loadDetail() {
      setLoading(true);
      try {
        const res = await fetch(`/api/library/${videoId}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setVideo(data.video);
        } else {
          setError(data.error || "Video not found.");
        }
      } catch (err: any) {
        setError(err.message || "Failed to load video.");
      } finally {
        setLoading(false);
      }
    }
    loadDetail();
  }, [videoId]);

  if (loading) {
    return (
      <div className="py-24 text-center text-[#667085] text-xs flex flex-col items-center gap-2">
        <RefreshCw className="w-6 h-6 animate-spin text-[#1677FF]" />
        <span>Loading video inspection...</span>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-4">
        <Link href="/media/library" className="text-xs font-bold text-[#1677FF] flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Library
        </Link>
        <div className="p-6 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
          {error || "Video could not be located."}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Back Button */}
      <Link href="/media/library" className="text-xs font-bold text-[#1677FF] hover:underline flex items-center gap-1">
        <ChevronLeft className="w-4 h-4" /> Back to Media Library
      </Link>

      {(() => {
        const delivery = describeDelivery({
          status: video.status,
          deliveryMethod: video.deliveryMethod,
          verified: video.deliveryVerified,
          deliveryStatus: video.deliveryStatus,
          driveFileId: video.driveFileId,
          driveUrl: video.driveUrl,
        });
        const guardian = video.verificationSummary;

        return (
          <>

      {/* Main Grid: Video Player + Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Video Preview */}
        <div className="lg:col-span-1 space-y-4">
          <div className="aspect-[9/16] rounded-3xl bg-black overflow-hidden border border-black/[0.08] dark:border-white/[0.08] relative shadow-lg">
            <video
              src={video.videoUrl}
              controls
              playsInline
              className="w-full h-full object-contain"
            />
          </div>

          {video.driveUrl && (
            <a
              href={video.driveUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full py-3 rounded-2xl bg-[#19C37D] hover:bg-[#15A86B] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <HardDrive className="w-4 h-4" /> Open in Google Drive
            </a>
          )}
        </div>

        {/* Right Column: Deep Metadata & Verification */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="bg-white dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-6 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono uppercase font-bold bg-[#1677FF]/10 text-[#1677FF]">
                {video.engineId} ({video.engineMode})
              </span>
              {video.isScheduled && (
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold bg-purple-500/10 text-purple-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Scheduled Automation
                </span>
              )}
            </div>

            <h1 className="text-lg font-bold text-[#111827] dark:text-[#F5F7FA]">{video.title}</h1>
            <p className="text-xs text-[#667085] dark:text-[#A8B2C1]">
              Created on {new Date(video.createdAt).toLocaleString()}
            </p>
          </div>

          {/* Delivery Truth */}
          <div className="bg-white dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-6 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1] flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#1677FF]" /> Delivery
            </h3>
            <p className="text-xs font-bold text-[#111827] dark:text-[#F5F7FA]">{delivery.label}</p>
            <p className="text-[11px] text-[#667085] dark:text-[#A8B2C1]">{delivery.detail}</p>
            {delivery.linkUrl && (
              <a href={delivery.linkUrl} target="_blank" rel="noreferrer" className="inline-flex text-[11px] font-bold text-[#19C37D] hover:underline">
                Open the delivered Drive file
              </a>
            )}
          </div>

          {/* Technical Specs */}
          <div className="bg-white dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1677FF]" /> Production Specifications
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04]">
                <span className="text-[10px] text-[#667085] block uppercase">Duration</span>
                <span className="font-bold text-[#111827] dark:text-[#F5F7FA] font-mono">
                  {video.durationSeconds != null ? `${video.durationSeconds}s` : "Not recorded"}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04]">
                <span className="text-[10px] text-[#667085] block uppercase">Resolution</span>
                <span className="font-bold text-[#111827] dark:text-[#F5F7FA] font-mono">{video.resolution ?? "Not recorded"}</span>
              </div>
              <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04]">
                <span className="text-[10px] text-[#667085] block uppercase">Framerate</span>
                <span className="font-bold text-[#111827] dark:text-[#F5F7FA] font-mono">
                  {video.fps != null ? `${video.fps} FPS` : "Not recorded"}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04]">
                <span className="text-[10px] text-[#667085] block uppercase">File Size</span>
                <span className="font-bold text-[#111827] dark:text-[#F5F7FA] font-mono">
                  {video.sizeMb != null ? `${video.sizeMb} MB` : "Not recorded"}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04] text-xs font-mono text-[#667085] space-y-1">
              <div>Job ID: <span className="text-[#111827] dark:text-[#F5F7FA] font-semibold">{video.jobId}</span></div>
              {video.driveFileId && <div>Drive File ID: <span className="text-[#19C37D] font-semibold">{video.driveFileId}</span></div>}
            </div>
          </div>

          {/* AI Guardian & Verification Summary */}
          <div className="bg-white dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.08] rounded-3xl p-6 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#19C37D]" /> AI Quality & Verification Report
            </h3>

            <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.04] dark:border-white/[0.04] text-xs flex items-center justify-between">
              {guardian ? (
                <>
                  <div className="space-y-1">
                    <span className={`font-bold block ${guardian.guardianPassed ? "text-[#19C37D]" : "text-red-500"}`}>
                      Quiz Guardian Status: {guardian.guardianPassed ? "PASSED" : "FAILED"}
                    </span>
                    <span className="text-[11px] text-[#667085] dark:text-[#A8B2C1]">
                      Grounding Score: {Math.round((guardian.groundingScore ?? 0) * 100)}%
                      {guardian.totalQuestions ? ` (${guardian.verifiedQuestions}/${guardian.totalQuestions} questions verified)` : ""}
                    </span>
                  </div>
                  <span className={`text-sm font-bold font-mono ${guardian.guardianPassed ? "text-[#19C37D]" : "text-red-500"}`}>
                    {guardian.guardianPassed ? "PASS" : "FAIL"}
                  </span>
                </>
              ) : (
                <div className="space-y-1">
                  <span className="font-bold block text-[#667085] dark:text-[#A8B2C1]">Verification not recorded</span>
                  <span className="text-[11px] text-[#667085] dark:text-[#A8B2C1]">
                    This video has no F07 verification summary, so no quality result is claimed.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
          </>
        );
      })()}
    </div>
  );
}
