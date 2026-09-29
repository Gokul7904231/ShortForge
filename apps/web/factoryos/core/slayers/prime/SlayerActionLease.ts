import { randomUUID } from "node:crypto";
import type {
  SlayerActionIntent,
  SlayerActionLease,
} from "../../contracts/SlayerPrimeContracts";

export interface SlayerActionLeaseStore {
  acquire(
    intent: SlayerActionIntent,
    holderId: string,
    ttlMs: number
  ): Promise<SlayerActionLease | null>;
  get(actionLeaseId: string): Promise<SlayerActionLease | null>;
  release(actionLeaseId: string): Promise<void>;
}

/**
 * Separate from worker/task leases:
 * worker lease = permission to execute work;
 * action lease = ownership of the enforcement mutation.
 */
export class InMemorySlayerActionLeaseStore implements SlayerActionLeaseStore {
  private readonly leases = new Map<string, SlayerActionLease>();
  private readonly activeByIntent = new Map<string, string>();
  private nextFencingToken = 1;

  async acquire(
    intent: SlayerActionIntent,
    holderId: string,
    ttlMs: number
  ): Promise<SlayerActionLease | null> {
    const existingId = this.activeByIntent.get(intent.intentId);
    if (existingId) {
      const existing = this.leases.get(existingId);
      if (
        existing &&
        existing.status === "ACTIVE" &&
        new Date(existing.expiresAt).getTime() > Date.now()
      ) {
        return null;
      }
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

    if (
      lease.status === "ACTIVE" &&
      new Date(lease.expiresAt).getTime() <= Date.now()
    ) {
      const expired = { ...lease, status: "EXPIRED" as const };
      this.leases.set(actionLeaseId, expired);
      if (this.activeByIntent.get(lease.intentId) === actionLeaseId) {
        this.activeByIntent.delete(lease.intentId);
      }
      return structuredClone(expired);
    }

    return structuredClone(lease);
  }

  async release(actionLeaseId: string): Promise<void> {
    const lease = this.leases.get(actionLeaseId);
    if (!lease) return;

    const released = { ...lease, status: "RELEASED" as const };
    this.leases.set(actionLeaseId, released);
    if (this.activeByIntent.get(lease.intentId) === actionLeaseId) {
      this.activeByIntent.delete(lease.intentId);
    }
  }
}
