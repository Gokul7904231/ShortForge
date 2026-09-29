import { randomUUID } from "node:crypto";
import type { LeaseManager } from "../../leases/LeaseManager";
import type {
  SlayerActionIntent,
  SlayerActionLease,
  SlayerAuthorizationGrant,
  SlayerEnforcementAdapter,
  SlayerEnforcementReceipt,
  SlayerPrimeAction,
} from "../../contracts/SlayerPrimeContracts";
import { InMemorySlayerActionLeaseStore, type SlayerActionLeaseStore } from "./SlayerActionLease";
import { SlayerActionPolicy } from "./SlayerActionPolicy";

export class LeaseRevokeEnforcementAdapter implements SlayerEnforcementAdapter {
  readonly adapterId = "lease-manager-revoke-v1";

  constructor(private readonly leaseManager: LeaseManager) {}

  supports(action: SlayerPrimeAction): boolean {
    return action === "REVOKE_LEASE";
  }

  async execute(
    intent: SlayerActionIntent,
    authorization: SlayerAuthorizationGrant,
    lease: SlayerActionLease
  ): Promise<Record<string, unknown>> {
    const taskId = String(intent.parameters.taskId || intent.targetId);
    const ownerAgentId = String(intent.parameters.ownerAgentId || "");

    if (!ownerAgentId) {
      throw new Error("ownerAgentId is required for lease revocation");
    }

    const current = await this.leaseManager.getLease(taskId);
    if (!current) {
      throw new Error("Lease " + taskId + " not found");
    }

    if (current.ownerAgentId !== ownerAgentId) {
      throw new Error("Lease owner mismatch for " + taskId);
    }

    if (current.status !== "ACTIVE") {
      throw new Error("Lease " + taskId + " is no longer ACTIVE");
    }

    await this.leaseManager.release(taskId, ownerAgentId);

    return {
      taskId,
      previousOwnerAgentId: ownerAgentId,
      leaseStatusBefore: current.status,
      leaseExpiresAtBefore: current.leaseExpiresAt,
      actionLeaseId: lease.actionLeaseId,
      fencingToken: lease.fencingToken,
      authorizedBy: authorization.authorizedBy,
    };
  }

  async verify(
    intent: SlayerActionIntent,
    _authorization: SlayerAuthorizationGrant,
    _lease: SlayerActionLease,
    _executionDetails: Record<string, unknown>
  ): Promise<{
    verified: boolean;
    reason: string;
    observedPostcondition: Record<string, unknown>;
  }> {
    const taskId = String(intent.parameters.taskId || intent.targetId);
    const lease = await this.leaseManager.getLease(taskId);
    const verified = lease !== null && lease.status === "RELEASED";

    return {
      verified,
      reason: verified
        ? "Lease " + taskId + " is independently observed as RELEASED."
        : "Lease " + taskId + " was not observed as RELEASED.",
      observedPostcondition: {
        taskId,
        leaseStatus: lease?.status || "MISSING",
        ownerAgentId: lease?.ownerAgentId,
      },
    };
  }
}

/**
 * Transaction:
 * preconditions -> authorization -> action lease/fencing -> execute
 * -> postcondition -> receipt.
 */
export class SlayerActionExecutor {
  private readonly actionLeaseStore: SlayerActionLeaseStore;
  private readonly policy: SlayerActionPolicy;
  private readonly adapters: SlayerEnforcementAdapter[];
  private readonly actionLeaseTtlMs: number;

  constructor(options: {
    actionLeaseStore?: SlayerActionLeaseStore;
    policy?: SlayerActionPolicy;
    adapters: SlayerEnforcementAdapter[];
    actionLeaseTtlMs?: number;
  }) {
    this.actionLeaseStore =
      options.actionLeaseStore || new InMemorySlayerActionLeaseStore();
    this.policy = options.policy || new SlayerActionPolicy();
    this.adapters = options.adapters;
    this.actionLeaseTtlMs = options.actionLeaseTtlMs ?? 30000;
  }

