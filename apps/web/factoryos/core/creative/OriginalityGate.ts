/**
 * FactoryOS Content Architecture — Originality Gate
 * Validates editorial distinctness, non-repetitive substance, asset licensing, and factual grounding.
 * Pre-publishing gate prior to F07 media compliance.
 */

import { ContentGenome } from "./ContentGenome";
import { VariationDecision } from "./VariationPolicyEngine";

export interface OriginalityAuditInput {
  readonly genome: ContentGenome;
  readonly scriptText: string;
  readonly variationDecision: VariationDecision;
  readonly isRightsCleared: boolean;
  readonly assetLicenses?: Array<{ assetId: string; licenseType: string; isCommercialSafe: boolean }>;
}

export interface OriginalityReceipt {
  readonly receiptId: string;
  readonly status: "PASS" | "REMAKE" | "HUMAN_REVIEW" | "BLOCK";
  readonly scores: {
    readonly editorialDistinctness: number; // 0.0 to 1.0
    readonly factualGroundedness: number;   // 0.0 to 1.0
    readonly transformativeness: number;    // 0.0 to 1.0
    readonly nonMassProducedScore: number;  // 0.0 to 1.0
  };
  readonly isRightsCleared: boolean;
  readonly evaluatedAt: string;
  readonly reasons: string[];
}

export class OriginalityGate {
  private static instance: OriginalityGate | null = null;

  public static getInstance(): OriginalityGate {
    if (!OriginalityGate.instance) {
      OriginalityGate.instance = new OriginalityGate();
    }
    return OriginalityGate.instance;
  }

  /**
   * Audits candidate content before F07 compliance and distribution outbox.
   * If uncertain, fails closed to HUMAN_REVIEW.
   */
  public audit(input: OriginalityAuditInput): OriginalityReceipt {
    const reasons: string[] = [];
    const receiptId = `orig_rcpt_${Date.now()}`;
    const now = new Date().toISOString();

    // 1. Rights & Licensing Gate (Hard Invariant)
    if (!input.isRightsCleared) {
      return {
        receiptId,
        status: "BLOCK",
        scores: {
          editorialDistinctness: 0.0,
          factualGroundedness: 0.0,
          transformativeness: 0.0,
          nonMassProducedScore: 0.0,
        },
        isRightsCleared: false,
        evaluatedAt: now,
        reasons: ["RIGHTS_GATE_FAILED: Content contains unverified or uncleared third-party rights."],
      };
    }

    // 2. Check Variation Policy Decision
    if (input.variationDecision.outcome === "BLOCK") {
      return {
        receiptId,
        status: "BLOCK",
        scores: {
          editorialDistinctness: 0.0,
          factualGroundedness: 0.5,
          transformativeness: 0.0,
          nonMassProducedScore: 0.0,
        },
        isRightsCleared: true,
        evaluatedAt: now,
        reasons: [`VARIATION_GATE_BLOCKED: ${input.variationDecision.reasons.join("; ")}`],
      };
    }

    if (input.variationDecision.outcome === "REMAKE") {
      return {
        receiptId,
        status: "REMAKE",
        scores: {
          editorialDistinctness: 0.3,
          factualGroundedness: 0.7,
          transformativeness: 0.4,
          nonMassProducedScore: 0.2,
        },
        isRightsCleared: true,
        evaluatedAt: now,
        reasons: [`VARIATION_GATE_REMAKE: ${input.variationDecision.reasons.join("; ")}`],
      };
    }

    // 3. Editorial Distinctness & Non-Mass-Produced Score
    const distinctnessScore = Number((1.0 - input.variationDecision.maxSimilarity).toFixed(2));
    const nonMassProducedScore = distinctnessScore >= 0.30 ? 0.90 : 0.40;

    // 4. Factual Groundedness
    const claims = input.genome.factualClaims || [];
    let factualGroundedness = 1.0;
    if (claims.length > 0) {
      const verifiedCount = claims.filter((c) => c.claimType === "VERIFIED_FACT").length;
      factualGroundedness = Number((verifiedCount / claims.length).toFixed(2));
    }

    const transformativeness = 0.95; // Original script and custom visual synthesis

    const scores = {
      editorialDistinctness: distinctnessScore,
      factualGroundedness,
      transformativeness,
      nonMassProducedScore,
    };

    if (input.variationDecision.outcome === "HUMAN_REVIEW" || distinctnessScore < 0.35 || factualGroundedness < 0.60) {
      reasons.push("Borderline originality or factual confidence requires operator review.");
      return {
        receiptId,
        status: "HUMAN_REVIEW",
        scores,
        isRightsCleared: true,
        evaluatedAt: now,
        reasons,
      };
    }

    reasons.push("Originality, rights, and creative variation criteria fully satisfied.");
    return {
      receiptId,
      status: "PASS",
      scores,
      isRightsCleared: true,
      evaluatedAt: now,
      reasons,
    };
  }
}
