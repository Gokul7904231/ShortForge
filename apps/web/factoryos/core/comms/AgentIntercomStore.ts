/**
 * FactoryOS Wave 4 — Agent Intercom & Governed Delegation Store
 *
 * Durable multi-agent communication on top of Comms Fabric v2 and DurableEventBus.
 * Transport success is never treated as execution authorization or verification.
 */

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Db, Collection } from "mongodb";
import {
  admitComms,
  COMMS_PROTOCOL_VERSION,
  nextDeliveryState,
  shouldRetry,
  type CommsAuthorizationContext,
  type CommsCapability,
  type CommsEnvelope,
  type CommsPeerHello,
  type CommsPrincipal,
} from "./CommsFabric";
import type { DurableEventBus } from "../events/DurableEventBus";
import type {
  AgentDelegationCreateInput,
  AgentIntercomDelegationRequest,
  AgentIntercomAuth,
  AgentIntercomDeliveryState,
  AgentIntercomMessage,
  AgentIntercomPayload,
  AgentIntercomReplayPage,
  AgentIntercomSendInput,
  AgentIntercomSession,
} from "./AgentIntercomContracts";
import type { AgentWorkforceStore } from "../agent/AgentWorkforceStore";

interface IntercomRepository {
  getMessage(id: string): Promise<AgentIntercomMessage | null>;
  listMessages(missionId: string): Promise<AgentIntercomMessage[]>;
  saveMessage(message: AgentIntercomMessage, expectedVersion?: number): Promise<AgentIntercomMessage>;
  getDelegation(id: string): Promise<AgentIntercomDelegationRequest | null>;
  listDelegations(missionId: string): Promise<AgentIntercomDelegationRequest[]>;
  saveDelegation(delegation: AgentIntercomDelegationRequest, expectedVersion?: number): Promise<AgentIntercomDelegationRequest>;
  getSession(id: string): Promise<AgentIntercomSession | null>;
  listSessions(missionId: string): Promise<AgentIntercomSession[]>;
  listSessionsAll(): Promise<AgentIntercomSession[]>;
  saveSession(session: AgentIntercomSession, expectedVersion?: number): Promise<AgentIntercomSession>;
}

class InMemoryIntercomRepository implements IntercomRepository {
  private readonly messages = new Map<string, AgentIntercomMessage>();
  private readonly delegations = new Map<string, AgentIntercomDelegationRequest>();
  private readonly sessions = new Map<string, AgentIntercomSession>();