  async execute(
    intent: SlayerActionIntent,
    grant: SlayerAuthorizationGrant | undefined,
    holderId: string,
    now: string = new Date().toISOString()
  ): Promise<SlayerEnforcementReceipt> {
    const started = new Date(now).toISOString();
    const policyDecision = this.policy.evaluate(intent, grant, now);

    if (!policyDecision.allowed) {
      return this.receipt(intent, {
        status: "REJECTED",
        reason: policyDecision.reason,
        started,
        details: { risk: policyDecision.risk },
      });
    }

    const adapter = this.adapters.find((candidate) => candidate.supports(intent.action));
    if (!adapter) {
      return this.receipt(intent, {
        status: "FAILED",
        reason: "No enforcement adapter is registered for " + intent.action + ".",
        started,
        details: { risk: policyDecision.risk },
      });
    }

    const nowMs = new Date(now).getTime();
    const expiryMs = new Date(intent.expiresAt).getTime();
    if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) {
      return this.receipt(intent, {
        status: "STALE_ACTION",
        reason: "Action intent is expired before reservation.",
        started,
        details: {},
      });
    }

    const leaseTtl = Math.max(
      1,
      Math.min(this.actionLeaseTtlMs, expiryMs - Date.now())
    );

    const actionLease = await this.actionLeaseStore.acquire(
      intent,
      holderId,
      leaseTtl
    );

    if (!actionLease) {
      return this.receipt(intent, {
        status: "STALE_ACTION",
        reason: "Another Slayer Prime instance already owns the action lease.",
        started,
        details: {},
      });
    }

    let details: Record<string, unknown> = {};

    try {
      details = await adapter.execute(intent, grant!, actionLease);
      const verification = await adapter.verify(
        intent,
        grant!,
        actionLease,
        details
      );

      if (!verification.verified) {
        return this.receipt(intent, {
          status: "VERIFICATION_FAILED",
          reason: verification.reason,
          started,
          actionLease,
          details: {
            ...details,
            observedPostcondition: verification.observedPostcondition,
          },
        });
      }

      return this.receipt(intent, {
        status: "VERIFIED",
        reason: verification.reason,
        started,
        actionLease,
        details: {
          ...details,
          observedPostcondition: verification.observedPostcondition,
        },
      });
    } catch (error) {
      return this.receipt(intent, {
        status: "FAILED",
        reason: error instanceof Error ? error.message : String(error),
        started,
        actionLease,
        details,
      });
    } finally {
      await this.actionLeaseStore.release(actionLease.actionLeaseId);
    }
  }

  getActionLease(actionLeaseId: string): Promise<SlayerActionLease | null> {
    return this.actionLeaseStore.get(actionLeaseId);
  }

  private receipt(
    intent: SlayerActionIntent,
    input: {
      status: SlayerEnforcementReceipt["status"];
      reason: string;
      started: string;
      details: Record<string, unknown>;
      actionLease?: SlayerActionLease;
    }
  ): SlayerEnforcementReceipt {
    const finished = new Date().toISOString();

    return {
      receiptId:
        "slayreceipt_" + randomUUID().replace(/-/g, "").slice(0, 16),
      intentId: intent.intentId,
      incidentId: intent.incidentId,
      action: intent.action,
      scope: intent.scope,
      targetId: intent.targetId,
      actionLeaseId: input.actionLease?.actionLeaseId,
      fencingToken: input.actionLease?.fencingToken,
      status: input.status,
      reason: input.reason,
      executionStartedAt: input.started,
      executionFinishedAt: finished,
      details: input.details,
      containmentProof: input.actionLease
        ? {
            proofId:
              "slayproof_" + randomUUID().replace(/-/g, "").slice(0, 16),
            actionLeaseId: input.actionLease.actionLeaseId,
            action: intent.action,
            targetId: intent.targetId,
            expectedPostcondition:
              "The requested action is reflected in authoritative control-plane state.",
            observedPostcondition:
              (input.details.observedPostcondition as Record<string, unknown>) ||
              {},
            verified: input.status === "VERIFIED",
            verifiedAt: finished,
            verifier: "slayer-prime-postcondition-check",
          }
        : undefined,
    };
  }
}
