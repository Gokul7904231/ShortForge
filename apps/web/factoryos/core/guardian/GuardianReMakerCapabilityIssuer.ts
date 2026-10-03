import { createHash, randomUUID } from "node:crypto";
import { LeaseManager } from "../leases/LeaseManager";
import { CapabilityRegistry } from "../cognitive/CapabilityRegistry";
import type {
  ReMakerAction,
  ReMakerAuthorization,
  ReMakerTargetScope,
} from "../remaker/ReMakerContracts";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) =>
    JSON.stringify(key) + ":" + stableStringify(record[key])
  ).join(",") + "}";
}

export interface ReMakerCapabilityGrantRequest {
  readonly floorId: string;
  readonly missionId: string;
  readonly caseId: string;
  readonly repairId: string;
  readonly action: ReMakerAction;
  readonly targetScope: ReMakerTargetScope;
  readonly requestedChangeDigest: string;
  readonly evidenceRefs: readonly string[];
  readonly holderId: string;
  readonly ttlMs: number;
  readonly authorizedBy: string;
}

/**
 * Guardian-only admission adapter for CAP_REMAKER_REPAIR.
 *
 * CapabilityRegistry owns the allowlist/policy check.
 * LeaseManager owns the monotonic fencing token.
 * This class composes those two authorities into the short-lived
 * ReMakerAuthorization consumed by ReMakerEngine.
 */
export class GuardianReMakerCapabilityIssuer {
  public static readonly CAPABILITY_ID = "CAP_REMAKER_REPAIR" as const;

  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly leaseManager: LeaseManager,
  ) {}

  public async issue(
    input: ReMakerCapabilityGrantRequest,
  ): Promise<ReMakerAuthorization> {
    if (input.floorId !== "floor06_rendering") {
      throw new Error("[GuardianReMakerCapabilityIssuer] ReMaker authorization is restricted to Floor 06.");
    }
    if (!input.missionId || !input.caseId || !input.repairId || !input.holderId) {
      throw new Error("[GuardianReMakerCapabilityIssuer] missionId, caseId, repairId and holderId are required.");
    }
    const targetScopeDigest = createHash("sha256")
      .update(stableStringify(input.targetScope))
      .digest("hex");

    if (!/^[a-f0-9]{64}$/i.test(input.requestedChangeDigest)) {
      throw new Error("[GuardianReMakerCapabilityIssuer] requestedChangeDigest must be SHA-256.");
    }
    if (input.evidenceRefs.length === 0) {
      throw new Error("[GuardianReMakerCapabilityIssuer] Evidence is required before ReMaker authorization.");
    }
    if (!Number.isInteger(input.ttlMs) || input.ttlMs < 1000 || input.ttlMs > 300_000) {
      throw new Error("[GuardianReMakerCapabilityIssuer] Grant TTL must be between 1s and 5m.");
    }
    if (!input.authorizedBy.startsWith("guardian_")) {
      throw new Error("[GuardianReMakerCapabilityIssuer] ReMaker grants must be issued by a floor Guardian.");
    }

    const meta = this.registry.get(GuardianReMakerCapabilityIssuer.CAPABILITY_ID);
    if (!meta) {
      throw new Error("[GuardianReMakerCapabilityIssuer] CAP_REMAKER_REPAIR is not registered.");
    }
    if (meta.trainingEligibility !== "ELIGIBLE" || meta.implementationStatus !== "IMPLEMENTED") {
      throw new Error("[GuardianReMakerCapabilityIssuer] ReMaker capability is not admitted for execution.");
    }

    const policy = this.registry.authorizeExecution(
      GuardianReMakerCapabilityIssuer.CAPABILITY_ID,
      {
        role: "FLOOR_GUARDIAN",
        floorId: input.floorId,
        environment: "production",
      },
    );
    if (!policy.authorized) {
      throw new Error("[GuardianReMakerCapabilityIssuer] " + policy.reason);
    }

    const admission = await this.registry.execute({
      requestExecutionId: `capremaker_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      capabilityId: GuardianReMakerCapabilityIssuer.CAPABILITY_ID,
      missionId: input.missionId,
      jobId: `repair_${input.repairId}`,
      floorId: input.floorId,
      initiatedBy: "system",
      callerRole: "FLOOR_GUARDIAN",
      environment: "production",
      timestamp: new Date().toISOString(),
      inputData: {
        repairId: input.repairId,
        missionId: input.missionId,
        caseId: input.caseId,
        requestedChangeDigest: input.requestedChangeDigest,
        action: input.action,
        targetScopeDigest,
        evidenceRefs: [...input.evidenceRefs],
      },
    });

    if (admission.status !== "SUCCESS" || admission.outputData?.admitted !== true) {
      throw new Error(
        "[GuardianReMakerCapabilityIssuer] Capability registry rejected ReMaker admission: " +
        (admission.error || admission.policyRejectionReason || "unknown_reason"),
      );
    }

    const grantId = "remaker_grant_" + randomUUID().replace(/-/g, "").slice(0, 16);
    const leaseAcquired = await this.leaseManager.acquire(
      grantId,
      input.holderId,
      input.ttlMs,
      1,
    );
    if (!leaseAcquired) {
      throw new Error("[GuardianReMakerCapabilityIssuer] Unable to acquire the repair lease.");
    }

    const lease = await this.leaseManager.getLease(grantId);
    if (!lease || lease.status !== "ACTIVE" || lease.fencingToken === undefined) {
      throw new Error("[GuardianReMakerCapabilityIssuer] Repair lease was not materialized with a fencing token.");
    }

    const authorizationDigest = createHash("sha256")
      .update(JSON.stringify({
        capabilityId: GuardianReMakerCapabilityIssuer.CAPABILITY_ID,
        grantId,
        floorId: input.floorId,
        missionId: input.missionId,
        caseId: input.caseId,
        repairId: input.repairId,
        requestedChangeDigest: input.requestedChangeDigest,
        action: input.action,
        targetScopeDigest,
        evidenceRefs: [...input.evidenceRefs],
        holderId: input.holderId,
        fencingToken: lease.fencingToken,
      }))
      .digest("hex");

    return Object.freeze({
      capabilityId: GuardianReMakerCapabilityIssuer.CAPABILITY_ID,
      grantId: `${grantId}_${authorizationDigest.slice(0, 8)}`,
      leaseId: grantId,
      holderId: input.holderId,
      action: input.action,
      targetScopeDigest,
      fencingToken: lease.fencingToken,
      expiresAt: lease.leaseExpiresAt,
      authorizedBy: input.authorizedBy,
    });
  }
}
