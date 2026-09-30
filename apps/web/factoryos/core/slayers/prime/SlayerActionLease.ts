import { randomUUID } from "node:crypto";
import type {
  SlayerActionIntent,
  SlayerActionLease,
} from "../../contracts/SlayerPrimeContracts";
import type {
  SlayerPrimeStateStore,
} from "./SlayerPrimeStateStore";

export interface SlayerActionLeaseStore {
  acquire(
    intent: SlayerActionIntent,
    holderId: string,
    ttlMs: number,
    leadershipEpoch?: number
  ): Promise<SlayerActionLease | null>;
  get(actionLeaseId: string): Promise<SlayerActionLease | null>;
  release(actionLeaseId: string, holderId?: string, fencingToken?: number): Promise<void>;
}

/**
 * Compatibility adapter for Prime's historical action-lease contract.
 * Production instances should back this with SlayerPrimeStateStore.
 */
export class StateStoreSlayerActionLeaseStore implements SlayerActionLeaseStore {
  constructor(private readonly stateStore: SlayerPrimeStateStore) {}

  acquire(
    intent: SlayerActionIntent,
    holderId: string,
    ttlMs: number,
    leadershipEpoch = 0
  ): Promise<SlayerActionLease | null> {
    return this.stateStore.acquireActionLease(intent, holderId, ttlMs, leadershipEpoch);
  }

  get(actionLeaseId: string): Promise<SlayerActionLease | null> {
    return this.stateStore.getActionLease(actionLeaseId);
  }

  release(actionLeaseId: string, holderId?: string, fencingToken?: number): Promise<void> {
    return this.stateStore.releaseActionLease(actionLeaseId, holderId, fencingToken);
  }
}

/** Fast single-process implementation used by isolated unit tests only. */
export class InMemorySlayerActionLeaseStore implements SlayerActionLeaseStore {
  private readonly leases = new Map<string, SlayerActionLease>();
  private readonly activeByIntent = new Map<string, string>();
  private nextFencingToken = 1;

  async acquire(
    intent: SlayerActionIntent,
    holderId: string,
    ttlMs: number,
    leadershipEpoch = 0
  ): Promise<SlayerActionLease | null> {
    const existingId = this.activeByIntent.get(intent.intentId);
    if (existingId) {
      const existing = this.leases.get(existingId);
      if (
        existing &&
        existing.status === "ACTIVE" &&
        new Date(existing.expiresAt).getTime() > Date.now()
      ) return null;
    }

    const now = new Date();
    const lease: SlayerActionLease = {
      actionLeaseId: "slaylease_" + randomUUID().replace(/-/g, "").slice(0, 16),
      intentId: intent.intentId,
      incidentId: intent.incidentId,
      action: intent.action,
      targetId: intent.targetId,
      holderId,
      fencingToken: this.nextFencingToken++,
      leadershipEpoch,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      status: "ACTIVE",
    };

    this.leases.set(lease.actionLeaseId, lease);
    this.activeByIntent.set(intent.intentId, lease.actionLeaseId);
    return structuredClone(lease);
  }

  async get(actionLeaseId: string): Promise<SlayerActionLease | null> {
    const lease = this.leases.get(actionLeaseId);
    if (!lease) return null;
    if (lease.status === "ACTIVE" && new Date(lease.expiresAt).getTime() <= Date.now()) {
      const expired = { ...lease, status: "EXPIRED" as const };
      this.leases.set(actionLeaseId, expired);
      if (this.activeByIntent.get(lease.intentId) === actionLeaseId) {
        this.activeByIntent.delete(lease.intentId);
      }
      return structuredClone(expired);
    }
    return structuredClone(lease);
  }

  async release(actionLeaseId: string, holderId?: string, fencingToken?: number): Promise<void> {
    const lease = this.leases.get(actionLeaseId);
    if (!lease || lease.status !== "ACTIVE") return;
    if (holderId && lease.holderId !== holderId) return;
    if (fencingToken !== undefined && lease.fencingToken !== fencingToken) return;

    this.leases.set(actionLeaseId, { ...lease, status: "RELEASED" });
    if (this.activeByIntent.get(lease.intentId) === actionLeaseId) {
      this.activeByIntent.delete(lease.intentId);
    }
  }
}
