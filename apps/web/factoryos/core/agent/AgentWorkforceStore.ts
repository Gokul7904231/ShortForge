/**
 * FactoryOS Wave 3 — Durable Agent Workforce Store
 *
 * Workspace-scoped agent configuration and co-management.
 * Raw credentials/secrets are intentionally excluded from this model.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Db, Collection } from "mongodb";
import type { DurableEventBus } from "../events/DurableEventBus";
import type {
  AgentWorkforceCreateInput,
  AgentWorkforceGrantInput,
  AgentWorkforceMember,
  AgentWorkforceProfile,
  AgentWorkforceRole,
  AgentWorkforceSnapshot,
  AgentWorkforceStatus,
  AgentWorkforceUpdateInput,
} from "./AgentWorkforceContracts";

interface WorkforceRepository {
  get(workspaceId: string, agentId: string): Promise<AgentWorkforceProfile | null>;
  list(workspaceId: string): Promise<AgentWorkforceProfile[]>;
  save(agent: AgentWorkforceProfile, expectedVersion?: number): Promise<AgentWorkforceProfile>;
}

class InMemoryWorkforceRepository implements WorkforceRepository {
  private readonly agents = new Map<string, AgentWorkforceProfile>();

  async get(workspaceId: string, agentId: string): Promise<AgentWorkforceProfile | null> {
    const item = this.agents.get(agentId);
    return item && item.workspaceId === workspaceId ? structuredClone(item) : null;
  }

  async list(workspaceId: string): Promise<AgentWorkforceProfile[]> {
    return [...this.agents.values()]
      .filter((agent) => agent.workspaceId === workspaceId)
      .map((agent) => structuredClone(agent));
  }

  async save(agent: AgentWorkforceProfile, expectedVersion?: number): Promise<AgentWorkforceProfile> {
    const current = this.agents.get(agent.agentId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) {
      throw new Error("AGENT_WORKFORCE_VERSION_CONFLICT");
    }
    const next = {
      ...structuredClone(agent),
      version: current ? current.version + 1 : agent.version,
      updatedAt: new Date().toISOString(),
    };
    this.agents.set(agent.agentId, next);
    return structuredClone(next);
  }
}

class DiskWorkforceRepository implements WorkforceRepository {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, "agents");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(workspaceId: string, agentId: string): string {
    const safeWorkspace = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeAgent = agentId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.dir, safeWorkspace + "__" + safeAgent + ".json");
  }

  async get(workspaceId: string, agentId: string): Promise<AgentWorkforceProfile | null> {
    const file = this.file(workspaceId, agentId);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as AgentWorkforceProfile;
    } catch {
      return null;
    }
  }

  async list(workspaceId: string): Promise<AgentWorkforceProfile[]> {
    if (!fs.existsSync(this.dir)) return [];
    const prefix = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_") + "__";
    return fs.readdirSync(this.dir)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
      .map((name) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(this.dir, name), "utf8")) as AgentWorkforceProfile;
        } catch {
          return null;
        }
      })
      .filter((item): item is AgentWorkforceProfile => Boolean(item));
  }

  async save(agent: AgentWorkforceProfile, expectedVersion?: number): Promise<AgentWorkforceProfile> {
    const current = await this.get(agent.workspaceId, agent.agentId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) {
      throw new Error("AGENT_WORKFORCE_VERSION_CONFLICT");
    }
    const next = {
      ...structuredClone(agent),
      version: current ? current.version + 1 : agent.version,
      updatedAt: new Date().toISOString(),
    };
    const file = this.file(next.workspaceId, next.agentId);
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    fs.renameSync(tmp, file);
    return structuredClone(next);
  }
}

class MongoWorkforceRepository implements WorkforceRepository {
  private readonly collection: Collection<AgentWorkforceProfile & { _id?: unknown }>;

  constructor(db: Db) {
    this.collection = db.collection("agent_workforce");
  }

  async get(workspaceId: string, agentId: string): Promise<AgentWorkforceProfile | null> {
    const doc = await this.collection.findOne({ workspaceId, agentId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as AgentWorkforceProfile;
  }

  async list(workspaceId: string): Promise<AgentWorkforceProfile[]> {
    const docs = await this.collection.find({ workspaceId }).sort({ updatedAt: -1 }).toArray();
    return docs.map(({ _id, ...rest }) => rest as AgentWorkforceProfile);
  }

  async save(agent: AgentWorkforceProfile, expectedVersion?: number): Promise<AgentWorkforceProfile> {
    const current = await this.get(agent.workspaceId, agent.agentId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) {
      throw new Error("AGENT_WORKFORCE_VERSION_CONFLICT");
    }
    const next = {
      ...structuredClone(agent),
      version: current ? current.version + 1 : agent.version,
      updatedAt: new Date().toISOString(),
    };
    await this.collection.replaceOne(
      { workspaceId: next.workspaceId, agentId: next.agentId },
      next,
      { upsert: true },
    );
    return structuredClone(next);
  }
}

export interface AgentWorkforceStoreOptions {
  readonly workspaceId?: string;
  readonly eventBus?: DurableEventBus;
  readonly mongoDb?: Db;
  readonly diskPath?: string;
}

export class AgentWorkforceStore {
  private readonly workspaceId: string;
  private readonly repository: WorkforceRepository;
  private readonly eventBus?: DurableEventBus;

  constructor(options: AgentWorkforceStoreOptions = {}) {
    this.workspaceId = options.workspaceId || "factoryos";
    this.eventBus = options.eventBus;
    if (options.mongoDb) {
      this.repository = new MongoWorkforceRepository(options.mongoDb);
    } else if (options.diskPath) {
      this.repository = new DiskWorkforceRepository(options.diskPath);
    } else {
      this.repository = new InMemoryWorkforceRepository();
    }
  }

  async list(): Promise<AgentWorkforceSnapshot> {
    const agents = await this.repository.list(this.workspaceId);
    return {
      workspaceId: this.workspaceId,
      agents: agents.map((agent) => this.redactForMembers(agent)),
    };
  }

  async get(agentId: string, principalId?: string): Promise<AgentWorkforceProfile | null> {
    const agent = await this.repository.get(this.workspaceId, agentId);
    if (!agent) return null;
    return this.authorizedView(agent, principalId);
  }

  async create(input: AgentWorkforceCreateInput, principalId: string): Promise<AgentWorkforceProfile> {
    this.validateInput(input);
    const now = new Date().toISOString();
    const agent: AgentWorkforceProfile = {
      agentId: "agent_" + randomUUID().replace(/-/g, "").slice(0, 14),
      workspaceId: this.workspaceId,
      name: input.name.trim(),
      description: input.description?.trim() || "",
      role: input.role.trim(),
      specialization: input.specialization?.trim() || "",
      status: "ACTIVE",
      creatorId: principalId,
      members: [{
        principalId,
        role: "OWNER",
        addedAt: now,
        addedBy: principalId,
        active: true,
      }],
      allowedCapabilities: this.unique(input.allowedCapabilities || []),
      allowedToolIds: this.unique(input.allowedToolIds || []),
      preferredModel: input.preferredModel
        ? { providerId: input.preferredModel.providerId.trim(), modelId: input.preferredModel.modelId.trim() }
        : undefined,
      systemPrompt: input.systemPrompt?.trim() || undefined,
      responseMode: input.responseMode || "MENTION_ONLY",
      integrations: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const saved = await this.repository.save(agent);
    await this.publish("AGENT_WORKFORCE_CREATED", saved, principalId);
    return this.redactForManagers(saved, principalId);
  }

  async update(
    agentId: string,
    input: AgentWorkforceUpdateInput,
    principalId: string,
  ): Promise<AgentWorkforceProfile> {
    const agent = await this.repository.get(this.workspaceId, agentId);
    if (!agent) throw new Error("AGENT_NOT_FOUND");
    this.assertCanEdit(agent, principalId);

    const updated: AgentWorkforceProfile = {
      ...agent,
      name: input.name?.trim() || agent.name,
      description: input.description?.trim() ?? agent.description,
      role: input.role?.trim() || agent.role,
      specialization: input.specialization?.trim() ?? agent.specialization,
      status: input.status || agent.status,
      allowedCapabilities: input.allowedCapabilities ? this.unique(input.allowedCapabilities) : agent.allowedCapabilities,
      allowedToolIds: input.allowedToolIds ? this.unique(input.allowedToolIds) : agent.allowedToolIds,
      preferredModel: input.preferredModel
        ? { providerId: input.preferredModel.providerId.trim(), modelId: input.preferredModel.modelId.trim() }
        : input.preferredModel === undefined ? agent.preferredModel : undefined,
      systemPrompt: input.systemPrompt !== undefined ? input.systemPrompt.trim() : agent.systemPrompt,
      responseMode: input.responseMode || agent.responseMode,
      integrations: agent.integrations,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      version: agent.version,
    };

    const saved = await this.repository.save(updated, input.expectedVersion);
    await this.publish("AGENT_WORKFORCE_UPDATED", {
      agentId: saved.agentId,
      workspaceId: saved.workspaceId,
      status: saved.status,
      preferredModel: saved.preferredModel,
      allowedCapabilities: saved.allowedCapabilities,
    }, principalId);
    return this.redactForManagers(saved, principalId);
  }

  async grant(
    agentId: string,
    input: AgentWorkforceGrantInput,
    principalId: string,
  ): Promise<AgentWorkforceProfile> {
    const agent = await this.repository.get(this.workspaceId, agentId);
    if (!agent) throw new Error("AGENT_NOT_FOUND");
    this.assertCanManageMembers(agent, principalId);
    if (!input.principalId.trim()) throw new Error("AGENT_MEMBER_PRINCIPAL_REQUIRED");

    const members = [...agent.members].filter((member) => member.principalId !== input.principalId.trim());
    members.push({
      principalId: input.principalId.trim(),
      role: input.role,
      addedAt: new Date().toISOString(),
      addedBy: principalId,
      active: true,
    });

    if (input.role === "OWNER" && principalId !== agent.creatorId) {
      throw new Error("Only the original creator may transfer agent ownership.");
    }

    const saved = await this.repository.save(
      { ...agent, members },
      agent.version,
    );
    await this.publish("AGENT_WORKFORCE_MEMBER_GRANTED", {
      agentId: saved.agentId,
      principalId: input.principalId,
      role: input.role,
    }, principalId);
    return this.redactForManagers(saved, principalId);
  }

  async revoke(agentId: string, principalIdToRevoke: string, actorId: string): Promise<AgentWorkforceProfile> {
    const agent = await this.repository.get(this.workspaceId, agentId);
    if (!agent) throw new Error("AGENT_NOT_FOUND");
    this.assertCanManageMembers(agent, actorId);
    if (principalIdToRevoke === agent.creatorId) {
      throw new Error("The original agent creator cannot be removed.");
    }
    const saved = await this.repository.save(
      {
        ...agent,
        members: agent.members.map((member) =>
          member.principalId === principalIdToRevoke ? { ...member, active: false } : member,
        ),
      },
      agent.version,
    );
    await this.publish("AGENT_WORKFORCE_MEMBER_REVOKED", {
      agentId: saved.agentId,
      principalId: principalIdToRevoke,
    }, actorId);
    return this.redactForManagers(saved, actorId);
  }

  async canUse(agentId: string, principalId: string): Promise<boolean> {
    const agent = await this.repository.get(this.workspaceId, agentId);
    if (!agent || agent.status !== "ACTIVE") return false;
    return agent.members.some((member) => member.active && member.principalId === principalId);
  }

  async canEdit(agentId: string, principalId: string): Promise<boolean> {
    const agent = await this.repository.get(this.workspaceId, agentId);
    return Boolean(agent && agent.status === "ACTIVE" && this.editableRoles(agent, principalId).length > 0);
  }

  private assertCanEdit(agent: AgentWorkforceProfile, principalId: string): void {
    const member = agent.members.find((item) => item.active && item.principalId === principalId);
    if (!member || !["OWNER", "EDITOR"].includes(member.role)) {
      throw new Error("AGENT_EDIT_PERMISSION_REQUIRED");
    }
  }

  private assertCanManageMembers(agent: AgentWorkforceProfile, principalId: string): void {
    const member = agent.members.find((item) => item.active && item.principalId === principalId);
    if (!member || !["OWNER", "EDITOR"].includes(member.role)) {
      throw new Error("AGENT_MEMBER_MANAGEMENT_REQUIRED");
    }
    if (member.role !== "OWNER" && principalId === agent.creatorId) return;
  }

  private editableRoles(agent: AgentWorkforceProfile, principalId: string): AgentWorkforceMember[] {
    return agent.members.filter((member) => member.active && member.principalId === principalId && ["OWNER", "EDITOR"].includes(member.role));
  }

  private authorizedView(agent: AgentWorkforceProfile, principalId?: string): AgentWorkforceProfile | null {
    if (!principalId) return this.redactForMembers(agent);
    if (!agent.members.some((member) => member.active && member.principalId === principalId)) return null;
    return this.editableRoles(agent, principalId).length > 0
      ? this.redactForManagers(agent, principalId)
      : this.redactForMembers(agent);
  }

  private redactForManagers(agent: AgentWorkforceProfile, principalId?: string): AgentWorkforceProfile {
    const member = principalId
      ? agent.members.find((item) => item.active && item.principalId === principalId)
      : undefined;
    if (!member || !["OWNER", "EDITOR"].includes(member.role)) return this.redactForMembers(agent);
    return structuredClone(agent);
  }

  private redactForMembers(agent: AgentWorkforceProfile): AgentWorkforceProfile {
    return {
      ...structuredClone(agent),
      systemPrompt: undefined,
      integrations: agent.integrations.map((binding) => ({
        ...binding,
        connectionRef: "REDACTED",
      })),
    };
  }

  private validateInput(input: AgentWorkforceCreateInput): void {
    if (!input.name?.trim()) throw new Error("AGENT_NAME_REQUIRED");
    if (!input.role?.trim()) throw new Error("AGENT_ROLE_REQUIRED");
    const capabilityCount = input.allowedCapabilities?.length || 0;
    if (capabilityCount > 32) throw new Error("AGENT_CAPABILITY_LIMIT_EXCEEDED");
    const toolCount = input.allowedToolIds?.length || 0;
    if (toolCount > 64) throw new Error("AGENT_TOOL_LIMIT_EXCEEDED");
  }

  private unique(items: string[]): string[] {
    return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  }

  private async publish(topic: string, payload: unknown, actorId: string): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish(topic as any, {
      ...(payload && typeof payload === "object" ? payload as Record<string, unknown> : { payload }),
      actorId,
      workspaceId: this.workspaceId,
    }, {
      source: "agent_workforce",
      correlationId: `agent-workforce:${this.workspaceId}`,
    });
  }
}
