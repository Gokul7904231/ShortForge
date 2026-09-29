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
import { InMemorySlayerActionLeaseStore, StateStoreSlayerActionLeaseStore, type SlayerActionLeaseStore } from "./SlayerActionLease";
import type { SlayerPrimeStateStore } from "./SlayerPrimeStateStore";
import { SlayerActionPolicy } from "./SlayerActionPolicy";

export class LeaseRevokeEnforcementAdapter implements SlayerEnforcementAdapter {
  readonly adapterId = "lease-manager-revoke-v2";

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
    const rawExpectedLeaseFencingToken = intent.parameters.expectedLeaseFencingToken;
    const expectedLeaseFencingToken =
      rawExpectedLeaseFencingToken === undefined
        ? undefined
        : Number(rawExpectedLeaseFencingToken);

    if (!ownerAgentId) {
      throw new Error("ownerAgentId is required for lease revocation");
    }
    if (
      expectedLeaseFencingToken !== undefined &&
      (!Number.isSafeInteger(expectedLeaseFencingToken) ||
        expectedLeaseFencingToken < 1)
    ) {
      throw new Error("expectedLeaseFencingToken is invalid for fenced lease revocation");
    }

    if (
      authorization.fencingEpoch !== undefined &&
      authorization.fencingEpoch !== lease.fencingToken
    ) {
      throw new Error(
        "Authorization fencing epoch does not match the reserved Slayer action fence."
      );
    }

    const current = await this.leaseManager.getLease(taskId);
    if (!current) throw new Error("Lease " + taskId + " not found");
    if (current.ownerAgentId !== ownerAgentId) {
      throw new Error("Lease owner mismatch for " + taskId);
    }
    if (current.status !== "ACTIVE") {
      throw new Error("Lease " + taskId + " is no longer ACTIVE");
    }
    if (
      expectedLeaseFencingToken !== undefined &&
      current.fencingToken !== undefined &&
      current.fencingToken !== expectedLeaseFencingToken
    ) {
      throw new Error(
        "Worker lease fence changed from " +
          expectedLeaseFencingToken +
          " to " +
          String(current.fencingToken) +
          "; stale action rejected."
      );
    }

    await this.leaseManager.release(taskId, ownerAgentId);

    return {
      taskId,
      previousOwnerAgentId: ownerAgentId,
      previousLeaseFencingToken: expectedLeaseFencingToken,
      leaseStatusBefore: current.status,
      leaseExpiresAtBefore: current.leaseExpiresAt,
      actionLeaseId: lease.actionLeaseId,
      fencingToken: lease.fencingToken,
      leadershipEpoch: lease.leadershipEpoch,
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
        fencingToken: lease?.fencingToken,
      },
    };
  }
}

export class SlayerActionExecutor {
  private readonly actionLeaseStore: SlayerActionLeaseStore;
  private readonly policy: SlayerActionPolicy;
  private readonly adapters: SlayerEnforcementAdapter[];
  private readonly actionLeaseTtlMs: number;
  private readonly leadershipGuard?: SlayerPrimeStateStore;

  constructor(options: {
    actionLeaseStore?: SlayerActionLeaseStore;
    policy?: SlayerActionPolicy;
    adapters: SlayerEnforcementAdapter[];
    actionLeaseTtlMs?: number;
    leadershipGuard?: SlayerPrimeStateStore;
  }) {
    this.actionLeaseStore =
      options.actionLeaseStore ||
      (options.leadershipGuard
        ? new StateStoreSlayerActionLeaseStore(options.leadershipGuard)
        : new InMemorySlayerActionLeaseStore());
    this.policy = options.policy || new SlayerActionPolicy();
    this.adapters = options.adapters;
    this.actionLeaseTtlMs = options.actionLeaseTtlMs ?? 30000;
    this.leadershipGuard = options.leadershipGuard;
  }

  async execute(
    intent: SlayerActionIntent,
    grant: SlayerAuthorizationGrant | undefined,
    holderId: string,
    leadershipEpoch = 0,
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

    if (
      this.leadershipGuard &&
      !(await this.leadershipGuard.isLeadershipCurrent(holderId, leadershipEpoch))
    ) {
      return this.receipt(intent, {
        status: "STALE_ACTION",
        reason: "This Slayer Prime replica no longer holds the current enforcement leadership epoch.",
        started,
        details: { holderId, leadershipEpoch },
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
      Math.min(this.actionLeaseTtlMs, expiryMs - nowMs)
    );

    const actionLease = await this.actionLeaseStore.acquire(
      intent,
      holderId,
      leaseTtl,
      leadershipEpoch
    );

    if (!actionLease) {
      return this.receipt(intent, {
        status: "STALE_ACTION",
        reason:
          "Prime leadership, action ownership, or the action's fencing precondition could not be reserved.",
        started,
        details: { holderId, leadershipEpoch },
      });
    }

    let details: Record<string, unknown> = {};

    try {
      if (
        this.leadershipGuard &&
        !(await this.leadershipGuard.isLeadershipCurrent(holderId, leadershipEpoch))
      ) {
        return this.receipt(intent, {
          status: "STALE_ACTION",
          reason: "Prime lost leadership after action reservation; mutation was fenced before adapter execution.",
          started,
          actionLease,
          details: {},
        });
      }

      const currentActionLease = await this.actionLeaseStore.get(
        actionLease.actionLeaseId
      );
      if (
        !currentActionLease ||
        currentActionLease.status !== "ACTIVE" ||
        currentActionLease.holderId !== holderId ||
        currentActionLease.fencingToken !== actionLease.fencingToken
      ) {
        return this.receipt(intent, {
          status: "STALE_ACTION",
          reason: "The reserved action lease is no longer current; stale mutation was rejected.",
          started,
          actionLease,
          details: {
            currentActionLeaseStatus: currentActionLease?.status || "MISSING",
            currentActionLeaseFence: currentActionLease?.fencingToken,
          },
        });
      }

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
      await this.actionLeaseStore.release(
        actionLease.actionLeaseId,
        holderId,
        actionLease.fencingToken
      );
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
      leadershipEpoch: input.actionLease?.leadershipEpoch,
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
