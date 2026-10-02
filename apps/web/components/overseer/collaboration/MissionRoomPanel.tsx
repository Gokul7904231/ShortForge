"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  FileText,
  MessageSquare,
  Plus,
  RefreshCw,
  Reply,
  Save,
  Users,
  Workflow,
} from "lucide-react";
import type {
  MissionRoomMessage,
  MissionRoomSnapshot,
} from "@/factoryos/core/collaboration/MissionCollaborationContracts";
import type { MissionWorkBoardSnapshot } from "@/factoryos/core/work/MissionWorkManager";

type PanelView = "THREAD" | "CANVAS" | "WORK";

interface MissionRoomPanelProps {
  missionId: string | null;
  accentColor?: string;
}

function statusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "text-[#19C37D]";
    case "RUNNING":
      return "text-[#1677FF]";
    case "FAILED":
      return "text-[#FF5A67]";
    case "BLOCKED":
      return "text-[#F5B942]";
    default:
      return "text-[#A8B2C1]";
  }
}

export const MissionRoomPanel: React.FC<MissionRoomPanelProps> = ({
  missionId,
  accentColor = "#1769E8",
}) => {
  const [snapshot, setSnapshot] = useState<MissionRoomSnapshot | null>(null);
  const [workBoard, setWorkBoard] = useState<MissionWorkBoardSnapshot | null>(null);
  const [view, setView] = useState<PanelView>("THREAD");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [composer, setComposer] = useState("");
  const [replyTo, setReplyTo] = useState<MissionRoomMessage | null>(null);
  const [taskId, setTaskId] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [decisions, setDecisions] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [newDecision, setNewDecision] = useState("");
  const [newRisk, setNewRisk] = useState("");
  const [availableAgents, setAvailableAgents] = useState<Array<{
    agentId: string;
    name: string;
    role: string;
    specialization?: string;
  }>>([]);

  const room = snapshot?.room || null;
  const participants = room?.participants.filter((item) => item.active) || [];
  const humanParticipants = participants.filter((item) => item.type === "HUMAN");
  const agentParticipants = participants.filter((item) => item.type === "AGENT");
  const messages = snapshot?.messages || [];

  const mentionMatches = useMemo(() => {
    const query = mentionQuery.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!query) return [];
    return participants
      .filter((item) =>
        item.displayName.toLowerCase().replace(/[^a-z0-9_-]/g, "").includes(query)
      )
      .slice(0, 6);
  }, [mentionQuery, participants]);

  const topLevelMessages = messages.filter((item) => !item.threadId);
  const childrenByThread = useMemo(() => {
    const map = new Map<string, MissionRoomMessage[]>();
    for (const item of messages) {
      if (!item.threadId) continue;
      const current = map.get(item.threadId) || [];
      current.push(item);
      map.set(item.threadId, current);
    }
    return map;
  }, [messages]);

  async function fetchSnapshot(showSpinner = true, syncCanvas = true) {
    if (!missionId) {
      setSnapshot(null);
      return;
    }
    if (showSpinner) setLoading(true);
    try {
      setError("");
      const res = await fetch(`/api/overseer/missions/${missionId}/room`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to load mission room.");
      setSnapshot(json.data);
      if (missionId) {
        fetch(`/api/overseer/missions/${missionId}/work`, { cache: "no-store" })
          .then((workRes) => (workRes.ok ? workRes.json() : null))
          .then((workJson) => {
            if (workJson?.success) setWorkBoard(workJson.data);
          })
          .catch(() => {});
      }
      const currentCanvas = json.data?.room?.canvas;
      if (syncCanvas && currentCanvas) {
        setNotes(currentCanvas.workingNotes || "");
        setDecisions(currentCanvas.decisions || []);
        setRisks(currentCanvas.risks || []);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load mission room.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    void fetchSnapshot(true);
    fetch("/api/overseer/agents", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && Array.isArray(json.data?.agents)) {
          setAvailableAgents(json.data.agents);
        }
      })
      .catch(() => {});
  }, [missionId]);

  useEffect(() => {
    if (!room || !missionId) return;
    const interval = setInterval(() => {
      void fetchSnapshot(false, false);
    }, view === "THREAD" ? 5000 : 7000);
    return () => clearInterval(interval);
  }, [room?.roomId, missionId, view]);

  async function openRoom() {
    if (!missionId) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/overseer/missions/${missionId}/room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to open mission room.");
      await fetchSnapshot(false);
    } catch (err: any) {
      setError(err?.message || "Unable to open mission room.");
    } finally {
      setCreating(false);
    }
  }

  async function sendMessage() {
    if (!missionId || !composer.trim() || !room) return;
    setError("");
    try {
      const res = await fetch(`/api/overseer/missions/${missionId}/room/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: composer,
          threadId: replyTo?.messageId,
          taskId: taskId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to send message.");
      setComposer("");
      setReplyTo(null);
      setTaskId("");
      setMentionQuery("");
      await fetchSnapshot(false);
    } catch (err: any) {
      setError(err?.message || "Unable to send message.");
    }
  }

  async function saveCanvas() {
    if (!missionId || !room) return;
    setError("");
    try {
      const res = await fetch(`/api/overseer/missions/${missionId}/room/canvas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingNotes: notes, decisions, risks }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to save mission canvas.");
      setSnapshot((current) => current ? { ...current, room: json.data } : current);
    } catch (err: any) {
      setError(err?.message || "Unable to save mission canvas.");
    }
  }

  function addMention(displayName: string) {
    const atIndex = composer.lastIndexOf("@");
    const next = atIndex >= 0
      ? composer.slice(0, atIndex) + `@${displayName.replace(/\s+/g, "-")} `
      : composer + `@${displayName.replace(/\s+/g, "-")} `;
    setComposer(next);
    setMentionQuery("");
  }

  function addDecision() {
    if (!newDecision.trim()) return;
    setDecisions((current) => [...current, newDecision.trim()].slice(-50));
    setNewDecision("");
  }

  function addRisk() {
    if (!newRisk.trim()) return;
    setRisks((current) => [...current, newRisk.trim()].slice(-50));
    setNewRisk("");
  }

  if (!missionId) {
    return (
      <section className="w-full rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#08101B] p-5 shadow-2xs">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#111827] dark:text-[#F5F7FA]">
          <MessageSquare className="w-4 h-4" style={{ color: accentColor }} />
          Mission Collaboration
        </div>
        <p className="mt-1 text-xs text-[#667085] dark:text-[#A7B0BC]">
          Start or select an active mission to open its shared human-agent workspace.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#08101B] shadow-2xs overflow-hidden">
      <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.08]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" style={{ color: accentColor }} />
              <span className="text-sm font-bold text-[#111827] dark:text-[#F5F7FA]">
                Mission Room
              </span>
              {room && (
                <span className="px-1.5 py-0.5 rounded bg-[#19C37D]/10 border border-[#19C37D]/20 text-[9px] font-mono text-[#19C37D]">
                  SHARED
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-[#667085] dark:text-[#A8B2C1]">
              ${room?.name || "Mission collaboration workspace"} · ${snapshot?.mission?.status || "NOT OPEN"}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {room && (
              <>
                {(["THREAD", "CANVAS", "WORK"] as PanelView[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setView(item)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-colors ${view === item ? "bg-[#1769E8]/15 text-[#1769E8] border border-[#1769E8]/25" : "text-[#667085] dark:text-[#A8B2C1] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"}`}
                  >
                    {item === "THREAD" ? "Conversation" : item === "CANVAS" ? "Canvas" : "Work"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void fetchSnapshot(true)}
                  className="p-1.5 rounded-lg text-[#667085] hover:text-[#1769E8] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  aria-label="Refresh mission room"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </>
            )}
          </div>
        </div>

        {room && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider font-mono text-[#667085] mr-1">
              Participants
            </span>
            {participants.slice(0, 10).map((item) => (
              <span
                key={item.participantId}
                className="inline-flex items-center gap-1 rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] px-2 py-1 text-[10px] text-[#667085] dark:text-[#A8B2C1]"
              >
                {item.type === "HUMAN" ? <Users className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                {item.displayName}
              </span>
            ))}
            {participants.length > 10 && (
              <span className="text-[10px] text-[#667085]">+{participants.length - 10}</span>
            )}
          </div>
        )}
        {room && availableAgents.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider font-mono text-[#667085] mr-1">
              Agent roster
            </span>
            {availableAgents
              .filter((agent) => !participants.some((participant) => participant.participantId === agent.agentId))
              .slice(0, 6)
              .map((agent) => (
                <button
                  key={agent.agentId}
                  type="button"
                  title={agent.specialization || agent.role}
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/overseer/missions/${missionId}/room/participants`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          participantId: agent.agentId,
                          displayName: agent.name,
                          type: "AGENT",
                          responseMode: agent.role === "OVERSEER" || agent.role === "COGNITIVE" ? "JOINS_CONVERSATION" : "MENTION_ONLY",
                          specialization: agent.specialization,
                        }),
                      });
                      const json = await res.json();
                      if (!res.ok || !json.success) throw new Error(json.error || "Unable to add agent.");
                      await fetchSnapshot(false);
                    } catch (err: any) {
                      setError(err?.message || "Unable to add agent to room.");
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-[#1769E8]/15 bg-[#1769E8]/5 px-2 py-1 text-[9px] font-mono text-[#1769E8] hover:bg-[#1769E8]/10"
                >
                  <Plus className="w-3 h-3" />
                  {agent.name}
                </button>
              ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-xl border border-[#FF5A67]/20 bg-[#FF5A67]/5 px-3 py-2 text-[11px] text-[#FF5A67]">
          {error}
        </div>
      )}

      {!room ? (
        <div className="p-6 text-center">
          <Workflow className="mx-auto w-8 h-8 text-[#667085] mb-2" />
          <p className="text-sm font-semibold text-[#111827] dark:text-[#F5F7FA]">Open this mission as a shared workspace</p>
          <p className="mt-1 text-xs text-[#667085] dark:text-[#A8B2C1] max-w-lg mx-auto">
            The room keeps the conversation, mission canvas, participants, and task links together without changing the execution authority.
          </p>
          <button
            type="button"
            onClick={() => void openRoom()}
            disabled={creating}
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-mono font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: accentColor }}
          >
            <Plus className={`w-3.5 h-3.5 ${creating ? "animate-spin" : ""}`} />
            {creating ? "Opening…" : "Open Mission Room"}
          </button>
        </div>
      ) : view === "THREAD" ? (
        <div className="p-4">
          <div className="max-h-[360px] overflow-y-auto terminal-scroll space-y-3 pr-1">
            {topLevelMessages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.08] p-6 text-center">
                <MessageSquare className="mx-auto w-7 h-7 text-[#667085] mb-2" />
                <p className="text-xs text-[#667085] dark:text-[#A8B2C1]">No room messages yet.</p>
                <p className="mt-1 text-[10px] text-[#667085]">Start the shared mission conversation below.</p>
              </div>
            ) : (
              topLevelMessages.map((message) => (
                <div key={message.messageId} className="space-y-2">
                  <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                        {message.authorType === "HUMAN" ? <Users className="w-3 h-3 text-[#1769E8]" /> : <Bot className="w-3 h-3 text-[#19C37D]" />}
                        <span className="font-bold text-[#111827] dark:text-[#F5F7FA]">{message.authorName}</span>
                        <span className="text-[#667085]">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyTo(message)}
                        className="inline-flex items-center gap-1 text-[10px] text-[#667085] hover:text-[#1769E8]"
                      >
                        <Reply className="w-3 h-3" />
                        Reply
                      </button>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#111827] dark:text-[#F5F7FA]">
                      {message.body}
                    </p>
                    {message.taskId && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#1769E8]/15 bg-[#1769E8]/5 px-2 py-1 text-[9px] font-mono text-[#1769E8]">
                        <Workflow className="w-3 h-3" />
                        Task {message.taskId}
                      </div>
                    )}
                  </div>

                  {(childrenByThread.get(message.messageId) || []).map((reply) => (
                    <div key={reply.messageId} className="ml-6 rounded-xl border border-[#1769E8]/10 bg-[#1769E8]/[0.03] p-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                        {reply.authorType === "HUMAN" ? <Users className="w-3 h-3 text-[#1769E8]" /> : <Bot className="w-3 h-3 text-[#19C37D]" />}
                        <span className="font-bold text-[#111827] dark:text-[#F5F7FA]">{reply.authorName}</span>
                        <span className="text-[#667085]">{new Date(reply.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#111827] dark:text-[#F5F7FA]">{reply.body}</p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="mt-4 border-t border-black/[0.05] dark:border-white/[0.08] pt-3">
            {replyTo && (
              <div className="mb-2 flex items-center justify-between rounded-lg border border-[#1769E8]/15 bg-[#1769E8]/5 px-2.5 py-2 text-[10px] text-[#1769E8]">
                <span>Replying to {replyTo.authorName}: {replyTo.body.slice(0, 80)}</span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-[#667085] hover:text-[#111827]">Cancel</button>
              </div>
            )}

            <div className="flex gap-2 mb-2">
              <select
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                className="max-w-[260px] rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[10px] font-mono text-[#667085] dark:text-[#A8B2C1] outline-none"
              >
                <option value="">Link task (optional)</option>
                {(snapshot?.tasks || []).map((task: any) => (
                  <option key={String(task.taskId)} value={String(task.taskId)}>
                    {String(task.name || task.taskId)} · {String(task.status || "PENDING")}
                  </option>
                ))}
              </select>
              <span className="text-[9px] font-mono text-[#667085] self-center ml-auto">
                {humanParticipants.length} humans · {agentParticipants.length} agents
              </span>
            </div>

            <div className="relative">
              <textarea
                value={composer}
                onChange={(event) => {
                  const value = event.target.value;
                  setComposer(value);
                  const match = value.match(/@([a-zA-Z0-9_-]*)$/);
                  setMentionQuery(match ? match[1] : "");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={3}
                placeholder="Message the mission room. Use @agent-name to address a specialist."
                className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-3 py-2.5 text-xs text-[#111827] dark:text-[#F5F7FA] placeholder:text-[#667085] outline-none focus:border-[#1769E8]"
              />
              {mentionQuery && mentionMatches.length > 0 && (
                <div className="absolute left-0 right-0 bottom-full mb-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#0A1220] shadow-xl p-1.5 space-y-1">
                  {mentionMatches.map((item) => (
                    <button
                      key={item.participantId}
                      type="button"
                      onClick={() => addMention(item.displayName)}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                    >
                      {item.type === "HUMAN" ? <Users className="w-3.5 h-3.5 text-[#1769E8]" /> : <Bot className="w-3.5 h-3.5 text-[#19C37D]" />}
                      <span className="text-[11px] font-semibold text-[#111827] dark:text-[#F5F7FA]">{item.displayName}</span>
                      {item.specialization && <span className="text-[9px] text-[#667085] truncate">{item.specialization}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between">
              <span className="text-[9px] font-mono text-[#667085]">
                Mentions are recorded as collaboration events; they do not bypass governance or directly invoke tools.
              </span>
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!composer.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-mono font-bold text-white disabled:opacity-40"
                style={{ backgroundColor: accentColor }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : view === "CANVAS" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
          <div className="space-y-3">
            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#111827] dark:text-[#F5F7FA]">
                <FileText className="w-3.5 h-3.5 text-[#1769E8]" />
                Mission brief
              </div>
              <div className="mt-2 space-y-1 text-[11px]">
                <p><span className="text-[#667085]">Goal:</span> {room.canvas.goal}</p>
                <p><span className="text-[#667085]">Objective:</span> {room.canvas.objective}</p>
                <p><span className="text-[#667085]">Status:</span> {room.canvas.status}</p>
                <p><span className="text-[#667085]">Progress:</span> {room.canvas.progressPercent}%</p>
                <p><span className="text-[#667085]">Owner:</span> {room.canvas.owner}</p>
              </div>
            </div>

            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
              <div className="text-[10px] font-mono font-bold uppercase text-[#667085]">Constraints</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {room.canvas.constraints.length === 0 ? (
                  <span className="text-[10px] text-[#667085]">No explicit constraints.</span>
                ) : room.canvas.constraints.map((item) => (
                  <span key={item} className="rounded-full bg-black/[0.03] dark:bg-white/[0.04] px-2 py-1 text-[9px] font-mono text-[#667085] dark:text-[#A8B2C1]">{item}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={7}
              placeholder="Working notes shared with the mission team…"
              className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-3 py-2.5 text-xs text-[#111827] dark:text-[#F5F7FA] outline-none focus:border-[#1769E8]"
            />

            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
              <div className="text-[10px] font-mono font-bold uppercase text-[#667085]">Decisions</div>
              <div className="mt-2 space-y-1.5">
                {decisions.map((item, index) => (
                  <div key={`${item}-${index}`} className="text-[10px] text-[#111827] dark:text-[#F5F7FA]">• {item}</div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={newDecision} onChange={(e) => setNewDecision(e.target.value)} className="flex-1 rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[10px] text-[#111827] dark:text-[#F5F7FA]" placeholder="Record a decision" />
                <button type="button" onClick={addDecision} className="px-2 rounded-lg bg-[#1769E8]/10 text-[#1769E8] text-[10px]">Add</button>
              </div>
            </div>

            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
              <div className="text-[10px] font-mono font-bold uppercase text-[#667085]">Risks</div>
              <div className="mt-2 space-y-1.5">
                {risks.map((item, index) => (
                  <div key={`${item}-${index}`} className="text-[10px] text-[#111827] dark:text-[#F5F7FA]">• {item}</div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={newRisk} onChange={(e) => setNewRisk(e.target.value)} className="flex-1 rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[10px] text-[#111827] dark:text-[#F5F7FA]" placeholder="Record a risk" />
                <button type="button" onClick={addRisk} className="px-2 rounded-lg bg-[#F5B942]/10 text-[#9A6A00] text-[10px]">Add</button>
              </div>
            </div>

            <button type="button" onClick={() => void saveCanvas()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-mono font-bold text-white" style={{ backgroundColor: accentColor }}>
              <Save className="w-3.5 h-3.5" />
              Save Canvas
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-[#1769E8]" />
                <span className="text-xs font-bold text-[#111827] dark:text-[#F5F7FA]">Durable Work Board</span>
                <span className="text-[9px] font-mono text-[#667085]">
                  {workBoard?.tasks.length || snapshot?.tasks.length || 0} work items
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#667085] dark:text-[#A8B2C1]">
                Dependencies, review gates, worker ownership, leases, retries, and task history.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/overseer/missions/${missionId}/work`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "reclaim_expired" }),
                  });
                  const json = await res.json();
                  if (!res.ok || !json.success) throw new Error(json.error || "Reclaim failed.");
                  await fetchSnapshot(false);
                } catch (err: any) {
                  setError(err?.message || "Unable to reclaim expired work.");
                }
              }}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-[#F5B942]/20 bg-[#F5B942]/5 px-2.5 py-1.5 text-[9px] font-mono font-bold text-[#8A6500]"
            >
              Reclaim expired work
            </button>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="grid grid-flow-col auto-cols-[255px] gap-3 min-w-max">
              {([
                "TODO",
                "READY",
                "RUNNING",
                "BLOCKED",
                "REVIEW",
                "DONE",
                "FAILED",
                "ARCHIVED",
              ] as const).map((columnState) => {
                const columnCards = workBoard?.columns?.[columnState] || [];
                return (
                  <div key={columnState} className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02]">
                    <div className="px-3 py-2 border-b border-black/[0.05] dark:border-white/[0.08] flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#667085]">{columnState}</span>
                      <span className="text-[9px] font-mono font-bold text-[#111827] dark:text-[#F5F7FA]">{columnCards.length}</span>
                    </div>
                    <div className="p-2 space-y-2 min-h-[120px]">
                      {columnCards.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-black/[0.06] dark:border-white/[0.06] px-2 py-4 text-center text-[9px] text-[#667085]">
                          Empty
                        </div>
                      ) : (
                        columnCards.map((task: any) => {
                          const state = String(task.resolvedWorkState || task.workState || task.status || columnState);
                          const runAction = async (action: string, extra: Record<string, unknown> = {}) => {
                            try {
                              const res = await fetch(`/api/overseer/missions/${missionId}/work`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action, taskId: task.taskId, ...extra }),
                              });
                              const json = await res.json();
                              if (!res.ok || !json.success) throw new Error(json.error || "Work action failed.");
                              await fetchSnapshot(false);
                            } catch (err: any) {
                              setError(err?.message || "Work action failed.");
                            }
                          };

                          return (
                            <article key={String(task.taskId)} className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#08101B] p-2.5 shadow-2xs">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[10px] font-semibold text-[#111827] dark:text-[#F5F7FA] leading-snug">{String(task.name || task.taskId)}</div>
                                  <div className={`mt-1 text-[8px] font-mono font-bold ${statusClass(state)}`}>{state}</div>
                                </div>
                                <span className="shrink-0 rounded-full bg-black/[0.03] dark:bg-white/[0.04] px-1.5 py-1 text-[8px] font-mono text-[#667085]">
                                  {String(task.ownerAgent || "unassigned")}
                                </span>
                              </div>

                              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[8px] font-mono text-[#667085]">
                                <span>Lane: {String(task.workerLane || task.capabilityRequired || "—")}</span>
                                <span>Circuit: {String(task.circuitState || "CLOSED")}</span>
                                <span>Retry: {String(task.retryCount ?? 0)}/{String(task.maxRetries ?? 0)}</span>
                                <span>Lease: {task.lease?.status || "NONE"}</span>
                              </div>

                              {(task.dependencies || []).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {(task.dependencies || []).slice(0, 4).map((dependency: any) => (
                                    <span key={dependency.taskId} className={`rounded-full border px-1.5 py-0.5 text-[8px] font-mono ${dependency.satisfied ? "border-[#19C37D]/20 bg-[#19C37D]/5 text-[#137A4D]" : "border-[#F5B942]/20 bg-[#F5B942]/5 text-[#8A6500]"}`}>
                                      {dependency.satisfied ? "✓" : "○"} {dependency.taskId}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {task.blockedReason && (
                                <div className="mt-2 rounded-md bg-[#F5B942]/5 border border-[#F5B942]/15 px-2 py-1.5 text-[8px] text-[#8A6500]">
                                  {String(task.blockedReason)}
                                </div>
                              )}

                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {state === "REVIEW" && (
                                  <>
                                    <button type="button" onClick={() => void runAction("complete", { summary: "Review approved by operator." })} className="px-2 py-1 rounded-md bg-[#19C37D]/10 text-[#137A4D] text-[8px] font-mono font-bold">Approve</button>
                                    <button type="button" onClick={() => void runAction("request_changes", { reason: "Changes requested from Overseer Dashboard." })} className="px-2 py-1 rounded-md bg-[#F5B942]/10 text-[#8A6500] text-[8px] font-mono font-bold">Rework</button>
                                  </>
                                )}
                                {["TODO", "READY"].includes(state) && (
                                  <button type="button" onClick={() => void runAction("block", { reason: "Blocked by operator from Overseer Dashboard." })} className="px-2 py-1 rounded-md bg-[#FF5A67]/5 text-[#C33A47] text-[8px] font-mono font-bold">Block</button>
                                )}
                                {state === "BLOCKED" && (
                                  <button type="button" onClick={() => void runAction("unblock")} className="px-2 py-1 rounded-md bg-[#1769E8]/10 text-[#1769E8] text-[8px] font-mono font-bold">Unblock</button>
                                )}
                                {["DONE", "FAILED"].includes(state) && (
                                  <button type="button" onClick={() => void runAction("archive")} className="px-2 py-1 rounded-md bg-black/[0.04] dark:bg-white/[0.04] text-[#667085] text-[8px] font-mono font-bold">Archive</button>
                                )}
                              </div>

                              {(task.workEvents || []).length > 0 && (
                                <div className="mt-2 pt-2 border-t border-black/[0.04] dark:border-white/[0.06]">
                                  <div className="text-[8px] font-mono uppercase text-[#667085]">Latest</div>
                                  {task.workEvents.slice(-2).reverse().map((event: any) => (
                                    <div key={event.eventId} className="mt-0.5 text-[8px] text-[#667085]">
                                      <span className="text-[#1769E8]">{event.type}</span> · {event.summary || "state changed"}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {(workBoard?.recentActivity || []).length > 0 && (
            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
              <div className="flex items-center gap-2 text-[9px] font-mono font-bold uppercase tracking-wider text-[#667085]">
                <Activity className="w-3 h-3 text-[#1769E8]" />
                Recent task activity
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                {(workBoard?.recentActivity || []).slice(0, 10).map((event: any) => (
                  <div key={event.eventId} className="text-[8px] text-[#667085]">
                    <span className="font-mono text-[#1769E8]">{event.type}</span> · {event.taskId} · {event.summary || "—"} · {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
