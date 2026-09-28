import { randomUUID } from "node:crypto";
import type {
  HealingCheckpoint,
  HealingSessionState,
  JointHealingSessionRecord,
  MutationLease,
} from "./FloorGovernanceContracts";
import type { JointHealingSessionStore } from "./JointHealingSessionStore";

interface MutableSession {
  record: JointHealingSessionRecord;
  mutationLeases: Map<string, MutationLease>;
  fencingEpochByResource: Map<string, number>;
}

export class JointHealingSessionManager {
  private readonly sessions = new Map<string, MutableSession>();
  private readonly store?: JointHealingSessionStore;

  constructor(store?: JointHealingSessionStore) {
    this.store = store;
    for (const record of store?.loadAll() || []) {
      const recovered: MutableSession = {
        record: structuredClone(record),
        mutationLeases: new Map(),
        fencingEpochByResource: new Map(Object.entries(record.fencingEpochByResource).map(([key, value]) => [key, Number(value)])),
      };
      // A process restart invalidates in-flight mutation leases. Never resume
      // physical healing automatically from a stale session.
      if (recovered.record.state === "HEALING" || recovered.record.state === "VERIFYING") {
        recovered.record = {
          ...recovered.record,
          state: "ESCALATED",
          updatedAt: new Date().toISOString(),
        };
        this.store?.save(recovered.record);
      }
      this.sessions.set(record.sessionId, recovered);
    }
  }

