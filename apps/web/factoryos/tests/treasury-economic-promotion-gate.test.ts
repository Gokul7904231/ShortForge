import { describe, expect, it } from "vitest";
import type { TreasuryEconomicReadSource } from "../core/treasury/TreasuryEconomicIntelligence";
import type { TreasuryLedgerEvent } from "../core/treasury/TreasuryContracts";
import { TreasuryEconomicPromotionGate } from "../core/treasury/TreasuryEconomicPromotionGate";
import type { TreasuryShadowRouteEvaluation } from "../core/treasury/TreasuryShadowRouteEvaluator";

const shadowAt = new Date("2026-09-20T00:00:00.000Z");
const now = new Date("2026-09-30T00:00:00.000Z");

function shadow(): TreasuryShadowRouteEvaluation {
  return {
    generatedAt: shadowAt.toISOString(),
    workloadType: "SCRIPT",
    baseline: {
      providerId: "baseline",
      modelId: "base-model",
      samples: 30,
      confidence: "HIGH",
      costPer1kTokensUsd: 0.05,
      averageLatencyMs: 100,
      p90LatencyMs: 110,
      verificationSuccessRate: 1,
      qualityEligible: true,
      latencyEligible: true,
      eligible: true,
    },
    alternatives: [
      {
        providerId: "candidate",
        modelId: "candidate-model",
        samples: 30,
        confidence: "HIGH",
        costPer1kTokensUsd: 0.02,
        averageLatencyMs: 105,
        p90LatencyMs: 115,
        verificationSuccessRate: 1,
        qualityEligible: true,
        latencyEligible: true,
        eligible: true,
      },
    ],
    recommendation: {
      providerId: "candidate",
      modelId: "candidate-model",
      expectedCostSavingsPct: 60,
      expectedLatencyDeltaPct: 5,
      rationale: "Verified shadow evidence",
      confidence: "HIGH",
    },
  };
}

function event(
  id: string,
  providerId: string,
  modelId: string,
  cost: number,
  latency: number,
  verified = true,
): TreasuryLedgerEvent {
  return {
    eventId: id,
    eventVersion: 1,
    eventType: "RESOURCE_CONSUMED",
    accountId: "factory",
    missionId: "m1",
    runId: "r1",
    floorId: "floor02_scripting",
    taskId: id,
    amountUsd: cost,
    capacityUnits: 0,
    occurredAt: new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString(),
    actorAuthority: "TREASURER",
    payload: {
      verificationReceiptId: "f07-" + id,
      verified,
      actualTokens: 1_000,
      actualDurationMs: latency,
      resourceRequest: [
        {
          providerId,
          modelId,
          workloadType: "SCRIPT",
          metadata: { capability: "SCRIPT" },
        },
      ],
    },
  };
}

function source(events: TreasuryLedgerEvent[]): TreasuryEconomicReadSource {
  return {
    getAccount: async () => null,
    listRecentEvents: async () => events,
    listActiveReservations: async () => [],
  };
}

function buildPair(
  baselineCost: number,
  candidateCost: number,
  baselineLatency = 100,
  candidateLatency = 105,
  candidateVerified = true,
  count = 30,
): TreasuryLedgerEvent[] {
  const events: TreasuryLedgerEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    events.push(
      event(
        "b-" + i,
        "baseline",
        "base-model",
        baselineCost,
        baselineLatency,
        true,
      ),
      event(
        "c-" + i,
        "candidate",
        "candidate-model",
        candidateCost,
        candidateLatency,
        candidateVerified,
      ),
    );
  }
  return events;
}

describe("Treasury Economic Promotion Gate", () => {
  it("returns CANARY_ELIGIBLE only after later verified outcomes confirm the shadow recommendation", async () => {
    const gate = new TreasuryEconomicPromotionGate(
      source(buildPair(0.05, 0.02)),
    );
    const decision = await gate.evaluate({
      accountId: "factory",
      shadowEvaluation: shadow(),
      now,
      postOutcomeWindowMs: 24 * 60 * 60 * 1000 * 5,
      minPostSamples: 30,
      minVerificationSuccessRate: 0.95,
      maxLatencyRegressionPct: 10,
      minRealizedCostSavingsPct: 10,
      maxSavingsDeviationPp: 20,
    });

    expect(decision.status).toBe("CANARY_ELIGIBLE");
    expect(decision.canaryEligible).toBe(true);
    expect(decision.canAuthorizeSpend).toBe(false);
    expect(decision.requiresHumanOrOverseerReview).toBe(true);
    expect(decision.realizedCostSavingsPct).toBeCloseTo(60, 8);
    expect(decision.realizedLatencyDeltaPct).toBeCloseTo(5, 8);
    expect(decision.evidenceDigest).toMatch(/^sha256:/);
  });

  it("returns INSUFFICIENT_EVIDENCE when later sample volume is too small", async () => {
    const gate = new TreasuryEconomicPromotionGate(
      source(buildPair(0.05, 0.02, 100, 105, true, 5)),
    );
    const decision = await gate.evaluate({
      accountId: "factory",
      shadowEvaluation: shadow(),
      now,
      postOutcomeWindowMs: 24 * 60 * 60 * 1000 * 5,
      minPostSamples: 30,
    });

    expect(decision.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.canaryEligible).toBe(false);
  });

  it("rejects a cheap route whose later verification quality is insufficient", async () => {
    const gate = new TreasuryEconomicPromotionGate(
      source(buildPair(0.05, 0.02, 100, 105, false, 30)),
    );
    const decision = await gate.evaluate({
      accountId: "factory",
      shadowEvaluation: shadow(),
      now,
      postOutcomeWindowMs: 24 * 60 * 60 * 1000 * 5,
      minPostSamples: 30,
      minVerificationSuccessRate: 0.95,
    });

    expect(decision.status).toBe("INELIGIBLE");
    expect(decision.canaryEligible).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/verification success rate/i);
  });

  it("rejects overlapping shadow/post windows", async () => {
    const gate = new TreasuryEconomicPromotionGate(
      source(buildPair(0.05, 0.02)),
    );
    const decision = await gate.evaluate({
      accountId: "factory",
      shadowEvaluation: {
        ...shadow(),
        generatedAt: new Date(
          now.getTime() - 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
      now,
      postOutcomeWindowMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(decision.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(decision.canaryEligible).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/post-outcome window/i);
  });

  it("is side-effect-free and exposes no Treasury mutation capability", async () => {
    const sourceValue = source(buildPair(0.05, 0.02));
    const before = JSON.stringify(sourceValue);
    const gate = new TreasuryEconomicPromotionGate(sourceValue);
    await gate.evaluate({
      accountId: "factory",
      shadowEvaluation: shadow(),
      now,
      postOutcomeWindowMs: 5 * 24 * 60 * 60 * 1000,
    });

    expect(JSON.stringify(sourceValue)).toBe(before);
    expect(gate).not.toHaveProperty("treasuryService");
  });
});
