import { createHash } from "node:crypto";
import { TimelineIRValidator, type TimelineIR } from "../timeline/TimelineIR";
import { ReMakerImpactAnalyzer } from "./ReMakerImpactAnalyzer";
import type {
  ReMakerExecutionPort,
  ReMakerPlan,
  ReMakerReceipt,
  ReMakerRequest,
} from "./ReMakerContracts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) =>
    JSON.stringify(key) + ":" + stableStringify(record[key])
  ).join(",") + "}";
}

const ACTION_ALIASES: Record<ReMakerRequest["action"], readonly string[]> = {
  REALIGN_SUBTITLE: ["realign subtitle", "patch subtitle", "adjust subtitle timestamps"],
  REPLACE_ASSET: ["replace asset", "substitute asset", "generate original synthetic image/broll"],
  REGENERATE_AUDIO_SEGMENT: ["regenerate audio", "regenerate narration", "regenerate narration-only segment"],
  SHIFT_TIMING: ["shift timing", "adjust timing", "timeline repair"],
  REBUILD_SCENE: ["rebuild scene", "regenerate affected stage", "regenerate scene"],
  RENDER_WINDOW: [
    "render window",
    "surgical partial render",
    "partial rerender",
    "re-render affected region",
    "render affected scenes only",
  ],
};

const TARGET_KINDS: Record<ReMakerRequest["action"], readonly ReMakerRequest["target"]["kind"][]> = {
  REALIGN_SUBTITLE: ["SUBTITLE"],
  REPLACE_ASSET: ["VISUAL_ASSET"],
  REGENERATE_AUDIO_SEGMENT: ["AUDIO"],
  SHIFT_TIMING: ["TIMING", "MULTI_TRACK"],
  REBUILD_SCENE: ["VISUAL_ASSET", "MULTI_TRACK"],
  RENDER_WINDOW: ["RENDER_REGION", "VISUAL_ASSET", "AUDIO", "SUBTITLE", "MULTI_TRACK"],
};

export interface ReMakerPlanInput extends ReMakerRequest {
  readonly timeline: TimelineIR;
}

export class ReMakerEngine {
  private readonly completed = new Map<string, ReMakerReceipt>();

  public plan(input: ReMakerPlanInput): ReMakerPlan {
    this.validateRequest(input);

    const impact = ReMakerImpactAnalyzer.analyze(input.timeline, input.target);

    const idempotencyKey = sha256(stableStringify({
      repairId: input.repairId,
      caseId: input.caseId,
      parentSha256: input.parentArtifact.sha256,
      timelineDigest: input.parentArtifact.timelineDigest,
      action: input.action,
      target: input.target,
      requestedChangeDigest: input.requestedChangeDigest,
    }));

    const planCore = {
      repairId: input.repairId,
      caseId: input.caseId,
      missionId: input.missionId,
      action: input.action,
      target: input.target,
      frameRange: impact.frameRange,
      changedNodeIds: impact.directNodeIds,
      renderSceneIds: impact.renderSceneIds,
      preservedNodeIds: impact.preservedNodeIds,
      preservedNodeFingerprints: impact.preservedNodeFingerprints,
      parentArtifact: input.parentArtifact,
      idempotencyKey,
      maxAttempts: Math.max(1, input.budget.maxAttempts),
      maxDurationMs: Math.max(1000, input.budget.maxDurationMs),
    };

    const planDigest = sha256(stableStringify(planCore));

    return Object.freeze({
      planId: "rplan_" + planDigest.slice(0, 16),
      ...planCore,
      planDigest,
    });
  }

