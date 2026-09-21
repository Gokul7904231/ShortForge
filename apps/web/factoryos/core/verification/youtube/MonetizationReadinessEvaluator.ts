/**
 * FactoryOS YouTube Monetization Guardian — Monetization Readiness Evaluator
 * Synthesizes gate findings into an evidence-grounded MonetizationReadinessState.
 * CRITICAL INVARIANT: Never claim "YouTube will monetize this". Evaluates ShortForge readiness only.
 */

import { GateEvaluationFinding, PolicyEvaluationResult } from "./policy/YouTubePolicyEvaluator";
import { PolicySnapshot } from "./policy/YouTubePolicySnapshot";

export type MonetizationReadinessState =
  | "READY"
  | "READY_WITH_EXTERNAL_REVIEW"
  | "REPAIR_REQUIRED"
  | "BLOCKED"
  | "NOT_YET_ELIGIBLE"
  | "POLICY_STALE"
  | "UNKNOWN";

export class MonetizationReadinessEvaluator {
  public static summarize(params: {
    evaluationId: string;
    snapshot: PolicySnapshot;
    findings: readonly GateEvaluationFinding[];
    contentCreatedAt: string;
    evaluationAt: string;
    publicationIntentAt: string;
    channelYppStatus: string;
  }): PolicyEvaluationResult {
    const findings = params.findings;

    const blockingFindings = findings.filter(
      (f) => f.severity === "BLOCKING" && (f.status === "BLOCKED" || f.status === "POLICY_STALE")
    );
    const repairableFindings = findings.filter((f) => f.status === "REPAIR_REQUIRED");
    const externalReviewFindings = findings.filter((f) => f.status === "EXTERNAL_REVIEW");
    const warnings = findings.filter((f) => f.severity === "WARNING" || f.status === "NOT_YET_ELIGIBLE");

    let overallOutcome: MonetizationReadinessState = "READY";
    let publishAllowed = true;
    let publishBlockReason: string | undefined;

    // 1. Policy Stale Hard Boundary
    if (params.snapshot.policyState === "STALE" || findings.some((f) => f.status === "POLICY_STALE")) {
      overallOutcome = "POLICY_STALE";
      publishAllowed = false;
      publishBlockReason = "Release blocked: YouTube policy snapshot is STALE or expired. Must refresh from official documentation.";
    }
    // 2. Unresolved Blocking Findings
    else if (blockingFindings.length > 0) {
      overallOutcome = "BLOCKED";
      publishAllowed = false;
      publishBlockReason = `Release blocked by ${blockingFindings.length} hard policy gate failure(s): ${blockingFindings.map((b) => b.gateId).join(", ")}.`;
    }
    // 3. Repairable Findings (ReMaker Dispatch Required)
    else if (repairableFindings.length > 0) {
      overallOutcome = "REPAIR_REQUIRED";
      publishAllowed = false;
      publishBlockReason = `Repair required: ${repairableFindings.length} finding(s) require targeted ReMaker regeneration before release.`;
    }
    // 4. External Review or Channel Readiness Prerequisites
    else if (externalReviewFindings.length > 0 || params.channelYppStatus !== "CURRENTLY_MONETIZING") {
      overallOutcome = "READY_WITH_EXTERNAL_REVIEW";
      publishAllowed = false; // Requires human/operator sign-off before publication
      if (params.channelYppStatus === "NOT_YET_ELIGIBLE") {
        publishBlockReason = "Channel is not yet accepted into YPP; video readiness certified, but platform ad revenue cannot be shared.";
      } else {
        publishBlockReason = `Pending operator or external YouTube confirmation for: ${externalReviewFindings.map((e) => e.gateId).join(", ")}.`;
      }
    }

    return {
      evaluationId: params.evaluationId,
      policyPack: "youtube",
      policyVersion: params.snapshot.policyVersion,
      policySnapshotHash: params.snapshot.snapshotHashSha256,
      contentCreatedAt: params.contentCreatedAt,
      evaluationAt: params.evaluationAt,
      publicationIntentAt: params.publicationIntentAt,
      overallOutcome,
      gateFindings: findings,
      blockingFindings,
      repairableFindings,
      externalReviewFindings,
      warnings,
      publishAllowed,
      publishBlockReason,
    };
  }
}
