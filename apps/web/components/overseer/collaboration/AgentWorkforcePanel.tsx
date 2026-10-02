"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  Link2,
  Plus,
  Shield,
  Users,
} from "lucide-react";

interface WorkforceAgent {
  agentId: string;
  name: string;
  description: string;
  role: string;
  specialization: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  creatorId: string;
  members: Array<{ principalId: string; role: "OWNER" | "EDITOR" | "USER"; active: boolean }>;
  allowedCapabilities: string[];
  allowedToolIds: string[];
  preferredModel?: { providerId: string; modelId: string };
  responseMode: "JOINS_CONVERSATION" | "MENTION_ONLY";
  integrations: Array<{ integrationId: string; provider: string; connectionRef: string; scope: string; status: string }>;
  version: number;
}

interface AgentWorkforcePanelProps {
  accentColor?: string;
}

export const AgentWorkforcePanel: React.FC<AgentWorkforcePanelProps> = ({ accentColor = "#1769E8" }) => {
  const [agents, setAgents] = useState<WorkforceAgent[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    role: "SPECIALIST",
    specialization: "",
    description: "",
    responseMode: "MENTION_ONLY" as WorkforceAgent["responseMode"],
    modelProvider: "",
    modelId: "",
  });
  const [managerDrafts, setManagerDrafts] = useState<Record<string, { principalId: string; role: "EDITOR" | "USER" }>>({});
  const [configDrafts, setConfigDrafts] = useState<Record<string, { description: string; providerId: string; modelId: string }>>({});
  const [integrationDrafts, setIntegrationDrafts] = useState<Record<string, { integrationId: string; provider: string; connectionRef: string; scope: string }>>({});

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/overseer/agents/workforce", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to load agent workforce.");
      setAgents(json.data?.agents || []);
      setCanCreate(Boolean(json.permissions?.canCreate));
    } catch (err: any) {
      setError(err?.message || "Unable to load agent workforce.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activeCount = useMemo(() => agents.filter((agent) => agent.status === "ACTIVE").length, [agents]);

  const createAgent = async () => {
    if (!draft.name.trim()) return;
    try {
      setCreating(true);
      const res = await fetch("/api/overseer/agents/workforce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: draft.name,
          role: draft.role,
          specialization: draft.specialization,
          description: draft.description,
          responseMode: draft.responseMode,
          preferredModel: draft.modelProvider && draft.modelId
            ? { providerId: draft.modelProvider, modelId: draft.modelId }
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to create agent.");
      setDraft({ name: "", role: "SPECIALIST", specialization: "", description: "", responseMode: "MENTION_ONLY", modelProvider: "", modelId: "" });
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to create agent.");
    } finally {
      setCreating(false);
    }
  };

  const updateAgent = async (agent: WorkforceAgent, patch: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/overseer/agents/workforce/${agent.agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, expectedVersion: agent.version }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to update agent.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to update agent.");
    }
  };

  const mutateMembership = async (agent: WorkforceAgent, payload: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/overseer/agents/workforce/${agent.agentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to change agent membership.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Unable to change agent membership.");
    }
  };

  const bindIntegration = async (agent: WorkforceAgent) => {
    const d = integrationDrafts[agent.agentId];
    if (!d?.integrationId || !d.provider || !d.connectionRef || !d.scope) return;
    await mutateMembership(agent, { action: "bind_integration", ...d });
    setIntegrationDrafts((current) => ({ ...current, [agent.agentId]: { integrationId: "", provider: "", connectionRef: "", scope: "" } }));
  };

  return (
    <section className="w-full max-w-4xl mx-auto mt-5 rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-white/80 dark:bg-[#07101A]/90 backdrop-blur-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4" style={{ color: accentColor }} />
          <div>
            <div className="text-xs font-bold text-[#111827] dark:text-[#F5F7FA]">Agent Workforce</div>
            <div className="text-[9px] font-mono text-[#667085]">{activeCount} active · workspace-scoped · co-manageable</div>
          </div>
        </div>
        <Shield className="w-3.5 h-3.5 text-[#667085]" />
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-[#FF5A67]/20 bg-[#FF5A67]/5 px-3 py-2 text-[10px] text-[#C33A47]">
          {error}
        </div>
      )}

      {canCreate && (
        <div className="p-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="text-[9px] font-mono uppercase tracking-wider text-[#667085]">Create team agent</div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Agent name" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2.5 py-2 text-[10px] text-[#111827] dark:text-[#F5F7FA]" />
            <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Role" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2.5 py-2 text-[10px] text-[#111827] dark:text-[#F5F7FA]" />
            <input value={draft.specialization} onChange={(e) => setDraft({ ...draft, specialization: e.target.value })} placeholder="Specialization" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2.5 py-2 text-[10px] text-[#111827] dark:text-[#F5F7FA]" />
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2.5 py-2 text-[10px] text-[#111827] dark:text-[#F5F7FA]" />
            <input value={draft.modelProvider} onChange={(e) => setDraft({ ...draft, modelProvider: e.target.value })} placeholder="Preferred provider (optional)" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2.5 py-2 text-[10px] text-[#111827] dark:text-[#F5F7FA]" />
            <input value={draft.modelId} onChange={(e) => setDraft({ ...draft, modelId: e.target.value })} placeholder="Preferred model (optional)" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2.5 py-2 text-[10px] text-[#111827] dark:text-[#F5F7FA]" />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <select value={draft.responseMode} onChange={(e) => setDraft({ ...draft, responseMode: e.target.value as WorkforceAgent["responseMode"] })} className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px] font-mono text-[#667085]">
              <option value="MENTION_ONLY">Mention only</option>
              <option value="JOINS_CONVERSATION">Joins conversation</option>
            </select>
            <button type="button" disabled={creating || !draft.name.trim()} onClick={() => void createAgent()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[9px] font-mono font-bold text-white disabled:opacity-40" style={{ backgroundColor: accentColor }}>
              <Plus className="w-3 h-3" /> {creating ? "Creating…" : "Create agent"}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-black/[0.05] dark:divide-white/[0.07]">
        {loading ? (
          <div className="p-6 text-center text-[10px] text-[#667085]">Loading workforce…</div>
        ) : agents.length === 0 ? (
          <div className="p-6 text-center">
            <Bot className="mx-auto w-7 h-7 text-[#667085] mb-2" />
            <div className="text-xs font-semibold text-[#111827] dark:text-[#F5F7FA]">No team-managed agents yet</div>
            <div className="mt-1 text-[10px] text-[#667085]">Create an agent here, then share it with teammates or add it to a mission room.</div>
          </div>
        ) : agents.map((agent) => {
          const isOpen = expanded === agent.agentId;
          const manager = managerDrafts[agent.agentId] || { principalId: "", role: "EDITOR" as const };
          const integration = integrationDrafts[agent.agentId] || { integrationId: "", provider: "", connectionRef: "", scope: "" };
          const activeOwners = agent.members.filter((member) => member.active && (member.role === "OWNER" || member.role === "EDITOR")).length;

          return (
            <div key={agent.agentId} className="p-4">
              <button type="button" onClick={() => setExpanded(isOpen ? null : agent.agentId)} className="w-full flex items-start justify-between gap-3 text-left">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center bg-black/[0.03] dark:bg-white/[0.04]">
                    <Bot className="w-4 h-4" style={{ color: accentColor }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#111827] dark:text-[#F5F7FA]">{agent.name}</span>
                      <span className="text-[8px] font-mono uppercase text-[#667085]">{agent.status}</span>
                    </div>
                    <div className="mt-0.5 text-[9px] font-mono text-[#667085]">{agent.role} · {agent.specialization || "General specialist"}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {agent.allowedCapabilities.slice(0, 4).map((cap) => (
                        <span key={cap} className="rounded-full bg-black/[0.03] dark:bg-white/[0.04] px-1.5 py-0.5 text-[8px] font-mono text-[#667085]">{cap}</span>
                      ))}
                      {agent.preferredModel && <span className="rounded-full bg-[#1769E8]/5 px-1.5 py-0.5 text-[8px] font-mono text-[#1769E8]">{agent.preferredModel.modelId}</span>}
                    </div>
                  </div>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-[#667085]" /> : <ChevronDown className="w-4 h-4 text-[#667085]" />}
              </button>

              {isOpen && (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
                    <div className="text-[9px] font-mono font-bold uppercase text-[#667085]">Shared configuration</div>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      <input
                        value={(configDrafts[agent.agentId]?.description ?? agent.description)}
                        onChange={(e) => setConfigDrafts({
                          ...configDrafts,
                          [agent.agentId]: {
                            description: e.target.value,
                            providerId: configDrafts[agent.agentId]?.providerId ?? agent.preferredModel?.providerId ?? "",
                            modelId: configDrafts[agent.agentId]?.modelId ?? agent.preferredModel?.modelId ?? "",
                          },
                        })}
                        placeholder="Agent description"
                        className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2.5 py-1.5 text-[9px] text-[#111827] dark:text-[#F5F7FA]"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={(configDrafts[agent.agentId]?.providerId ?? agent.preferredModel?.providerId ?? "")}
                          onChange={(e) => setConfigDrafts({
                            ...configDrafts,
                            [agent.agentId]: {
                              description: configDrafts[agent.agentId]?.description ?? agent.description,
                              providerId: e.target.value,
                              modelId: configDrafts[agent.agentId]?.modelId ?? agent.preferredModel?.modelId ?? "",
                            },
                          })}
                          placeholder="Preferred provider"
                          className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2.5 py-1.5 text-[9px] text-[#111827] dark:text-[#F5F7FA]"
                        />
                        <input
                          value={(configDrafts[agent.agentId]?.modelId ?? agent.preferredModel?.modelId ?? "")}
                          onChange={(e) => setConfigDrafts({
                            ...configDrafts,
                            [agent.agentId]: {
                              description: configDrafts[agent.agentId]?.description ?? agent.description,
                              providerId: configDrafts[agent.agentId]?.providerId ?? agent.preferredModel?.providerId ?? "",
                              modelId: e.target.value,
                            },
                          })}
                          placeholder="Preferred model"
                          className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2.5 py-1.5 text-[9px] text-[#111827] dark:text-[#F5F7FA]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const draft = configDrafts[agent.agentId] || {
                            description: agent.description,
                            providerId: agent.preferredModel?.providerId || "",
                            modelId: agent.preferredModel?.modelId || "",
                          };
                          const patch: Record<string, unknown> = { description: draft.description.trim() };
                          if (draft.providerId.trim() && draft.modelId.trim()) {
                            patch.preferredModel = {
                              providerId: draft.providerId.trim(),
                              modelId: draft.modelId.trim(),
                            };
                          }
                          void updateAgent(agent, patch);
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#1769E8]/10 px-2.5 py-1.5 text-[9px] font-mono font-bold text-[#1769E8]"
                      >
                        <Save className="w-3 h-3" /> Save configuration
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-[8px] text-[#667085]">
                      <CheckCircle2 className="w-3 h-3 text-[#19C37D]" />
                      Configuration saves atomically with an agent version check.
                    </div>
                  </div>

                  <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
                    <div className="flex items-center gap-2 text-[9px] font-mono font-bold uppercase text-[#667085]"><Users className="w-3 h-3" /> Co-managers</div>
                    <div className="mt-2 space-y-1.5">
                      {agent.members.filter((member) => member.active).map((member) => (
                        <div key={member.principalId} className="flex items-center justify-between text-[9px] font-mono">
                          <span className="text-[#111827] dark:text-[#F5F7FA]">{member.principalId}</span>
                          <span className="flex items-center gap-1 text-[#667085]">{member.role === "OWNER" && <Crown className="w-3 h-3" />}{member.role}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                      <input value={manager.principalId} onChange={(e) => setManagerDrafts({ ...managerDrafts, [agent.agentId]: { ...manager, principalId: e.target.value } })} placeholder="Teammate principal ID" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px] text-[#111827] dark:text-[#F5F7FA]" />
                      <select value={manager.role} onChange={(e) => setManagerDrafts({ ...managerDrafts, [agent.agentId]: { ...manager, role: e.target.value as "EDITOR" | "USER" } })} className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px] text-[#667085]">
                        <option value="EDITOR">Editor</option>
                        <option value="USER">User</option>
                      </select>
                    </div>
                    <button type="button" onClick={() => void mutateMembership(agent, { action: "grant", principalId: manager.principalId, role: manager.role })} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#1769E8]/10 px-2.5 py-1.5 text-[9px] font-mono font-bold text-[#1769E8]">
                      <Users className="w-3 h-3" /> Grant access
                    </button>
                    <div className="mt-2 text-[8px] text-[#667085]">{activeOwners} managers can maintain this agent. Regular users can run it but cannot edit configuration.</div>
                  </div>

                  <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
                    <div className="flex items-center gap-2 text-[9px] font-mono font-bold uppercase text-[#667085]"><Link2 className="w-3 h-3" /> Integration bindings</div>
                    <div className="mt-2 space-y-1.5">
                      {agent.integrations.length === 0 ? (
                        <div className="text-[9px] text-[#667085]">No integration bindings.</div>
                      ) : agent.integrations.map((binding) => (
                        <div key={binding.integrationId} className="rounded-lg bg-black/[0.025] dark:bg-white/[0.03] p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-semibold text-[#111827] dark:text-[#F5F7FA]">{binding.integrationId}</span>
                            <span className="text-[8px] font-mono text-[#667085]">{binding.status}</span>
                          </div>
                          <div className="mt-1 text-[8px] font-mono text-[#667085]">{binding.provider} · {binding.scope} · {binding.connectionRef}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <input value={integration.integrationId} onChange={(e) => setIntegrationDrafts({ ...integrationDrafts, [agent.agentId]: { ...integration, integrationId: e.target.value } })} placeholder="Binding ID" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px] text-[#111827] dark:text-[#F5F7FA]" />
                      <input value={integration.provider} onChange={(e) => setIntegrationDrafts({ ...integrationDrafts, [agent.agentId]: { ...integration, provider: e.target.value } })} placeholder="Provider" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px] text-[#111827] dark:text-[#F5F7FA]" />
                      <input value={integration.connectionRef} onChange={(e) => setIntegrationDrafts({ ...integrationDrafts, [agent.agentId]: { ...integration, connectionRef: e.target.value } })} placeholder="Connection ref" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px] text-[#111827] dark:text-[#F5F7FA]" />
                      <input value={integration.scope} onChange={(e) => setIntegrationDrafts({ ...integrationDrafts, [agent.agentId]: { ...integration, scope: e.target.value } })} placeholder="Scope" className="rounded-lg border border-black/[0.08] dark:border-white/[0.10] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px] text-[#111827] dark:text-[#F5F7FA]" />
                    </div>
                    <button type="button" onClick={() => void bindIntegration(agent)} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.04] px-2.5 py-1.5 text-[9px] font-mono font-bold text-[#667085]">
                      <Link2 className="w-3 h-3" /> Bind reference
                    </button>
                    <div className="mt-2 flex gap-1.5">
                      {agent.status !== "ARCHIVED" && (
                        <button type="button" onClick={() => void updateAgent(agent, { status: agent.status === "ACTIVE" ? "PAUSED" : "ACTIVE" })} className="inline-flex items-center gap-1 rounded-lg bg-[#F5B942]/10 px-2.5 py-1.5 text-[9px] font-mono font-bold text-[#8A6500]">
                          {agent.status === "ACTIVE" ? "Pause agent" : "Resume agent"}
                        </button>
                      )}
                      {agent.status !== "ARCHIVED" && (
                        <button type="button" onClick={() => void updateAgent(agent, { status: "ARCHIVED" })} className="inline-flex items-center gap-1 rounded-lg bg-[#FF5A67]/5 px-2.5 py-1.5 text-[9px] font-mono font-bold text-[#C33A47]">
                          Archive
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-[8px] text-[#667085]">
                      <CheckCircle2 className="w-3 h-3 text-[#19C37D]" />
                      Configuration is durable metadata; raw credentials never belong in the agent profile.
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