  public async execute(
    input: ReMakerPlanInput,
    port: ReMakerExecutionPort
  ): Promise<ReMakerReceipt> {
    const plan = this.plan(input);
    const prior = this.completed.get(plan.idempotencyKey);
    if (prior) return prior;

    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    let lastProgressFingerprint = "";
    let attempts = 0;

    while (attempts < plan.maxAttempts) {
      attempts += 1;

      if (Date.now() > Date.parse(input.authorization.expiresAt)) {
        return this.finish(this.receipt({
          plan,
          attempts,
          startedAt,
          termination: "AUTHORIZATION_EXPIRED",
          evidenceRefs: input.evidenceRefs,
        }));
      }

      if (Date.now() - startedAtMs >= plan.maxDurationMs) {
        return this.finish(this.receipt({
          plan,
          attempts,
          startedAt,
          termination: "BUDGET_EXHAUSTED",
          evidenceRefs: input.evidenceRefs,
          error: "Repair wall-clock budget exhausted.",
        }));
      }

      let output;
      try {
        output = await port.execute(plan);
      } catch (error) {
        if (attempts >= plan.maxAttempts) {
          return this.finish(this.receipt({
            plan,
            attempts,
            startedAt,
            termination: "EXECUTION_FAILED",
            evidenceRefs: input.evidenceRefs,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
        continue;
      }

      if (Date.now() - startedAtMs >= plan.maxDurationMs) {
        return this.finish(this.receipt({
          plan,
          attempts,
          startedAt,
          termination: "BUDGET_EXHAUSTED",
          evidenceRefs: input.evidenceRefs,
          error: "Repair wall-clock budget exhausted after execution.",
        }));
      }

      const invalidArtifact =
        !isSha256(output.candidateArtifact.sha256) ||
        output.candidateArtifact.byteLength <= 0 ||
        output.candidateArtifact.sha256.toLowerCase() === plan.parentArtifact.sha256.toLowerCase();

      if (invalidArtifact) {
        if (attempts >= plan.maxAttempts) {
          return this.finish(this.receipt({
            plan,
            attempts,
            startedAt,
            termination: "EXECUTION_FAILED",
            evidenceRefs: input.evidenceRefs,
            error: "Execution port returned an invalid or unchanged candidate artifact.",
            candidateArtifact: output.candidateArtifact,
            changedNodeIds: output.changedNodeIds,
            preservedNodeIds: output.preservedNodeIds,
            preservedNodeFingerprints: output.preservedNodeFingerprints,
          }));
        }
        continue;
      }

      if (output.physicalValidation.passed !== true) {
        if (attempts >= plan.maxAttempts) {
          return this.finish(this.receipt({
            plan,
            attempts,
            startedAt,
            termination: "EXECUTION_FAILED",
            evidenceRefs: input.evidenceRefs,
            error: "Candidate artifact did not pass physical validation.",
            candidateArtifact: output.candidateArtifact,
            changedNodeIds: output.changedNodeIds,
            preservedNodeIds: output.preservedNodeIds,
            preservedNodeFingerprints: output.preservedNodeFingerprints,
            rendererReceiptId: output.rendererReceiptId,
          }));
        }
        continue;
      }

      const plannedChanged = new Set(plan.changedNodeIds);
      if (output.changedNodeIds.some((id) => !plannedChanged.has(id))) {
        return this.finish(this.receipt({
          plan,
          attempts,
          startedAt,
          termination: "EXECUTION_FAILED",
          evidenceRefs: input.evidenceRefs,
          error: "Execution reported a node outside the approved changed-node scope.",
          candidateArtifact: output.candidateArtifact,
          changedNodeIds: output.changedNodeIds,
          preservedNodeIds: output.preservedNodeIds,
          preservedNodeFingerprints: output.preservedNodeFingerprints,
          rendererReceiptId: output.rendererReceiptId,
        }));
      }

      for (const required of plan.changedNodeIds) {
        if (!output.changedNodeIds.includes(required)) {
          return this.finish(this.receipt({
            plan,
            attempts,
            startedAt,
            termination: "EXECUTION_FAILED",
            evidenceRefs: input.evidenceRefs,
            error: "Execution did not report every planned changed node.",
            candidateArtifact: output.candidateArtifact,
            changedNodeIds: output.changedNodeIds,
            preservedNodeIds: output.preservedNodeIds,
            preservedNodeFingerprints: output.preservedNodeFingerprints,
            rendererReceiptId: output.rendererReceiptId,
          }));
        }
      }

      for (const preserved of plan.preservedNodeIds) {
        if (!output.preservedNodeIds.includes(preserved)) {
          return this.finish(this.receipt({
            plan,
            attempts,
            startedAt,
            termination: "EXECUTION_FAILED",
            evidenceRefs: input.evidenceRefs,
            error: "Execution failed preserved-node identity invariant.",
            candidateArtifact: output.candidateArtifact,
            changedNodeIds: output.changedNodeIds,
            preservedNodeIds: output.preservedNodeIds,
            preservedNodeFingerprints: output.preservedNodeFingerprints,
            rendererReceiptId: output.rendererReceiptId,
          }));
        }

        if (
          output.preservedNodeFingerprints[preserved] !==
          plan.preservedNodeFingerprints[preserved]
        ) {
          return this.finish(this.receipt({
            plan,
            attempts,
            startedAt,
            termination: "EXECUTION_FAILED",
            evidenceRefs: input.evidenceRefs,
            error: "Execution failed preserved-node fingerprint invariant.",
            candidateArtifact: output.candidateArtifact,
            changedNodeIds: output.changedNodeIds,
            preservedNodeIds: output.preservedNodeIds,
            preservedNodeFingerprints: output.preservedNodeFingerprints,
            rendererReceiptId: output.rendererReceiptId,
          }));
        }
      }

      const progressFingerprint = sha256(stableStringify({
        artifact: output.candidateArtifact.sha256,
        changed: [...output.changedNodeIds].sort(),
        preserved: [...output.preservedNodeIds].sort(),
        preservedFingerprints: output.preservedNodeFingerprints,
      }));

      if (progressFingerprint === lastProgressFingerprint) {
        return this.finish(this.receipt({
          plan,
          attempts,
          startedAt,
          termination: "NO_PROGRESS",
          evidenceRefs: input.evidenceRefs,
          candidateArtifact: output.candidateArtifact,
          changedNodeIds: output.changedNodeIds,
          preservedNodeIds: output.preservedNodeIds,
          preservedNodeFingerprints: output.preservedNodeFingerprints,
          rendererReceiptId: output.rendererReceiptId,
        }));
      }

      lastProgressFingerprint = progressFingerprint;

      return this.finish(this.receipt({
        plan,
        attempts,
        startedAt,
        termination: "COMPLETED",
        evidenceRefs: input.evidenceRefs,
        candidateArtifact: output.candidateArtifact,
        changedNodeIds: output.changedNodeIds,
        preservedNodeIds: output.preservedNodeIds,
        preservedNodeFingerprints: output.preservedNodeFingerprints,
        rendererReceiptId: output.rendererReceiptId,
      }));
    }

    return this.finish(this.receipt({
      plan,
      attempts,
      startedAt,
      termination: "BUDGET_EXHAUSTED",
      evidenceRefs: input.evidenceRefs,
    }));
  }

  private validateRequest(input: ReMakerPlanInput): void {
    const timelineValidation = TimelineIRValidator.validate(input.timeline);
    if (!timelineValidation.valid) {
      throw new Error(
        "[ReMakerEngine] Invalid TimelineIR: " + timelineValidation.errors.join("; ")
      );
    }

    if (!input.repairId || !input.caseId || !input.missionId || !input.policyId) {
      throw new Error("[ReMakerEngine] repairId, caseId, missionId and policyId are required.");
    }

    if (!isSha256(input.parentArtifact.sha256)) {
      throw new Error("[ReMakerEngine] Parent artifact must be bound by a SHA-256 digest.");
    }

    if (input.parentArtifact.byteLength <= 0 || input.parentArtifact.revision < 0) {
      throw new Error("[ReMakerEngine] Parent artifact metadata is invalid.");
    }

    if (!input.parentArtifact.timelineDigest) {
      throw new Error("[ReMakerEngine] Parent TimelineIR digest is required.");
    }

    if (!isSha256(input.requestedChangeDigest)) {
      throw new Error("[ReMakerEngine] requestedChangeDigest must be a SHA-256 digest.");
    }

    if (input.authorization.capabilityId !== "CAP_REMAKER_REPAIR") {
      throw new Error("[ReMakerEngine] Missing CAP_REMAKER_REPAIR authorization.");
    }

    if (!input.authorization.grantId || !input.authorization.authorizedBy) {
      throw new Error("[ReMakerEngine] Authorization grant and issuer are required.");
    }

    if (!input.parentArtifact.casRef) {
      throw new Error("[ReMakerEngine] Production repair requires a CAS-bound parent artifact.");
    }

    if (
      !Number.isInteger(input.authorization.fencingToken) ||
      input.authorization.fencingToken < 0
    ) {
      throw new Error("[ReMakerEngine] Invalid fencing token.");
    }

    if (!Number.isFinite(Date.parse(input.authorization.expiresAt)) ||
        Date.parse(input.authorization.expiresAt) <= Date.now()) {
      throw new Error("[ReMakerEngine] Repair authorization is expired or malformed.");
    }

    if (input.budget.maxAttempts < 1 || input.budget.maxDurationMs < 1000) {
      throw new Error("[ReMakerEngine] Repair budget is invalid.");
    }

    if (!TARGET_KINDS[input.action].includes(input.target.kind)) {
      throw new Error("[ReMakerEngine] Repair action does not match the target kind.");
    }

    if (input.target.frameRangeMs) {
      if (
        !Number.isFinite(input.target.frameRangeMs.startMs) ||
        !Number.isFinite(input.target.frameRangeMs.endMs) ||
        input.target.frameRangeMs.startMs < 0 ||
        input.target.frameRangeMs.endMs <= input.target.frameRangeMs.startMs
      ) {
        throw new Error("[ReMakerEngine] Repair frame range is invalid.");
      }
    }

    if (input.target.region) {
      const r = input.target.region;
      if (
        r.x < 0 || r.y < 0 ||
        r.width <= 0 || r.height <= 0 ||
        r.x + r.width > 1 || r.y + r.height > 1
      ) {
        throw new Error("[ReMakerEngine] Repair region must stay inside normalized [0,1] bounds.");
      }
    }

    if (input.timeline.provenanceDigest !== input.parentArtifact.timelineDigest) {
      throw new Error("[ReMakerEngine] TimelineIR digest does not match the authorized parent artifact.");
    }

    if (input.evidenceRefs.length === 0) {
      throw new Error("[ReMakerEngine] At least one verification evidence reference is required.");
    }

    const aliases = ACTION_ALIASES[input.action];
    const normalizedAllowed = input.allowedActions.map((v) => v.trim().toLowerCase());
    if (!normalizedAllowed.some((allowed) => aliases.some((alias) => allowed.includes(alias)))) {
      throw new Error(
        "[ReMakerEngine] Requested repair action is not present in the authorized allowed action set."
      );
    }

    const normalizedForbidden = input.forbiddenActions.map((v) => v.trim().toLowerCase());
    if (normalizedForbidden.some((forbidden) => aliases.some((alias) => forbidden.includes(alias)))) {
      throw new Error("[ReMakerEngine] Requested repair action is explicitly forbidden.");
    }
  }

  private receipt(args: {
    plan: ReMakerPlan;
    attempts: number;
    startedAt: string;
    termination: ReMakerReceipt["termination"];
    evidenceRefs: readonly string[];
    candidateArtifact?: ReMakerReceipt["candidateArtifact"];
    changedNodeIds?: readonly string[];
    preservedNodeIds?: readonly string[];
    preservedNodeFingerprints?: Readonly<Record<string, string>>;
    rendererReceiptId?: string;
    error?: string;
  }): ReMakerReceipt {
    return Object.freeze({
      repairId: args.plan.repairId,
      caseId: args.plan.caseId,
      planId: args.plan.planId,
      idempotencyKey: args.plan.idempotencyKey,
      parentArtifactId: args.plan.parentArtifact.artifactId,
      parentArtifactSha256: args.plan.parentArtifact.sha256,
      candidateArtifact: args.candidateArtifact,
      changedNodeIds: Object.freeze([...(args.changedNodeIds || args.plan.changedNodeIds)]),
      renderSceneIds: args.plan.renderSceneIds,
      preservedNodeIds: Object.freeze([...(args.preservedNodeIds || args.plan.preservedNodeIds)]),
      preservedNodeFingerprints: Object.freeze(
        args.preservedNodeFingerprints || args.plan.preservedNodeFingerprints
      ),
      attempts: args.attempts,
      termination: args.termination,
      startedAt: args.startedAt,
      completedAt: new Date().toISOString(),
      f07Required: true,
      evidenceRefs: Object.freeze([...args.evidenceRefs]),
      rendererReceiptId: args.rendererReceiptId,
      error: args.error,
    });
  }

  private finish(receipt: ReMakerReceipt): ReMakerReceipt {
    if (receipt.termination === "COMPLETED") {
      this.completed.set(receipt.idempotencyKey, receipt);
    }
    return receipt;
  }
}