  async getMessage(id: string) { return structuredClone(this.messages.get(id) || null); }
  async listMessages(missionId: string) {
    return [...this.messages.values()].filter((x) => x.envelope.meta.scope.missionId === missionId).map(structuredClone);
  }
  async saveMessage(message: AgentIntercomMessage, expectedVersion?: number) {
    const current = this.messages.get(message.intercomId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("INTERCOM_VERSION_CONFLICT");
    const next = { ...structuredClone(message), version: current ? current.version + 1 : message.version, updatedAt: new Date().toISOString() };
    this.messages.set(next.intercomId, next);
    return structuredClone(next);
  }
  async getDelegation(id: string) { return structuredClone(this.delegations.get(id) || null); }
  async listDelegations(missionId: string): Promise<AgentIntercomDelegationRequest[]> {
    return [...this.delegations.values()]
      .filter((x) => x.missionId === missionId)
      .map((x) => structuredClone(x));
  }
  async saveDelegation(delegation: AgentIntercomDelegationRequest, expectedVersion?: number) {
    const current = this.delegations.get(delegation.delegationId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("INTERCOM_VERSION_CONFLICT");
    const next = { ...structuredClone(delegation), version: current ? current.version + 1 : delegation.version, updatedAt: new Date().toISOString() };
    this.delegations.set(next.delegationId, next);
    return structuredClone(next);
  }
  async getSession(id: string) { return structuredClone(this.sessions.get(id) || null); }
  async listSessions(missionId: string) {
    return [...this.sessions.values()].filter((x) => x.missionId === missionId).map((x) => structuredClone(x));
  }
  async listSessionsAll() {
    return [...this.sessions.values()].map((x) => structuredClone(x));
  }
  async saveSession(session: AgentIntercomSession, expectedVersion?: number) {
    const current = this.sessions.get(session.state.sessionId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("INTERCOM_VERSION_CONFLICT");
    const next = { ...structuredClone(session), version: current ? current.version + 1 : session.version };
    this.sessions.set(next.state.sessionId, next);
    return structuredClone(next);
  }
}

class DiskIntercomRepository implements IntercomRepository {
  constructor(private readonly root: string) {
    for (const dir of ["messages", "delegations", "sessions"]) fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  private file(kind: string, id: string) { return path.join(this.root, kind, id.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json"); }
  private read<T>(file: string): T | null { if (!fs.existsSync(file)) return null; try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return null; } }
  private write(kind: string, id: string, value: unknown) {
    const file = this.file(kind, id), tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, file);
  }
  async getMessage(id: string) { return this.read<AgentIntercomMessage>(this.file("messages", id)); }
  async listMessages(missionId: string) { return this.list<AgentIntercomMessage>("messages").filter((x) => x.envelope.meta.scope.missionId === missionId); }
  async saveMessage(message: AgentIntercomMessage, expectedVersion?: number) {
    const current = await this.getMessage(message.intercomId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("INTERCOM_VERSION_CONFLICT");
    const next = { ...structuredClone(message), version: current ? current.version + 1 : message.version, updatedAt: new Date().toISOString() };
    this.write("messages", next.intercomId, next); return structuredClone(next);
  }
  async getDelegation(id: string) { return this.read<AgentIntercomDelegationRequest>(this.file("delegations", id)); }
  async listDelegations(missionId: string) { return this.list<AgentIntercomDelegationRequest>("delegations").filter((x) => x.missionId === missionId); }
  async saveDelegation(delegation: AgentIntercomDelegationRequest, expectedVersion?: number) {
    const current = await this.getDelegation(delegation.delegationId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("INTERCOM_VERSION_CONFLICT");
    const next = { ...structuredClone(delegation), version: current ? current.version + 1 : delegation.version, updatedAt: new Date().toISOString() };
    this.write("delegations", next.delegationId, next); return structuredClone(next);
  }
  async getSession(id: string) { return this.read<AgentIntercomSession>(this.file("sessions", id)); }
  async listSessions(missionId: string) { return this.list<AgentIntercomSession>("sessions").filter((x) => x.state.sessionId.includes(missionId)); }
  async saveSession(session: AgentIntercomSession, expectedVersion?: number) {
    const current = await this.getSession(session.state.sessionId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("INTERCOM_VERSION_CONFLICT");
    const next = { ...structuredClone(session), version: current ? current.version + 1 : session.version };
    this.write("sessions", next.state.sessionId, next); return structuredClone(next);
  }
  private list<T>(kind: string): T[] {
    const dir = path.join(this.root, kind);
    return fs.readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => this.read<T>(path.join(dir, n))).filter((x): x is T => Boolean(x));
  }
}

class MongoIntercomRepository implements IntercomRepository {
  private readonly messages: Collection<AgentIntercomMessage & { _id?: unknown }>;
  private readonly delegations: Collection<AgentIntercomDelegationRequest & { _id?: unknown }>;
  private readonly sessions: Collection<AgentIntercomSession & { _id?: unknown }>;
  constructor(db: Db) {
    this.messages = db.collection("agent_intercom_messages");
    this.delegations = db.collection("agent_intercom_delegations");
    this.sessions = db.collection("agent_intercom_sessions");
  }
  async getMessage(id: string) { const d = await this.messages.findOne({ intercomId: id }); if (!d) return null; const { _id, ...rest } = d; return rest as AgentIntercomMessage; }
  async listMessages(missionId: string) { const docs = await this.messages.find({ "envelope.meta.scope.missionId": missionId }).sort({ createdAt: 1, intercomId: 1 }).toArray(); return docs.map(({ _id, ...rest }) => rest as AgentIntercomMessage); }
  async saveMessage(message: AgentIntercomMessage, expectedVersion?: number) {
    const current = await this.getMessage(message.intercomId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("INTERCOM_VERSION_CONFLICT");
    const next = { ...structuredClone(message), version: current ? current.version + 1 : message.version, updatedAt: new Date().toISOString() };
    await this.messages.replaceOne({ intercomId: next.intercomId }, next, { upsert: true }); return structuredClone(next);
  }
  async getDelegation(id: string) { const d = await this.delegations.findOne({ delegationId: id }); if (!d) return null; const { _id, ...rest } = d; return rest as AgentIntercomDelegationRequest; }
  async listDelegations(missionId: string) { const docs = await this.delegations.find({ missionId }).sort({ createdAt: 1, delegationId: 1 }).toArray(); return docs.map(({ _id, ...rest }) => rest as AgentIntercomDelegationRequest); }
  async saveDelegation(delegation: AgentIntercomDelegationRequest, expectedVersion?: number) {
    const current = await this.getDelegation(delegation.delegationId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("INTERCOM_VERSION_CONFLICT");
    const next = { ...structuredClone(delegation), version: current ? current.version + 1 : delegation.version, updatedAt: new Date().toISOString() };
    await this.delegations.replaceOne({ delegationId: next.delegationId }, next, { upsert: true }); return structuredClone(next);
  }
  async getSession(id: string) { const d = await this.sessions.findOne({ "state.sessionId": id }); if (!d) return null; const { _id, ...rest } = d; return rest as AgentIntercomSession; }
  async listSessions(missionId: string) {
    const docs = await this.sessions.find({ missionId }).sort({ lastSeenAt: -1 }).toArray();
    return docs.map(({ _id, ...rest }) => rest as AgentIntercomSession);
  }
  async listSessionsAll() {
    const docs = await this.sessions.find({}).sort({ lastSeenAt: -1 }).toArray();
    return docs.map(({ _id, ...rest }) => rest as AgentIntercomSession);
  }
  async saveSession(session: AgentIntercomSession, expectedVersion?: number) {
    const current = await this.getSession(session.state.sessionId);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) throw new Error("INTERCOM_VERSION_CONFLICT");
    const next = { ...structuredClone(session), version: current ? current.version + 1 : session.version };
    await this.sessions.replaceOne({ "state.sessionId": next.state.sessionId }, next, { upsert: true }); return structuredClone(next);
  }
}

export interface AgentIntercomStoreOptions {
  readonly workspaceId?: string;
  readonly eventBus?: DurableEventBus;
  readonly mongoDb?: Db;
  readonly diskPath?: string;
  readonly workforce?: AgentWorkforceStore;
}

export class AgentIntercomStore {
  private readonly workspaceId: string;
  private readonly repo: IntercomRepository;
  private readonly eventBus?: DurableEventBus;
  private readonly workforce?: AgentWorkforceStore;
  private readonly sequence = new Map<string, number>();
  private readonly laneInflight = new Map<string, number>();

  constructor(options: AgentIntercomStoreOptions = {}) {
    this.workspaceId = options.workspaceId || "factoryos";
    this.eventBus = options.eventBus;
    this.workforce = options.workforce;
    this.repo = options.mongoDb
      ? new MongoIntercomRepository(options.mongoDb)
      : options.diskPath
        ? new DiskIntercomRepository(path.join(options.diskPath, "agent_intercom"))
        : new InMemoryIntercomRepository();
  }

  async openSession(
    missionId: string,
    local: CommsPrincipal,
    remoteHello: CommsPeerHello,
    localCapabilities: readonly CommsCapability[],
    localSchemaVersions: readonly string[] = ["1.0.0"],
    heartbeatIntervalMs = 15000,
    deadAfterMs = 45000,
  ): Promise<AgentIntercomSession> {
    const remote = remoteHello.principal;
    if (remoteHello.protocolVersion !== COMMS_PROTOCOL_VERSION) throw new Error("INTERCOM_PROTOCOL_VERSION_MISMATCH");
    const negotiated = this.negotiateCapabilities(localCapabilities, localSchemaVersions, remoteHello);
    if (missionId.trim() === "") throw new Error("INTERCOM_MISSION_REQUIRED");
    if (local.principalId === remote.principalId) throw new Error("INTERCOM_SELF_SESSION_FORBIDDEN");
    await this.assertAgentAvailable(local);
    await this.assertAgentAvailable(remote);

    const sessionId = `intercom_${missionId}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = new Date().toISOString();
    const hello: CommsPeerHello = {
      protocolVersion: COMMS_PROTOCOL_VERSION,
      principal: local,
      sessionId,
      capabilities: negotiated.capabilities,
      supportedSchemaVersions: negotiated.schemaVersions,
      sentAt: now,
    };
    const state = {
      sessionId,
      local,
      remote,
      protocolVersion: COMMS_PROTOCOL_VERSION,
      establishedAt: now,
      lastHeartbeatAt: now,
      heartbeatIntervalMs,
      deadAfterMs,
      capabilities: negotiated.capabilities,
      state: "READY" as const,
    };
    const saved = await this.repo.saveSession({ missionId, hello, state, lastSeenAt: now, version: 1 });
    await this.publish("AGENT_INTERCOM_SESSION_READY", {
      sessionId,
      missionId,
      local,
      remote,
      protocolVersion: COMMS_PROTOCOL_VERSION,
    }, sessionId);
    return saved;
  }

  private negotiateCapabilities(
    localCapabilities: readonly CommsCapability[],
    localSchemaVersions: readonly string[],
    remoteHello: CommsPeerHello,
  ): { capabilities: CommsCapability[]; schemaVersions: string[] } {
    const remoteByName = new Map(remoteHello.capabilities.map((capability) => [capability.name, capability]));
    const capabilities: CommsCapability[] = [];
    for (const local of localCapabilities) {
      if (!local.enabled) continue;
      const remote = remoteByName.get(local.name);
      if (!remote || !remote.enabled || remote.version !== local.version) continue;
      const lanes = local.lanes.filter((lane) => remote.lanes.includes(lane));
      if (lanes.length === 0) continue;
      capabilities.push({
        ...local,
        lanes,
        maxPayloadBytes: Math.min(local.maxPayloadBytes ?? Number.MAX_SAFE_INTEGER, remote.maxPayloadBytes ?? Number.MAX_SAFE_INTEGER),
        maxInflight: Math.min(local.maxInflight ?? Number.MAX_SAFE_INTEGER, remote.maxInflight ?? Number.MAX_SAFE_INTEGER),
      });
    }
    const schemaVersions = localSchemaVersions.filter((version) => remoteHello.supportedSchemaVersions.includes(version));
    if (capabilities.length === 0 || schemaVersions.length === 0) throw new Error("INTERCOM_CAPABILITY_NEGOTIATION_FAILED");
    return { capabilities, schemaVersions };
  }

  async heartbeat(sessionId: string, principalId: string): Promise<AgentIntercomSession> {
    const session = await this.repo.getSession(sessionId);
    if (!session) throw new Error("INTERCOM_SESSION_NOT_FOUND");
    if (session.state.state !== "READY" && session.state.state !== "DEGRADED") throw new Error("INTERCOM_SESSION_CLOSED");
    if (session.state.local.principalId !== principalId && session.state.remote.principalId !== principalId) throw new Error("INTERCOM_HEARTBEAT_UNAUTHORIZED");

    const now = new Date().toISOString();
    const saved = await this.repo.saveSession({
      ...session,
      state: { ...session.state, state: "READY", lastHeartbeatAt: now },
      lastSeenAt: now,
    }, session.version);
    return saved;
  }

  async degradeStaleSessions(nowMs = Date.now()): Promise<number> {
    let changed = 0;
    const sessions = await this.repo.listSessionsAll();
    for (const session of sessions) {
      const last = Date.parse(session.state.lastHeartbeatAt);
      if (session.state.state === "READY" && nowMs - last > session.state.deadAfterMs) {
        const degraded = await this.repo.saveSession({
          ...session,
          state: { ...session.state, state: "DEGRADED" },
          lastSeenAt: session.lastSeenAt,
        }, session.version);
        await this.publish("AGENT_INTERCOM_SESSION_DEGRADED", {
          missionId: degraded.missionId,
          sessionId: degraded.state.sessionId,
          local: degraded.state.local,
          remote: degraded.state.remote,
          lastHeartbeatAt: degraded.state.lastHeartbeatAt,
        }, degraded.state.sessionId, `session-degraded:${degraded.state.sessionId}`);
        changed += 1;
      }
    }
    return changed;
  }

  async send(auth: AgentIntercomAuth, input: AgentIntercomSendInput): Promise<AgentIntercomMessage> {
    const text = input.text.trim();
    if (!text) throw new Error("INTERCOM_MESSAGE_REQUIRED");
    if (text.length > 8000) throw new Error("INTERCOM_MESSAGE_TOO_LARGE");
    const capabilities = auth.allowedCapabilities;
    const now = new Date();
    const expiresAt = input.ttlMs && input.ttlMs > 0 ? new Date(now.getTime() + Math.min(input.ttlMs, 24 * 60 * 60 * 1000)).toISOString() : undefined;
    const payload: AgentIntercomPayload = {
      kind: "MESSAGE",
      text,
      taskId: input.taskId,
    };
    const envelope = this.makeEnvelope(auth.principal, input, payload, expiresAt);
    const authz = this.toCommsAuthorization(auth);
    const decision = admitComms(envelope, authz, capabilities);
    if (!decision.admitted) throw new Error(`INTERCOM_ADMISSION_DENIED:${decision.reasonCode}`);
    if (input.idempotencyKey) {
      const existing = (await this.repo.listMessages(input.missionId))
        .find((message) => message.envelope.meta.causationId === `idempotency:${input.idempotencyKey}`);
      if (existing) return structuredClone(existing);
    }

    await this.assertAgentAvailable(auth.principal);
    await this.assertAgentAvailable(input.target);
    await this.enforceLaneQuota(input.missionId, envelope.meta.lane);

    const createdAt = now.toISOString();
    const message: AgentIntercomMessage = {
      intercomId: `intercom_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
      envelope,
      deliveryState: "CREATED",
      maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 3, 5)),
      createdAt,
      updatedAt: createdAt,
      version: 1,
      receipt: {
        messageId: envelope.meta.messageId,
        state: "CREATED",
        acceptedAt: createdAt,
        attempt: 1,
        retryable: true,
        correlationId: envelope.meta.correlationId,
        causationId: envelope.meta.causationId,
      },
    };
    try {
      const admitted = await this.transitionMessage(message, "admit");
      const queued = await this.transitionMessage(admitted, "queue");
      const dispatched = await this.transitionMessage(queued, "dispatch");

      await this.publish("AGENT_INTERCOM_DELIVERY", {
        intercomId: dispatched.intercomId,
        envelope: dispatched.envelope,
        deliveryState: dispatched.deliveryState,
      }, dispatched.envelope.meta.correlationId, dispatched.envelope.meta.messageId);

      return dispatched;
    } finally {
      await this.releaseLaneQuota(input.missionId, envelope.meta.lane);
    }
  }

  async createDelegation(auth: AgentIntercomAuth, input: AgentDelegationCreateInput): Promise<AgentIntercomDelegationRequest> {
    const objective = input.objective.trim();
    if (!objective) throw new Error("DELEGATION_OBJECTIVE_REQUIRED");
    if (objective.length > 4000) throw new Error("DELEGATION_OBJECTIVE_TOO_LARGE");
    await this.assertAgentAvailable(auth.principal);
    await this.assertAgentAvailable(input.target);
    if (input.requiredCapability && input.target.principalId.startsWith("agent_")) {
      const targetProfile = await this.workforce?.getExecutionProfile(input.target.principalId);
      if (!targetProfile || !targetProfile.allowedCapabilities.includes(input.requiredCapability)) {
        throw new Error("DELEGATION_CAPABILITY_UNAVAILABLE");
      }
    }

    const now = new Date();
    const delegationId = `delegation_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
    const expiresAt = input.ttlMs && input.ttlMs > 0 ? new Date(now.getTime() + Math.min(input.ttlMs, 7 * 24 * 60 * 60 * 1000)).toISOString() : undefined;
    const correlationId = input.correlationId || `delegation_${delegationId}`;

    const delegation: AgentIntercomDelegationRequest = {
      delegationId,
      missionId: input.missionId,
      floorId: input.floorId,
      source: auth.principal,
      target: input.target,
      taskId: input.taskId,
      objective,
      requiredCapability: input.requiredCapability,
      context: input.context ? structuredClone(input.context) : undefined,
      correlationId,
      causationId: input.causationId,
      state: "REQUESTED",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt,
      version: 1,
    };
    const saved = await this.repo.saveDelegation(delegation);
    const messagePayload: AgentIntercomPayload = {
      kind: "DELEGATION_REQUEST",
      taskId: input.taskId,
      delegationId,
      objective,
      requiredCapability: input.requiredCapability,
      context: input.context,
    };
    const envelope = this.makeEnvelope(auth.principal, {
      missionId: input.missionId,
      floorId: input.floorId,
      target: input.target,
      text: objective,
      taskId: input.taskId,
      correlationId,
      causationId: input.causationId,
      priority: "HIGH",
      ttlMs: input.ttlMs,
    }, messagePayload, expiresAt);
    const admission = admitComms(envelope, this.toCommsAuthorization(auth), auth.allowedCapabilities);
    if (!admission.admitted) throw new Error(`DELEGATION_ADMISSION_DENIED:${admission.reasonCode}`);
    const message: AgentIntercomMessage = {
      intercomId: `intercom_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
      envelope,
      deliveryState: "CREATED",
      maxAttempts: 3,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
      receipt: {
        messageId: envelope.meta.messageId,
        state: "ADMITTED",
        acceptedAt: now.toISOString(),
        attempt: 1,
        retryable: true,
        correlationId,
        causationId: input.causationId,
      },
    };
    const admittedMessage = await this.transitionMessage(message, "admit");
    const queued = await this.transitionMessage(admittedMessage, "queue");
    const dispatched = await this.transitionMessage(queued, "dispatch");

    await this.publish("AGENT_INTERCOM_DELIVERY", {
      intercomId: dispatched.intercomId,
      envelope: dispatched.envelope,
      deliveryState: dispatched.deliveryState,
    }, correlationId, dispatched.envelope.meta.messageId);

    await this.publish("AGENT_DELEGATION_REQUESTED", {
      delegationId,
      missionId: input.missionId,
      source: auth.principal,
      target: input.target,
      taskId: input.taskId,
      correlationId,
    }, correlationId, envelope.meta.messageId);
    return saved;
  }

  async respondDelegation(
    auth: AgentIntercomAuth,
    delegationId: string,
    decision: "ACCEPT" | "DECLINE",
    responseText = "",
  ): Promise<AgentIntercomDelegationRequest> {
    const delegation = await this.repo.getDelegation(delegationId);
    if (!delegation) throw new Error("DELEGATION_NOT_FOUND");
    if (delegation.target.principalId !== auth.principal.principalId) throw new Error("DELEGATION_TARGET_UNAUTHORIZED");
    if (delegation.state !== "REQUESTED") throw new Error(`DELEGATION_NOT_REQUESTED:${delegation.state}`);
    if (delegation.expiresAt && Date.parse(delegation.expiresAt) <= Date.now()) {
      return this.expireDelegation(delegation);
    }
    await this.assertAgentAvailable(auth.principal);

    const nextState: AgentIntercomDelegationRequest["state"] = decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    const saved = await this.repo.saveDelegation({
      ...delegation,
      state: nextState,
      updatedAt: new Date().toISOString(),
    }, delegation.version);

    const text = responseText.trim() || (decision === "ACCEPT" ? "Delegation accepted." : "Delegation declined.");
    await this.send(auth, {
      missionId: delegation.missionId,
      floorId: delegation.floorId,
      target: delegation.source,
      text,
      taskId: delegation.taskId,
      correlationId: delegation.correlationId,
      causationId: `delegation:${delegationId}`,
      priority: "HIGH",
      ttlMs: 24 * 60 * 60 * 1000,
    });
    await this.publish("AGENT_DELEGATION_RESPONDED", {
      delegationId,
      state: nextState,
      missionId: delegation.missionId,
      source: delegation.source,
      target: delegation.target,
      correlationId: delegation.correlationId,
      responseText: text,
    }, delegation.correlationId, `delegation:${delegationId}`);
    return saved;
  }

  async cancelDelegation(auth: AgentIntercomAuth, delegationId: string): Promise<AgentIntercomDelegationRequest> {
    const delegation = await this.repo.getDelegation(delegationId);
    if (!delegation) throw new Error("DELEGATION_NOT_FOUND");
    if (delegation.source.principalId !== auth.principal.principalId) throw new Error("DELEGATION_SOURCE_UNAUTHORIZED");
    if (!["REQUESTED", "ACCEPTED"].includes(delegation.state)) throw new Error(`DELEGATION_NOT_CANCELABLE:${delegation.state}`);
    const saved = await this.repo.saveDelegation({ ...delegation, state: "CANCELLED", updatedAt: new Date().toISOString() }, delegation.version);
    await this.publish("AGENT_DELEGATION_CANCELLED", {
      delegationId,
      missionId: delegation.missionId,
      correlationId: delegation.correlationId,
    }, delegation.correlationId, `delegation:${delegationId}`);
    return saved;
  }

  async listDelegations(missionId: string): Promise<AgentIntercomDelegationRequest[]> {
    const items = await this.repo.listDelegations(missionId);
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async replay(missionId: string, cursor?: string, limit = 50): Promise<AgentIntercomReplayPage> {
    const pageSize = Math.max(1, Math.min(limit, 100));
    const items = (await this.repo.listMessages(missionId)).sort((a, b) => {
      const ca = a.createdAt.localeCompare(b.createdAt);
      return ca || a.intercomId.localeCompare(b.intercomId);
    });
    const start = cursor ? items.findIndex((item) => this.encodeCursor(item) === cursor) + 1 : 0;
    const slice = items.slice(Math.max(0, start), Math.max(0, start) + pageSize);
    return {
      items: structuredClone(slice),
      nextCursor: slice.length === pageSize && items.length > start + slice.length ? this.encodeCursor(slice[slice.length - 1]) : undefined,
    };
  }

  async listSessions(missionId: string): Promise<AgentIntercomSession[]> {
    return this.repo.listSessions(missionId);
  }

  async getMessage(intercomId: string): Promise<AgentIntercomMessage | null> { return this.repo.getMessage(intercomId); }

  async ack(intercomId: string, consumerId: string): Promise<AgentIntercomMessage> {
    const message = await this.repo.getMessage(intercomId);
    if (!message) throw new Error("INTERCOM_MESSAGE_NOT_FOUND");
    if (message.deliveryState !== "DELIVERED") throw new Error(`INTERCOM_ACK_INVALID_STATE:${message.deliveryState}`);
    const next = await this.transitionMessage(message, "ack", consumerId);
    return next;
  }

  async deliver(intercomId: string, consumerId: string): Promise<AgentIntercomMessage> {
    const message = await this.repo.getMessage(intercomId);
    if (!message) throw new Error("INTERCOM_MESSAGE_NOT_FOUND");
    if (message.deliveryState !== "DISPATCHED") throw new Error(`INTERCOM_DELIVER_INVALID_STATE:${message.deliveryState}`);
    return this.transitionMessage(message, "deliver", consumerId);
  }

  async nack(intercomId: string, consumerId: string, retryable: boolean, reason?: string): Promise<AgentIntercomMessage> {
    const message = await this.repo.getMessage(intercomId);
    if (!message) throw new Error("INTERCOM_MESSAGE_NOT_FOUND");
    if (!["DELIVERED", "DISPATCHED"].includes(message.deliveryState)) throw new Error(`INTERCOM_NACK_INVALID_STATE:${message.deliveryState}`);
    const current = await this.transitionMessage(message, "nack", consumerId, reason);
    if (retryable && shouldRetry(current.deliveryState, current.receipt.attempt, current.maxAttempts, retryable)) {
      const retrying = await this.transitionMessage(current, "retry", consumerId, reason);
      const redispatched = await this.transitionMessage(retrying, "dispatch", consumerId, reason);
      await this.publish("AGENT_INTERCOM_DELIVERY", {
        intercomId: redispatched.intercomId,
        envelope: redispatched.envelope,
        deliveryState: redispatched.deliveryState,
        attempt: redispatched.receipt.attempt,
      }, redispatched.envelope.meta.correlationId, redispatched.envelope.meta.messageId);
      return redispatched;
    }
    if (retryable) {
      return this.transitionMessage(current, "dead_letter", consumerId, reason);
    }
    return current;
  }

  private async transitionMessage(
    message: AgentIntercomMessage,
    event: "admit" | "queue" | "dispatch" | "deliver" | "ack" | "nack" | "retry" | "expire" | "cancel" | "dead_letter",
    consumerId?: string,
    reason?: string,
  ): Promise<AgentIntercomMessage> {
    const nextState = nextDeliveryState(message.deliveryState, event);
    const now = new Date().toISOString();
    const nextAttempt = event === "retry" ? message.receipt.attempt + 1 : message.receipt.attempt;
    const receipt = {
      ...message.receipt,
      state: nextState,
      deliveredAt: event === "deliver" ? now : message.receipt.deliveredAt,
      ackedAt: event === "ack" ? now : message.receipt.ackedAt,
      consumerId: consumerId || message.receipt.consumerId,
      attempt: nextAttempt,
      retryable: message.receipt.retryable,
      reason: reason || message.receipt.reason,
    };
    const saved = await this.repo.saveMessage({ ...message, deliveryState: nextState, receipt, updatedAt: now }, message.version);
    await this.publish(`AGENT_INTERCOM_DELIVERY_${nextState}`, {
      intercomId: saved.intercomId,
      messageId: saved.envelope.meta.messageId,
      deliveryState: nextState,
      attempt: saved.receipt.attempt,
      consumerId,
      reason,
    }, saved.envelope.meta.correlationId, saved.envelope.meta.messageId);
    return saved;
  }

  private makeEnvelope(source: CommsPrincipal, input: Pick<AgentIntercomSendInput, "missionId" | "floorId" | "target" | "correlationId" | "causationId" | "delivery" | "priority" | "ttlMs">, payload: AgentIntercomPayload, expiresAt?: string): CommsEnvelope<AgentIntercomPayload> {
    const serialized = JSON.stringify(payload);
    const digest = createHash("sha256").update(serialized).digest("hex");
    const command = payload.kind === "DELEGATION_REQUEST" || payload.kind === "DELEGATION_RESPONSE";
    return {
      meta: {
        messageId: `msg_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        messageKind: command ? "COMMAND" : "EVENT",
        protocolVersion: COMMS_PROTOCOL_VERSION,
        interaction: command ? "REQUEST_RESPONSE" : "ONE_WAY",
        lane: command ? "CONTROL" : "EVENT",
        delivery: input.delivery || "AT_LEAST_ONCE",
        priority: input.priority || "NORMAL",
        createdAt: new Date().toISOString(),
        expiresAt,
        source,
        target: input.target,
        scope: { missionId: input.missionId, floorId: input.floorId },
        correlationId: input.correlationId || `corr_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        causationId: input.causationId,
        attempt: 1,
        schemaVersion: "1.0.0",
        contentType: "application/json",
        contentDigestSha256: digest,
      },
      payload,
    };
  }

  private toCommsAuthorization(auth: AgentIntercomAuth): CommsAuthorizationContext {
    const kinds = auth.allowedKinds.flatMap((kind) => kind === "MESSAGE" ? ["EVENT" as const] : ["COMMAND" as const]);
    return {
      principal: auth.principal,
      allowedMissionIds: auth.allowedMissionIds,
      allowedFloorIds: auth.allowedFloorIds,
      allowedLanes: auth.allowedLanes,
      allowedKinds: kinds,
      allowBroadcast: Boolean(auth.allowBroadcast),
      allowedTargetPrincipals: auth.allowedTargetPrincipals,
    };
  }

  private async assertAgentAvailable(principal: CommsPrincipal): Promise<void> {
    if (principal.kind === "WORKER" && principal.principalId.startsWith("agent_")) {
      const active = this.workforce ? await this.workforce.isActiveForExecution(principal.principalId) : false;
      if (!active) throw new Error("INTERCOM_AGENT_INACTIVE");
    }
  }

  private async enforceLaneQuota(missionId: string, lane: CommsEnvelope<unknown>["meta"]["lane"]): Promise<void> {
    const key = missionId + ":" + lane;
    const current = this.laneInflight.get(key) || 0;
    if (current >= 32) throw new Error("INTERCOM_BACKPRESSURE");
    this.laneInflight.set(key, current + 1);
  }

  private async releaseLaneQuota(missionId: string, lane: CommsEnvelope<unknown>["meta"]["lane"]): Promise<void> {
    const key = missionId + ":" + lane;
    const current = this.laneInflight.get(key) || 0;
    this.laneInflight.set(key, Math.max(0, current - 1));
  }

  private encodeCursor(message: AgentIntercomMessage): string {
    return Buffer.from(`${message.createdAt}|${message.intercomId}`).toString("base64url");
  }

  private async expireDelegation(delegation: AgentIntercomDelegationRequest): Promise<AgentIntercomDelegationRequest> {
    return this.repo.saveDelegation({
      ...delegation,
      state: "EXPIRED",
      updatedAt: new Date().toISOString(),
    }, delegation.version);
  }

  private async publish(topic: string, payload: Record<string, unknown>, correlationId: string, causationId?: string): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish(topic as any, payload, {
      source: "agent_intercom",
      correlationId,
      idempotencyKey: causationId ? `${causationId}:${topic}` : undefined,
    });
  }
}
