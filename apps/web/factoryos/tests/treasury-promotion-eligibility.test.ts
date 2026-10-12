import { describe, expect, it } from "vitest";
import {
  evaluateTreasuryPromotionEligibility,
  evaluateTreasuryPromotionFromLedger,
  type TreasuryPromotionEligibilityRequest,
  type TreasuryPromotionLedgerEvaluationRequest,
  type TreasuryPromotionOutcomeReadSource,
  type VerifiedRouteOutcome,
} from "../core/treasury/TreasuryPromotionEligibility";
import type { TreasuryLedgerEvent } from "../core/treasury/TreasuryContracts";

const issuedAt = "2026-10-01T00:00:00.000Z";
const evaluatedAt = "2026-10-05T00:00:00.000Z";

function outcome(
  routeId: string,
  cohortId: string,
  index: number,
  overrides: Partial<VerifiedRouteOutcome> = {},
): VerifiedRouteOutcome {
  return {
    outcomeId: routeId + "-outcome-" + index,
    routeId,
    cohortId,
    workloadType: "RENDER",
    capabilityClass: "VIDEO_1080X1920",
    observedAt: new Date(Date.parse(issuedAt) + (index + 1) * 60_000).toISOString(),
    realizedCostUsd: routeId === "candidate" ? 0.4 : 1,
    latencyMs: routeId === "candidate" ? 108 : 100,
    verification: {
      status: "VERIFIED",
      success: true,
      f07ReceiptId: routeId + "-f07-" + index,
    },
    evidenceRef: "evidence/" + routeId + "/" + index,
    ...overrides,
  };
}

function request(
  outcomes: readonly VerifiedRouteOutcome[],
  thresholds?: TreasuryPromotionEligibilityRequest["thresholds"],
): TreasuryPromotionEligibilityRequest {
  return {
    recommendationId: "shadow-rec-2026-10-01",
    recommendationIssuedAt: issuedAt,
    evaluatedAt,
    workloadType: "RENDER",
    capabilityClass: "VIDEO_1080X1920",
    baseline: { routeId: "baseline", cohortId: "baseline-cohort" },
    candidate: { routeId: "candidate", cohortId: "candidate-cohort" },
    outcomes,
    thresholds,
  };
}

function pairedOutcomes(candidateSuccessCount = 30, candidateLatency = 108) {
  const result: VerifiedRouteOutcome[] = [];
  for (let i = 0; i < 30; i += 1) {
    result.push(outcome("baseline", "baseline-cohort", i, {
      realizedCostUsd: 1, latencyMs: 100,
      verification: { status: "VERIFIED", success: true, f07ReceiptId: "baseline-f07-" + i },
    }));
    result.push(outcome("candidate", "candidate-cohort", i, {
      realizedCostUsd: 0.4,
      latencyMs: candidateLatency,
      verification: { status: "VERIFIED", success: i < candidateSuccessCount, f07ReceiptId: "candidate-f07-" + i },
    }));
  }
  return result;
}

