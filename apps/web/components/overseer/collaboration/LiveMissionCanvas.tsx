"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Circle, Clock3, Loader2, RefreshCw, ShieldAlert, Workflow } from "lucide-react";
import type { MissionWorkBoardSnapshot, WorkTaskCard } from "@/factoryos/core/work/MissionWorkManager";
import { AdaptivePresentation } from "./AdaptivePresentation";

interface LiveMissionCanvasProps {
  missionId: string;
}

const stateStyles: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  TODO: { label: "Queued", className: "border-slate-400/20 bg-slate-400/5 text-slate-500", icon: <Circle className="h-3.5 w-3.5" /> },
  READY: { label: "Ready", className: "border-sky-500/20 bg-sky-500/5 text-sky-600", icon: <Circle className="h-3.5 w-3.5" /> },
  RUNNING: { label: "Running", className: "border-blue-500/25 bg-blue-500/10 text-blue-600", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  BLOCKED: { label: "Blocked", className: "border-amber-500/25 bg-amber-500/10 text-amber-600", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  REVIEW: { label: "Review", className: "border-violet-500/25 bg-violet-500/10 text-violet-600", icon: <Clock3 className="h-3.5 w-3.5" /> },
  DONE: { label: "Completed", className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  FAILED: { label: "Failed", className: "border-rose-500/25 bg-rose-500/10 text-rose-600", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  ARCHIVED: { label: "Archived", className: "border-slate-400/20 bg-slate-400/5 text-slate-500", icon: <Circle className="h-3.5 w-3.5" /> },
};

function TaskCard({ task }: { task: WorkTaskCard }) {
  const state = stateStyles[task.resolvedWorkState] || stateStyles.TODO;
  return (
    <article className="min-w-0 rounded-xl border border-black/[0.08] bg-white p-3 dark:border-white/[0.09] dark:bg-[#0A1220]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-xs font-semibold text-[#111827] dark:text-[#F5F7FA]">{task.name || task.taskId}</div>
          <div className="mt-1 break-all text-[9px] font-mono text-[#667085]">{task.taskId}</div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold ${state.className}`}>
          {state.icon}{state.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1 text-[10px] text-[#667085] sm:grid-cols-2">
        <div>Agent: <span className="font-medium text-[#344054] dark:text-[#D0D5DD]">{task.ownerAgent || "Unassigned"}</span></div>
        <div>Capability: <span className="font-mono text-[#344054] dark:text-[#D0D5DD]">{task.capabilityRequired || "—"}</span></div>
      </div>
      {task.dependencies?.length > 0 && (
        <div className="mt-2 border-t border-black/[0.05] pt-2 dark:border-white/[0.07]">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-[#667085]">Dependencies</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {task.dependencies.map((dep) => (
              <span key={dep.taskId} className={`rounded-md px-1.5 py-1 text-[9px] font-mono ${dep.satisfied ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                {dep.taskId} · {dep.state}
              </span>
            ))}
          </div>
        </div>
      )}
      {task.blockedReason && <p className="mt-2 rounded-lg bg-amber-500/5 p-2 text-[10px] text-amber-700 dark:text-amber-300">Blocked: {task.blockedReason}</p>}
      {task.error && <p className="mt-2 rounded-lg bg-rose-500/5 p-2 text-[10px] text-rose-600">Latest error: {task.error}</p>}
      {(task.outputArtifactId || task.evidenceId) && (
        <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-mono text-[#667085]">
          {task.outputArtifactId && <span>artifact: {task.outputArtifactId}</span>}
          {task.evidenceId && <span>evidence: {task.evidenceId}</span>}
        </div>
      )}
    </article>
  );
}

function missionWorkErrorMessage(status: number): string {
  if (status === 401) return "Your session may have expired. Sign in and try again.";
  if (status === 403) return "You do not have permission to view this mission work board.";
  if (status === 404) return "This mission could not be found.";
  return "Mission work state could not be refreshed. Retry shortly.";
}

