/**
 * FactoryOS — Repair Lock Manager
 *
 * Backward-compatible resource locks plus fencing-aware mutation leases.
 * The incident is not globally locked; individual mutation resources are.
 */

import type { LeaseManager } from "../leases/LeaseManager";
import type { ResourceLock } from "../contracts/HealerContracts";
import type { MutationLease } from "../governance/FloorGovernanceContracts";

export class RepairLockManager {
  private inMemoryLocks: Map<string, ResourceLock> = new Map();
  private fencingEpochs: Map<string, number> = new Map();
  private leaseManager?: LeaseManager;

  constructor(leaseManager?: LeaseManager) {
    this.leaseManager = leaseManager;
  }

  /**
   * Acquires exclusive lock on a protected resource.
   *
   * Each successful acquisition advances the fencing epoch. A stale holder
   * can therefore be rejected even after its wall-clock lease expires.
   */
  async acquireLock(
    resourceId: string,
    healerId: string,
    caseId: string,
    ttlMs: number = 30000,
    sessionId?: string,
    capabilityGrant?: string,
    actionScope?: readonly string[]
  ): Promise<boolean> {
    const lockKey = `lock:resource:${resourceId}`;

    const now = Date.now();
    const existing = this.inMemoryLocks.get(lockKey);
    if (
      existing &&
      new Date(existing.expiresAt).getTime() > now
    ) {
      return false;
    }

    if (this.leaseManager) {
      const acquired = await this.leaseManager.acquire(lockKey, healerId, ttlMs);
      if (!acquired) return false;
    }

    const fencingEpoch = (this.fencingEpochs.get(resourceId) || 0) + 1;
    this.fencingEpochs.set(resourceId, fencingEpoch);

    const acquiredAt = new Date().toISOString();
    const expiresAt = new Date(now + ttlMs).toISOString();

    this.inMemoryLocks.set(lockKey, {
      resourceId,
      ownerHealerId: healerId,
      caseId,
      acquiredAt,
      expiresAt,
      sessionId,
      fencingEpoch,
      capabilityGrant,
      actionScope: actionScope ? [...actionScope] : undefined,
    });

    return true;
  }

  async acquireMutationLease(
    resourceId: string,
    sessionId: string,
    ownerId: string,
    incidentId: string,
    capabilityGrant: string,
    actionScope: readonly string[],
    ttlMs: number = 30000
  ): Promise<MutationLease | null> {
    const acquired = await this.acquireLock(
      resourceId,
      ownerId,
      incidentId,
      ttlMs,
      sessionId,
      capabilityGrant,
      actionScope
    );
    if (!acquired) return null;

    const lock = this.getLock(resourceId);
    if (!lock?.fencingEpoch) {
      throw new Error(`Missing fencing epoch for mutation lease: ${resourceId}`);
    }

    return {
      resourceId,
      incidentId,
      sessionId,
      ownerId,
      expiresAt: lock.expiresAt,
      fencingEpoch: lock.fencingEpoch,
      capabilityGrant,
      actionScope: [...actionScope],
      acquiredAt: lock.acquiredAt,
    };
  }

  validateMutationLease(lease: MutationLease): { valid: boolean; reason?: string } {
    const lock = this.getLock(lease.resourceId);
    if (!lock) return { valid: false, reason: "lease_not_active" };

    if (lock.ownerHealerId !== lease.ownerId) {
      return { valid: false, reason: "lease_owner_mismatch" };
    }
    if (lock.caseId !== lease.incidentId) {
      return { valid: false, reason: "incident_mismatch" };
    }
    if (lock.sessionId !== lease.sessionId) {
      return { valid: false, reason: "session_mismatch" };
    }
    if (lock.fencingEpoch !== lease.fencingEpoch) {
      return { valid: false, reason: "stale_fencing_epoch" };
    }
    if (lock.capabilityGrant !== lease.capabilityGrant) {
      return { valid: false, reason: "capability_grant_mismatch" };
    }
    if (
      JSON.stringify(lock.actionScope || []) !==
      JSON.stringify(lease.actionScope || [])
    ) {
      return { valid: false, reason: "action_scope_mismatch" };
    }

    return { valid: true };
  }

  async renewMutationLease(
    lease: MutationLease,
    ttlMs: number = 30000
  ): Promise<MutationLease | null> {
    const validation = this.validateMutationLease(lease);
    if (!validation.valid) return null;

    const renewed = await this.renewLock(lease.resourceId, lease.ownerId, ttlMs);
    if (!renewed) return null;

    const lock = this.getLock(lease.resourceId);
    if (!lock?.fencingEpoch) return null;

    return {
      ...lease,
      expiresAt: lock.expiresAt,
      fencingEpoch: lock.fencingEpoch,
    };
  }

  async releaseMutationLease(lease: MutationLease): Promise<boolean> {
    const validation = this.validateMutationLease(lease);
    if (!validation.valid) return false;
    await this.releaseLock(lease.resourceId, lease.ownerId);
    return true;
  }

  async renewLock(
    resourceId: string,
    healerId: string,
    ttlMs: number = 30000
  ): Promise<boolean> {
    const lockKey = `lock:resource:${resourceId}`;
    const existing = this.inMemoryLocks.get(lockKey);
    if (!existing || existing.ownerHealerId !== healerId) {
      return false;
    }

    if (this.leaseManager) {
      const renewed = await this.leaseManager.heartbeat(lockKey, healerId, ttlMs);
      if (!renewed) return false;
    }

    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    this.inMemoryLocks.set(lockKey, {
      ...existing,
      expiresAt,
    });

    return true;
  }

  async releaseLock(resourceId: string, healerId: string): Promise<void> {
    const lockKey = `lock:resource:${resourceId}`;

    if (this.leaseManager) {
      await this.leaseManager.release(lockKey, healerId);
    }

    const existing = this.inMemoryLocks.get(lockKey);
    if (existing && existing.ownerHealerId === healerId) {
      this.inMemoryLocks.delete(lockKey);
    }
  }

  async releaseAllForHealer(healerId: string): Promise<string[]> {
    const released: string[] = [];
    for (const [lockKey, lock] of Array.from(this.inMemoryLocks.entries())) {
      if (lock.ownerHealerId === healerId) {
        this.inMemoryLocks.delete(lockKey);
        if (this.leaseManager) {
          await this.leaseManager.release(lockKey, healerId);
        }
        released.push(lock.resourceId);
      }
    }
    return released;
  }

  isLocked(resourceId: string): boolean {
    return this.getLock(resourceId) !== null;
  }

  getLock(resourceId: string): ResourceLock | null {
    const lockKey = `lock:resource:${resourceId}`;
    const existing = this.inMemoryLocks.get(lockKey);
    if (!existing) return null;
    if (new Date(existing.expiresAt).getTime() <= Date.now()) {
      this.inMemoryLocks.delete(lockKey);
      return null;
    }
    return structuredClone(existing);
  }

  getAllActiveLocks(): ResourceLock[] {
    const now = Date.now();
    const active: ResourceLock[] = [];
    for (const [key, lock] of Array.from(this.inMemoryLocks.entries())) {
      if (new Date(lock.expiresAt).getTime() > now) {
        active.push(structuredClone(lock));
      } else {
        this.inMemoryLocks.delete(key);
      }
    }
    return active;
  }

  getCurrentFencingEpoch(resourceId: string): number {
    return this.fencingEpochs.get(resourceId) || 0;
  }

  clear(): void {
    this.inMemoryLocks.clear();
  }
}