  createSession(
    incidentId: string,
    floorId: string,
    leadHealerId: string,
    partnerHealerId: string
  ): JointHealingSessionRecord {
    if (leadHealerId === partnerHealerId) {
      throw new Error("Joint healing requires two distinct healer identities");
    }

    const now = new Date().toISOString();
    const sessionId = `jhs_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const record: JointHealingSessionRecord = {
      sessionId,
      incidentId,
      floorId,
      leadHealerId,
      partnerHealerId,
      state: "CREATED",
      createdAt: now,
      updatedAt: now,
      fencingEpochByResource: {},
      checkpoints: [],
    };

    this.sessions.set(sessionId, {
      record,
      mutationLeases: new Map(),
      fencingEpochByResource: new Map(),
    });
    this.store?.save(record);
    return structuredClone(record);
  }

  private getSession(sessionId: string): MutableSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Joint healing session not found: ${sessionId}`);
    return session;
  }

  transition(sessionId: string, state: HealingSessionState): JointHealingSessionRecord {
    const session = this.getSession(sessionId);
    const allowed: Record<HealingSessionState, HealingSessionState[]> = {
      CREATED: ["DIAGNOSING", "ESCALATED", "FAILED"],
      DIAGNOSING: ["PLANNED", "ESCALATED", "FAILED"],
      PLANNED: ["HEALING", "ESCALATED", "FAILED"],
      HEALING: ["VERIFYING", "ESCALATED", "FAILED"],
      VERIFYING: ["COMPLETED", "HEALING", "ESCALATED", "FAILED"],
      COMPLETED: [],
      FAILED: ["DIAGNOSING", "ESCALATED"],
      ESCALATED: ["DIAGNOSING", "FAILED"],
    };

    if (!allowed[session.record.state].includes(state)) {
      throw new Error(
        `Invalid healing session transition ${session.record.state} -> ${state}`
      );
    }

    session.record = {
      ...session.record,
      state,
      updatedAt: new Date().toISOString(),
    };
    this.store?.save(session.record);
    return structuredClone(session.record);
  }

  acquireMutationLease(
    sessionId: string,
    resourceId: string,
    ownerId: string,
    capabilityGrant: string,
    actionScope: readonly string[],
    ttlMs = 30_000
  ): MutationLease {
    const session = this.getSession(sessionId);
    if (
      ownerId !== session.record.leadHealerId &&
      ownerId !== session.record.partnerHealerId
    ) {
      throw new Error("Mutation owner is not a member of the joint healing session");
    }

    const existing = session.mutationLeases.get(resourceId);
    if (existing && new Date(existing.expiresAt).getTime() > Date.now()) {
      throw new Error(`Mutation resource is already leased: ${resourceId}`);
    }

    const nextEpoch = (session.fencingEpochByResource.get(resourceId) || 0) + 1;
    session.fencingEpochByResource.set(resourceId, nextEpoch);

    const acquiredAt = new Date().toISOString();
    const lease: MutationLease = {
      resourceId,
      incidentId: session.record.incidentId,
      sessionId,
      ownerId,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      fencingEpoch: nextEpoch,
      capabilityGrant,
      actionScope: [...actionScope],
      acquiredAt,
    };

    session.mutationLeases.set(resourceId, lease);
    session.record = {
      ...session.record,
      fencingEpochByResource: Object.fromEntries(session.fencingEpochByResource.entries()),
      updatedAt: acquiredAt,
    };

    this.store?.save(session.record);
    return structuredClone(lease);
  }

  noteMutationLease(lease: MutationLease): void {
    const session = this.getSession(lease.sessionId);
    session.mutationLeases.set(lease.resourceId, structuredClone(lease));
    const currentEpoch = session.fencingEpochByResource.get(lease.resourceId) || 0;
    if (lease.fencingEpoch > currentEpoch) {
      session.fencingEpochByResource.set(lease.resourceId, lease.fencingEpoch);
    }
    session.record = {
      ...session.record,
      fencingEpochByResource: Object.fromEntries(session.fencingEpochByResource.entries()),
      updatedAt: new Date().toISOString(),
    };
    this.store?.save(session.record);
  }

  validateMutationLease(lease: MutationLease): { valid: boolean; reason?: string } {
    const session = this.sessions.get(lease.sessionId);
    if (!session) return { valid: false, reason: "session_not_found" };

    const current = session.mutationLeases.get(lease.resourceId);
    if (!current) return { valid: false, reason: "lease_not_active" };

    if (current.ownerId !== lease.ownerId) {
      return { valid: false, reason: "lease_owner_mismatch" };
    }

    if (current.fencingEpoch !== lease.fencingEpoch) {
      return { valid: false, reason: "stale_fencing_epoch" };
    }

    if (new Date(current.expiresAt).getTime() <= Date.now()) {
      return { valid: false, reason: "lease_expired" };
    }

    return { valid: true };
  }

  releaseMutationLease(lease: MutationLease): boolean {
    const validation = this.validateMutationLease(lease);
    if (!validation.valid) return false;

    const session = this.getSession(lease.sessionId);
    session.mutationLeases.delete(lease.resourceId);
    session.record = {
      ...session.record,
      updatedAt: new Date().toISOString(),
    };
    this.store?.save(session.record);
    return true;
  }

  checkpoint(
    sessionId: string,
    state: HealingSessionState,
    evidenceRefs: readonly string[],
    actionIds: readonly string[]
  ): HealingCheckpoint {
    const session = this.getSession(sessionId);
    const checkpoint: HealingCheckpoint = {
      checkpointId: `hcp_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      sessionId,
      sequence: session.record.checkpoints.length + 1,
      state,
      evidenceRefs: [...evidenceRefs],
      actionIds: [...actionIds],
      createdAt: new Date().toISOString(),
    };

    session.record = {
      ...session.record,
      state,
      updatedAt: checkpoint.createdAt,
      checkpoints: [...session.record.checkpoints, checkpoint],
    };

    this.store?.save(session.record);
    return structuredClone(checkpoint);
  }

  complete(
    sessionId: string,
    verificationPassed: boolean,
    guardianClosureAuthorized: boolean
  ): JointHealingSessionRecord {
    if (!verificationPassed) {
      throw new Error("Joint healing cannot complete without independent verification");
    }
    if (!guardianClosureAuthorized) {
      throw new Error("Joint healing cannot complete without Guardian closure authorization");
    }
    return this.transition(sessionId, "COMPLETED");
  }

  get(sessionId: string): JointHealingSessionRecord | undefined {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session.record) : undefined;
  }
}
