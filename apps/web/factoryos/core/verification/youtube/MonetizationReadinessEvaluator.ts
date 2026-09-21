/**
 * FactoryOS YouTube Monetization Guardian — Monetization Readiness Evaluator
 * Synthesizes gate findings into an evidence-grounded MonetizationReadinessState and ReleaseStatus.
 *
 * CRITICAL ARCHITECTURAL SEPARATIONS:
 * 1. UPLOAD SAFETY != MONETIZATION READINESS != ADVERTISER SUITABILITY
 * 2. Non-YPP channel does not block ordinary upload if video content is safe and cleared.
 * 3. Never claim "YouTube will monetize this". Evaluates ShortForge readiness only.
 */

import { GateEvaluationFinding, PolicyEvaluationResult } from "./policy/YouTubePolicyEvaluator";
import { PolicySnapshot } from "./policy/YouTubePolicySnapshot";
import { EffectAggregator } from "./gates/EffectAggregator";
import { MonetizationReadinessState, ReleaseStatus } from "./contracts/F07ReleaseContracts";

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

    // Use formal EffectAggregator to cleanly separate publication decision from monetization readiness
    const aggregation = EffectAggregator.reduce(findings);

    return {
      evaluationId: params.evaluationId,
      policyPack: "youtube",
      policyVersion: params.snapshot.policyVersion,
      policySnapshotHash: params.snapshot.snapshotHashSha256,
      contentCreatedAt: params.contentCreatedAt,
      evaluationAt: params.evaluationAt,
      publicationIntentAt: params.publicationIntentAt,
      overallOutcome: aggregation.monetizationReadiness,
      releaseStatus: aggregation.releaseStatus,
      activePolicyEffects: aggregation.activeEffects,
      gateFindings: findings,
      blockingFindings,
      repairableFindings,
      externalReviewFindings,
      warnings,
      publishAllowed: aggregation.publishAllowed,
      publishBlockReason: aggregation.publishBlockReason,
    };
  }
}