export function LiveMissionCanvas({ missionId }: LiveMissionCanvasProps) {
  const [board, setBoard] = useState<MissionWorkBoardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const requestInFlightRef = useRef(false);
  const requestTokenRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!missionId || requestInFlightRef.current) return;

    const requestToken = ++requestTokenRef.current;
    const controller = new AbortController();
    activeRequestRef.current = controller;
    requestInFlightRef.current = true;
    setRefreshing(true);
    if (!quiet) setLoading(true);

    try {
      const response = await fetch(
        `/api/overseer/missions/${encodeURIComponent(missionId)}/work`,
        { cache: "no-store", signal: controller.signal },
      );
      let payload: { success?: boolean; data?: MissionWorkBoardSnapshot } | null = null;
      try {
        payload = await response.json();
      } catch {
        throw new Error(missionWorkErrorMessage(response.status));
      }

      if (!response.ok || !payload?.success || !payload?.data) {
        throw new Error(missionWorkErrorMessage(response.status));
      }
      if (controller.signal.aborted || requestToken !== requestTokenRef.current) return;

      setBoard(payload.data);
      setLastUpdatedAt(new Date().toISOString());
      setError("");
    } catch (cause) {
      if (controller.signal.aborted || requestToken !== requestTokenRef.current) return;
      setError(cause instanceof Error ? cause.message : "Mission work state could not be refreshed. Retry shortly.");
    } finally {
      if (requestToken === requestTokenRef.current) {
        requestInFlightRef.current = false;
        activeRequestRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [missionId]);

  useEffect(() => {
    void refresh(false);
    const interval = window.setInterval(() => void refresh(true), 4000);
    return () => {
      window.clearInterval(interval);
      requestTokenRef.current += 1;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      requestInFlightRef.current = false;
    };
  }, [refresh]);

  if (loading && !board) {
    return <div className="flex items-center justify-center gap-2 p-12 text-sm text-[#667085]"><Loader2 className="h-4 w-4 animate-spin" /> Loading authoritative mission work state…</div>;
  }

  if (!board && error) {
    return <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-600"><div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" /> Mission state unavailable</div><p className="mt-2">{error}</p><button type="button" onClick={() => void refresh(false)} className="mt-3 rounded-lg border border-rose-500/20 px-3 py-1.5 text-xs font-semibold">Retry</button></div>;
  }

  const tasks = board?.tasks || [];
  const counts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.resolvedWorkState] = (acc[task.resolvedWorkState] || 0) + 1;
    return acc;
  }, {});
  const recentActivity = (board?.recentActivity || []).slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-black/[0.07] bg-black/[0.015] p-3 dark:border-white/[0.08] dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-[#111827] dark:text-[#F5F7FA]"><Workflow className="h-4 w-4 text-[#1769E8]" />{board?.goal || "Mission work"}</div>
          <div className="mt-1 break-all text-[9px] font-mono text-[#667085]">Mission {missionId} · Status {board?.missionStatus || "UNKNOWN"}</div>
          <div className="mt-1 text-[10px] text-[#667085]">{lastUpdatedAt ? `Last refreshed ${new Date(lastUpdatedAt).toLocaleTimeString()}` : "Waiting for first snapshot"} · refreshes every 4 seconds</div>
        </div>
        <button type="button" onClick={() => void refresh(false)} disabled={refreshing} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-black/[0.08] px-3 py-2 text-[10px] font-semibold text-[#344054] disabled:opacity-50 dark:border-white/[0.1] dark:text-[#D0D5DD]">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh now
        </button>
      </div>

      {error && <div role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-700 dark:text-amber-300">Latest refresh failed; showing the last successful snapshot. {error}</div>}

      <AdaptivePresentation payload={{
        kind: "metric-grid",
        title: "Task state at a glance",
        items: [
          { label: "Total tasks", value: tasks.length },
          { label: "Running", value: counts.RUNNING || 0 },
          { label: "Blocked / failed", value: (counts.BLOCKED || 0) + (counts.FAILED || 0) },
          { label: "Completed", value: counts.DONE || 0 },
        ],
      }} />

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/[0.1] p-8 text-center dark:border-white/[0.1]">
          <Workflow className="mx-auto h-7 w-7 text-[#667085]" />
          <p className="mt-2 text-xs font-semibold text-[#111827] dark:text-[#F5F7FA]">No work tasks are recorded for this mission yet.</p>
          <p className="mt-1 text-[10px] text-[#667085]">This view shows the authoritative work board; it will update when tasks are created.</p>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#667085]"><Workflow className="h-3.5 w-3.5" /> Recorded task graph · dependency links are shown on each task</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{tasks.map((task) => <TaskCard key={task.taskId} task={task} />)}</div>
        </div>
      )}

      <section className="rounded-xl border border-black/[0.07] p-3 dark:border-white/[0.08]">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-[#111827] dark:text-[#F5F7FA]"><Activity className="h-4 w-4 text-[#1769E8]" /> Recent recorded activity</div>
        {recentActivity.length === 0 ? (
          <p className="text-[10px] text-[#667085]">No task events have been recorded for this mission yet.</p>
        ) : (
          <ol className="space-y-2">
            {recentActivity.map((event) => (
              <li key={event.eventId} className="flex gap-3 border-l-2 border-[#1769E8]/20 pl-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold text-[#344054] dark:text-[#D0D5DD]">{event.summary || event.type}</div>
                  <div className="mt-0.5 break-all text-[9px] font-mono text-[#667085]">{event.taskId} · {event.actorId}</div>
                </div>
                <time className="shrink-0 text-[9px] text-[#667085]" dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString()}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="text-[9px] text-[#667085]">Read-only inspection. This canvas displays persisted mission-work state and events; it does not expose hidden model reasoning or alter scheduling, authorization, leases, or release decisions.</p>
    </div>
  );
}
