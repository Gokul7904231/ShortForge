import { createHash } from "node:crypto";
import type { TimelineIR } from "../timeline/TimelineIR";
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

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.keys(v as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (v as Record<string, unknown>)[key];
            return acc;
          }, {})
      : v
  );
}

const ACTION_ALIASES: Record<string, readonly string[]> = {
  REALIGN_SUBTITLE: ["realign subtitle", "patch subtitle", "adjust subtitle timestamps"],
  REPLACE_ASSET: ["replace asset", "substitute asset", "generate original synthetic image/broll"],
  REGENERATE_AUDIO_SEGMENT: ["regenerate audio", "regenerate narration", "regenerate narration-only segment"],
  SHIFT_TIMING: ["shift timing", "adjust timing", "timeline repair"],
  REBUILD_SCENE: ["rebuild scene", "regenerate affected stage", "regenerate scene"],
  RENDER_WINDOW: ["render window", "surgical partial render", "partial rerender", "re-render affected region"],
};

export interface ReMakerPlanInput extends ReMakerRequest {
  readonly timeline: TimelineIR;
}

export class ReMakerEngine {
  private readonly completed = new Map<string, ReMakerReceipt>();

  public plan(input: ReMakerPlanInput): ReMakerPlan {
    this.validateRequest(input);

    const impact = ReMakerImpactAnalyzer.analyze(input.timeline, input.target);
    const idempotencyKey = sha256(
      canonicalJson({
        repairId: input.repairId,
        caseId: input.caseId,
        parentSha256: input.parentArtifact.sha256,
        timelineDigest: input.parentArtifact.timelineDigest,
        action: input.action,
        target: input.target,
        requestedChangeDigest: input.requestedChangeDigest,
      })
    );

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
      parentArtifact: input.parentArtifact,
      idempotencyKey,
      maxAttempts: Math.max(1, input.budget.maxAttempts),
      maxDurationMs: Math.max(1000, input.budget.maxDurationMs),
    };

    const planDigest = sha256(canonicalJson(planCore));
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

    const startedAt = new Date().toISOString();
    let lastProgressFingerprint = "";
    let attempts = 0;