describe("Treasury Wave 7 promotion eligibility", () => {
  it("emits a deterministic advisory artifact when verified outcomes meet all gates", () => {
    const input = request(pairedOutcomes());
    const first = evaluateTreasuryPromotionEligibility(input);
    const second = evaluateTreasuryPromotionEligibility(input);

    expect(first.decision).toBe("ELIGIBLE_FOR_HUMAN_REVIEW");
    expect(first.baseline.sampleCount).toBe(30);
    expect(first.candidate.sampleCount).toBe(30);
    expect(first.comparison.realizedCostSavingsPct).toBeCloseTo(60, 8);
    expect(first.comparison.p90LatencyRegressionPct).toBeCloseTo(8, 8);
    expect(first.authority.canAuthorizeSpend).toBe(false);
    expect(first.authority.canChangeRoutingPolicy).toBe(false);
    expect(first.authority.canExecuteProvider).toBe(false);
    expect(first.authority.canMutateTreasury).toBe(false);
    expect(first.authority.requiresHumanOverseerReview).toBe(true);
    expect(first.artifactDigest).toBe(second.artifactDigest);
    expect(first.artifactDigest).toBe(
      evaluateTreasuryPromotionEligibility({ ...input, outcomes: [...input.outcomes].reverse() }).artifactDigest,
    );
  });

  it("rejects candidate verification regression even when candidate is cheaper", () => {
    const result = evaluateTreasuryPromotionEligibility(request(pairedOutcomes(27)));
    expect(result.decision).toBe("NOT_ELIGIBLE");
    expect(result.comparison.costEligible).toBe(true);
    expect(result.comparison.verificationEligible).toBe(false);
    expect(result.reasonCodes).toContain("VERIFICATION_NON_INFERIORITY_GATE_FAILED");
  });

  it("rejects latency regressions outside the independent P90 bound", () => {
    const result = evaluateTreasuryPromotionEligibility(request(pairedOutcomes(30, 111)));
    expect(result.decision).toBe("NOT_ELIGIBLE");
    expect(result.comparison.costEligible).toBe(true);
    expect(result.comparison.latencyEligible).toBe(false);
  });

  it("does not infer eligibility from small sample counts", () => {
    const result = evaluateTreasuryPromotionEligibility(request(pairedOutcomes().filter((_, index) => index < 10)));
    expect(result.decision).toBe("NOT_ELIGIBLE");
    expect(result.reasonCodes).toContain("INSUFFICIENT_VERIFIED_SAMPLES_OR_CONFIDENCE");
  });

  it("excludes earlier, unverified, missing-receipt, duplicate and mismatched outcomes", () => {
    const valid = pairedOutcomes();
    const bad: VerifiedRouteOutcome[] = [
      outcome("baseline", "baseline-cohort", 100, { observedAt: issuedAt }),
      outcome("candidate", "candidate-cohort", 101, {
        verification: { status: "UNVERIFIED", success: true, f07ReceiptId: "bad-1" },
      }),
      outcome("candidate", "candidate-cohort", 102, {
        verification: { status: "VERIFIED", success: true },
      }),
      outcome("candidate", "candidate-cohort", 103, { workloadType: "OTHER_WORKLOAD" }),
      valid[0],
    ];
    const result = evaluateTreasuryPromotionEligibility(request([...valid, ...bad]));
    expect(result.decision).toBe("NOT_ELIGIBLE");
    expect(result.excludedOutcomeCount).toBeGreaterThanOrEqual(6);
    expect(result.baseline.sampleCount).toBe(29);
    expect(result.candidate.sampleCount).toBe(30);
  });

  it("fails closed when savings are below threshold or source cost is zero", () => {
    const barelyCheaper = pairedOutcomes().map((item) =>
      item.routeId === "candidate" ? { ...item, realizedCostUsd: 0.99 } : item,
    );
    const result = evaluateTreasuryPromotionEligibility(request(barelyCheaper));
    expect(result.decision).toBe("NOT_ELIGIBLE");
    expect(result.comparison.costEligible).toBe(false);
  });

  it("fails closed on missing verification objects and excludes all duplicate identity collisions", () => {
    const outcomes = pairedOutcomes();
    const malformed = outcome("candidate", "candidate-cohort", 501, {
      verification: undefined as unknown as VerifiedRouteOutcome["verification"],
    });
    const crossRouteDuplicate = outcome("candidate", "candidate-cohort", 502, {
      outcomeId: outcomes[0].outcomeId,
      verification: { status: "VERIFIED", success: true, f07ReceiptId: "cross-route-duplicate-receipt" },
    });
    const input = request([...outcomes, malformed, crossRouteDuplicate]);
    const forward = evaluateTreasuryPromotionEligibility(input);
    const reverse = evaluateTreasuryPromotionEligibility({ ...input, outcomes: [...input.outcomes].reverse() });

    expect(forward.decision).toBe("NOT_ELIGIBLE");
    expect(forward.excludedOutcomeCount).toBeGreaterThanOrEqual(3);
    expect(forward.baseline.sampleCount).toBe(29);
    expect(forward.artifactDigest).toBe(reverse.artifactDigest);
  });

  it("builds eligibility evidence from tagged, later Treasury ledger settlements", async () => {
    const events: TreasuryLedgerEvent[] = [];
    for (let i = 0; i < 30; i += 1) {
      for (const route of [
        { routeId: "baseline", cohortId: "baseline-cohort", cost: 1, latency: 100 },
        { routeId: "candidate", cohortId: "candidate-cohort", cost: 0.4, latency: 108 },
      ]) {
        events.push({
          eventId: "event-" + route.routeId + "-" + i,
          eventType: "RESOURCE_CONSUMED",
          eventVersion: 1,
          commandId: "command-" + route.routeId + "-" + i,
          reservationId: "reservation-" + route.routeId + "-" + i,
          accountId: "account-promotion",
          missionId: "mission-promotion",
          runId: "run-promotion-" + i,
          floorId: "floor02_scripting",
          amountUsd: route.cost,
          occurredAt: new Date(Date.parse(issuedAt) + (i + 1) * 60_000).toISOString(),
          actorAuthority: "TREASURER",
          payload: {
            resourceRequest: [{
              kind: "INFERENCE",
              providerId: route.routeId,
              modelId: route.routeId + "-model",
              workloadType: "RENDER",
              metadata: {
                treasuryPromotionRecommendationId: "shadow-rec-2026-10-01",
                treasuryPromotionRouteId: route.routeId,
                treasuryPromotionCohortId: route.cohortId,
                treasuryPromotionWorkloadType: "RENDER",
                treasuryPromotionCapabilityClass: "VIDEO_1080X1920",
              },
            }],
            actualDurationMs: route.latency,
            actualTokens: 1000,
            executionEvidenceId: "exec-" + route.routeId + "-" + i,
            verificationReceiptId: "f07-" + route.routeId + "-" + i,
            verified: true,
          },
        });
      }
    }
    const baseRequest = request([]);
    const { outcomes: _ignored, ...withoutOutcomes } = baseRequest;
    const readSource: TreasuryPromotionOutcomeReadSource = {
      listRecentEvents: async (accountId, limit) => {
        expect(accountId).toBe("account-promotion");
        expect(limit).toBe(1000);
        return [...events].reverse();
      },
    };
    const ledgerRequest: TreasuryPromotionLedgerEvaluationRequest = {
      ...withoutOutcomes,
      accountId: "account-promotion",
      eventLimit: 1000,
    };

    const result = await evaluateTreasuryPromotionFromLedger(readSource, ledgerRequest);
    expect(result.decision).toBe("ELIGIBLE_FOR_HUMAN_REVIEW");
    expect(result.baseline.sampleCount).toBe(30);
    expect(result.candidate.sampleCount).toBe(30);
    expect(result.comparison.realizedCostSavingsPct).toBeCloseTo(60, 8);
    expect(result.authority.canAuthorizeSpend).toBe(false);
    expect(result.authority.canChangeRoutingPolicy).toBe(false);
  });

  it("fails closed for tagged ledger events missing verified receipt evidence", async () => {
    const baseRequest = request([]);
    const { outcomes: _ignored, ...withoutOutcomes } = baseRequest;
    const event: TreasuryLedgerEvent = {
      eventId: "missing-f07",
      eventType: "RESOURCE_CONSUMED",
      eventVersion: 1,
      accountId: "account-promotion",
      missionId: "mission-promotion",
      amountUsd: 0.1,
      occurredAt: "2026-10-02T00:00:00.000Z",
      actorAuthority: "TREASURER",
      payload: {
        resourceRequest: [{
          kind: "INFERENCE",
          providerId: "candidate",
          modelId: "candidate-model",
          workloadType: "RENDER",
          metadata: {
            treasuryPromotionRecommendationId: "shadow-rec-2026-10-01",
            treasuryPromotionRouteId: "candidate",
            treasuryPromotionCohortId: "candidate-cohort",
            treasuryPromotionWorkloadType: "RENDER",
            treasuryPromotionCapabilityClass: "VIDEO_1080X1920",
          },
        }],
        actualDurationMs: 100,
        executionEvidenceId: "execution-missing-f07",
        verified: true,
      },
    };
    const source: TreasuryPromotionOutcomeReadSource = {
      listRecentEvents: async () => [event],
    };
    const result = await evaluateTreasuryPromotionFromLedger(source, {
      ...withoutOutcomes,
      accountId: "account-promotion",
    });
    expect(result.decision).toBe("NOT_ELIGIBLE");
    expect(result.candidate.sampleCount).toBe(0);
    expect(result.excludedOutcomeCount).toBe(1);
    expect(result.reasonCodes).toContain("INSUFFICIENT_VERIFIED_SAMPLES_OR_CONFIDENCE");
  });

  it("rejects invalid identity and threshold windows", () => {
    expect(() => evaluateTreasuryPromotionEligibility({
      ...request(pairedOutcomes()),
      baseline: { routeId: "same", cohortId: "base" },
      candidate: { routeId: "same", cohortId: "candidate" },
    })).toThrow(/Invalid Treasury promotion evaluation identity/);
    expect(() => evaluateTreasuryPromotionEligibility(
      request(pairedOutcomes(), { minSamplesPerCohort: 0 }),
    )).toThrow(/Invalid Treasury promotion eligibility thresholds/);
  });
});