    while (attempts < plan.maxAttempts) {
      attempts += 1;

      if (Date.now() > Date.parse(input.authorization.expiresAt)) {
        return this.finish({
          repairId: plan.repairId,
          caseId: plan.caseId,
          planId: plan.planId,
          idempotencyKey: plan.idempotencyKey,
          parentArtifactId: plan.parentArtifact.artifactId,
          parentArtifactSha256: plan.parentArtifact.sha256,
          changedNodeIds: plan.changedNodeIds,
          renderSceneIds: plan.renderSceneIds,
          preservedNodeIds: plan.preservedNodeIds,
          attempts,
          termination: "AUTHORIZATION_EXPIRED",
          startedAt,
          completedAt: new Date().toISOString(),
          f07Required: true,
          evidenceRefs: input.evidenceRefs,
        });
      }

      let output;
      try {
        output = await port.execute(plan);
      } catch (error) {
        if (attempts >= plan.maxAttempts) {
          return this.finish({
            repairId: plan.repairId,
            caseId: plan.caseId,
            planId: plan.planId,
            idempotencyKey: plan.idempotencyKey,
            parentArtifactId: plan.parentArtifact.artifactId,
            parentArtifactSha256: plan.parentArtifact.sha256,
            changedNodeIds: plan.changedNodeIds,
            renderSceneIds: plan.renderSceneIds,
            preservedNodeIds: plan.preservedNodeIds,
            attempts,
            termination: "EXECUTION_FAILED",
            startedAt,
            completedAt: new Date().toISOString(),
            f07Required: true,
            evidenceRefs: input.evidenceRefs,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }

      if (Date.now() - Date.parse(startedAt) > plan.maxDurationMs) {
        return this.finish({
          repairId: plan.repairId,
          caseId: plan.caseId,
          planId: plan.planId,
          idempotencyKey: plan.idempotencyKey,
          parentArtifactId: plan.parentArtifact.artifactId,
          parentArtifactSha256: plan.parentArtifact.sha256,
          changedNodeIds: plan.changedNodeIds,
          renderSceneIds: plan.renderSceneIds,
          preservedNodeIds: plan.preservedNodeIds,
          attempts,
          termination: "BUDGET_EXHAUSTED",
          startedAt,
          completedAt: new Date().toISOString(),
          f07Required: true,
          evidenceRefs: input.evidenceRefs,
          error: "Repair wall-clock budget exhausted.",
        });
      }

      if (
        !isSha256(output.candidateArtifact.sha256) ||
        output.candidateArtifact.byteLength <= 0 ||
        output.candidateArtifact.sha256.toLowerCase() === plan.parentArtifact.sha256.toLowerCase()
      ) {
        if (attempts >= plan.maxAttempts) {
          return this.finish({
            repairId: plan.repairId,
            caseId: plan.caseId,
            planId: plan.planId,
            idempotencyKey: plan.idempotencyKey,
            parentArtifactId: plan.parentArtifact.artifactId,
            parentArtifactSha256: plan.parentArtifact.sha256,
            changedNodeIds: plan.changedNodeIds,
            renderSceneIds: plan.renderSceneIds,
            preservedNodeIds: plan.preservedNodeIds,
            attempts,
            termination: "EXECUTION_FAILED",
            startedAt,
            completedAt: new Date().toISOString(),
            f07Required: true,
            evidenceRefs: input.evidenceRefs,
            error: "Execution port returned an invalid candidate artifact.",
          });
        }
        continue;
      }

      const actualChanged = new Set(output.changedNodeIds);
      for (const required of plan.changedNodeIds) {
        if (!actualChanged.has(required)) {
          return this.finish({
            repairId: plan.repairId,
            caseId: plan.caseId,
            planId: plan.planId,
            idempotencyKey: plan.idempotencyKey,
            parentArtifactId: plan.parentArtifact.artifactId,
            parentArtifactSha256: plan.parentArtifact.sha256,
            candidateArtifact: output.candidateArtifact,
            changedNodeIds: output.changedNodeIds,
            renderSceneIds: plan.renderSceneIds,
            preservedNodeIds: output.preservedNodeIds,
            attempts,
            termination: "EXECUTION_FAILED",
            startedAt,
            completedAt: new Date().toISOString(),
            f07Required: true,
            evidenceRefs: input.evidenceRefs,
            error: "Execution did not report every planned changed node.",
          });
        }
      }

      for (const preserved of plan.preservedNodeIds) {
        if (!output.preservedNodeIds.includes(preserved)) {
          return this.finish({
            repairId: plan.repairId,
            caseId: plan.caseId,
            planId: plan.planId,
            idempotencyKey: plan.idempotencyKey,
            parentArtifactId: plan.parentArtifact.artifactId,
            parentArtifactSha256: plan.parentArtifact.sha256,
            candidateArtifact: output.candidateArtifact,
            changedNodeIds: output.changedNodeIds,
            renderSceneIds: plan.renderSceneIds,
            preservedNodeIds: output.preservedNodeIds,
            attempts,
            termination: "EXECUTION_FAILED",
            startedAt,
            completedAt: new Date().toISOString(),
            f07Required: true,
            evidenceRefs: input.evidenceRefs,
            error: "Execution failed preservation invariant.",
          });
        }
      }

      const progressFingerprint = sha256(
        canonicalJson({
          artifact: output.candidateArtifact.sha256,
          changed: [...output.changedNodeIds].sort(),
          preserved: [...output.preservedNodeIds].sort(),
        })
      );

      if (progressFingerprint === lastProgressFingerprint) {
        return this.finish({
          repairId: plan.repairId,
          caseId: plan.caseId,
          planId: plan.planId,
          idempotencyKey: plan.idempotencyKey,
          parentArtifactId: plan.parentArtifact.artifactId,
          parentArtifactSha256: plan.parentArtifact.sha256,
          candidateArtifact: output.candidateArtifact,
          changedNodeIds: output.changedNodeIds,
          renderSceneIds: plan.renderSceneIds,
          preservedNodeIds: output.preservedNodeIds,
          attempts,
          termination: "NO_PROGRESS",
          startedAt,
          completedAt: new Date().toISOString(),
          f07Required: true,
          evidenceRefs: input.evidenceRefs,
        });
      }

      lastProgressFingerprint = progressFingerprint;

      const receipt = this.finish({
        repairId: plan.repairId,
        caseId: plan.caseId,
        planId: plan.planId,
        idempotencyKey: plan.idempotencyKey,
        parentArtifactId: plan.parentArtifact.artifactId,
        parentArtifactSha256: plan.parentArtifact.sha256,
        candidateArtifact: output.candidateArtifact,
        changedNodeIds: output.changedNodeIds,
        renderSceneIds: plan.renderSceneIds,
        preservedNodeIds: output.preservedNodeIds,
        attempts,
        termination: "COMPLETED",
        startedAt,
        completedAt: new Date().toISOString(),
        f07Required: true,
        evidenceRefs: input.evidenceRefs,
      });

      return receipt;
    }

    return this.finish({
      repairId: plan.repairId,
      caseId: plan.caseId,
      planId: plan.planId,
      idempotencyKey: plan.idempotencyKey,
      parentArtifactId: plan.parentArtifact.artifactId,
      parentArtifactSha256: plan.parentArtifact.sha256,
      changedNodeIds: plan.changedNodeIds,
      renderSceneIds: plan.renderSceneIds,
      preservedNodeIds: plan.preservedNodeIds,
      attempts,
      termination: "BUDGET_EXHAUSTED",
      startedAt,
      completedAt: new Date().toISOString(),
      f07Required: true,
      evidenceRefs: input.evidenceRefs,
    });
  }

  private validateRequest(input: ReMakerPlanInput): void {
    if (!input.repairId || !input.caseId || !input.missionId) {
      throw new Error("[ReMakerEngine] repairId, caseId and missionId are required.");
    }
    if (!isSha256(input.parentArtifact.sha256)) {
      throw new Error("[ReMakerEngine] Parent artifact must be bound by a SHA-256 digest.");
    }
    if (!input.parentArtifact.timelineDigest) {
      throw new Error("[ReMakerEngine] Parent TimelineIR digest is required.");
    }
    if (!input.requestedChangeDigest) {
      throw new Error("[ReMakerEngine] requestedChangeDigest is required for idempotent patch identity.");
    }
    if (input.authorization.capabilityId !== "CAP_REMAKER_REPAIR") {
      throw new Error("[ReMakerEngine] Missing CAP_REMAKER_REPAIR authorization.");
    }
    if (!input.parentArtifact.casRef) {
      throw new Error("[ReMakerEngine] Production repair requires a CAS-bound parent artifact.");
    }
    if (!Number.isInteger(input.authorization.fencingToken) || input.authorization.fencingToken < 0) {
      throw new Error("[ReMakerEngine] Invalid fencing token.");
    }
    if (Date.parse(input.authorization.expiresAt) <= Date.now()) {
      throw new Error("[ReMakerEngine] Repair authorization is expired.");
    }
    if (input.budget.maxAttempts < 1 || input.budget.maxDurationMs < 1000) {
      throw new Error("[ReMakerEngine] Repair budget is invalid.");
    }

    const targetKinds: Record<ReMakerRequest["action"], readonly ReMakerRequest["target"]["kind"][]> = {
      REALIGN_SUBTITLE: ["SUBTITLE"],
      REPLACE_ASSET: ["VISUAL_ASSET"],
      REGENERATE_AUDIO_SEGMENT: ["AUDIO"],
      SHIFT_TIMING: ["TIMING", "MULTI_TRACK"],
      REBUILD_SCENE: ["VISUAL_ASSET", "MULTI_TRACK"],
      RENDER_WINDOW: ["RENDER_REGION", "VISUAL_ASSET", "AUDIO", "SUBTITLE", "MULTI_TRACK"],
    };
    if (!targetKinds[input.action].includes(input.target.kind)) {
      throw new Error("[ReMakerEngine] Repair action does not match the target kind.");
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

    const normalizedAllowed = input.allowedActions.map((v) => v.trim().toLowerCase());
    const aliases = ACTION_ALIASES[input.action] || [];
    if (
      aliases.length > 0 &&
      !normalizedAllowed.some((allowed) => aliases.some((alias) => allowed.includes(alias)))
    ) {
      throw new Error(
        "[ReMakerEngine] Requested repair action is not present in the F07-authorized allowed action set."
      );
    }

    const normalizedForbidden = input.forbiddenActions.map((v) => v.trim().toLowerCase());
    if (normalizedForbidden.some((forbidden) => aliases.some((alias) => forbidden.includes(alias)))) {
      throw new Error("[ReMakerEngine] Requested repair action is explicitly forbidden.");
    }
  }

  private finish(receipt: ReMakerReceipt): ReMakerReceipt {
    if (receipt.termination === "COMPLETED") {
      this.completed.set(receipt.idempotencyKey, receipt);
    }
    return Object.freeze(receipt);
  }
}
