import { describe, expect, it } from "vitest";
import type { TreasuryLedgerEvent } from "../core/treasury/TreasuryContracts";
import type { TreasuryEconomicReadSource } from "../core/treasury/TreasuryEconomicIntelligence";
import { TreasuryShadowOutcomeAttribution } from "../core/treasury/TreasuryShadowOutcomeAttribution";
import {
  TreasuryEconomicPromotionGate,
  type TreasuryEconomicPromotionCriteria,
} from "../core/treasury/TreasuryEconomicPromotionGate";

function event(
  providerId: string,
  modelId: string,
  index: number,
  costUsd: number,
  latencyMs: number,
  verified: boolean,
): TreasuryLedgerEvent {
  return {
    eventId:
      "event-" + providerId + "-" + String(index),
    eventType: "RESOURCE_CONSUMED",
    accountId: "factory",
    reservationId:
      "reservation-" + providerId + "-" + String(index),
    commandId:
      "command-" + providerId + "-" + String(index),
    missionId: "mission-promotion",
    occurredAt:
      "2026-10-04T" +
      String(Math.floor(index / 10)).padStart(2, "0") +
      ":" +
      String(index % 60).padStart(2, "0") +
      ":00.000Z",
    amountUsd: costUsd,
    capacityUnits: 0,
    payload: {
      verificationReceiptId:
        "f07-" + providerId + "-" + String(index),
      verified,
      actualTokens: 1_000,
      actualDurationMs: latencyMs,
      resourceRequest: [
        {
          kind: "INFERENCE",
          providerId,
          modelId,
          workloadType: "SCRIPT",
          metadata: { capability: "SCRIPT" },
        },
      ],
    },
  } as TreasuryLedgerEvent;
}

function sourceFrom(
  events: TreasuryLedgerEvent[],
): TreasuryEconomicReadSource {
  return {
    getAccount: async () => null,
    listRecentEvents: async () => events,
    listActiveReservations: async () => [],
  };
}

const criteria: TreasuryEconomicPromotionCriteria = {
  minSamples: 30,
  minCostSavingsPct: 15,
  minVerificationSuccessRate: 0.95,
  maxVerificationRegression: 0.02,
  maxLatencyRegressionPct: 10,
  minEvidenceQuality: "STRONG",
};

describe("Treasury Economic Promotion Gate", () => {
  it("produces READY_FOR_REVIEW only for strong, verified savings", async () => {
    const events: TreasuryLedgerEvent[] = [];

    for (let i = 0; i < 30; i += 1) {
      events.push(
        event("baseline", "baseline-model", i, 0.05, 100, true),
      );
      events.push(
        event("candidate", "candidate-model", i, 0.04, 105, true),
      );
    }

    const attribution =
      await new TreasuryShadowOutcomeAttribution(
        sourceFrom(events),
      ).evaluate({
        accountId: "factory",
        workloadType: "SCRIPT",
        capability: "SCRIPT",
        baselineProviderId: "baseline",
        baselineModelId: "baseline-model",
        candidateProviderId: "candidate",
        candidateModelId: "candidate-model",
        windowMs: 24 * 60 * 60 * 1000,
        now: new Date("2026-10-04T01:00:00.000Z"),
      });

    const evidence = new TreasuryEconomicPromotionGate().evaluate(
      attribution,
      criteria,
    );

    expect(attribution.matched).toBe(true);
    expect(attribution.evidenceQuality).toBe("STRONG");
    expect(attribution.realizedCostSavingsPct).toBeCloseTo(20, 8);
    expect(attribution.realizedLatencyDeltaPct).toBeCloseTo(5, 8);
    expect(attribution.verificationDelta).toBe(0);
    expect(evidence.status).toBe("READY_FOR_REVIEW");
    expect(evidence.requiresHumanReview).toBe(true);
  });

  it("rejects cheaper candidates with verification regression", async () => {
    const events: TreasuryLedgerEvent[] = [];

    for (let i = 0; i < 30; i += 1) {
      events.push(
        event("baseline", "baseline-model", i, 0.05, 100, true),
      );
      events.push(
        event(
          "candidate",
          "candidate-model",
          i,
          0.02,
          95,
          i < 25,
        ),
      );
    }

    const attribution =
      await new TreasuryShadowOutcomeAttribution(
        sourceFrom(events),
      ).evaluate({
        accountId: "factory",
        workloadType: "SCRIPT",
        capability: "SCRIPT",
        baselineProviderId: "baseline",
        baselineModelId: "baseline-model",
        candidateProviderId: "candidate",
        candidateModelId: "candidate-model",
        windowMs: 24 * 60 * 60 * 1000,
        now: new Date("2026-10-04T01:00:00.000Z"),
      });

    const evidence = new TreasuryEconomicPromotionGate().evaluate(
      attribution,
      criteria,
    );

    expect(attribution.verificationDelta).toBeCloseTo(
      -5 / 30,
      8,
    );
    expect(evidence.status).toBe("REJECTED");
    expect(evidence.reasons).toContain(
      "candidate_verification_non_inferiority_failed",
    );
  });

  it("returns INSUFFICIENT_EVIDENCE when cohorts are too small", async () => {
    const events: TreasuryLedgerEvent[] = [];

    for (let i = 0; i < 5; i += 1) {
      events.push(
        event("baseline", "baseline-model", i, 0.05, 100, true),
      );
      events.push(
        event("candidate", "candidate-model", i, 0.02, 100, true),
      );
    }

    const attribution =
      await new TreasuryShadowOutcomeAttribution(
        sourceFrom(events),
      ).evaluate({
        accountId: "factory",
        workloadType: "SCRIPT",
        capability: "SCRIPT",
        baselineProviderId: "baseline",
        baselineModelId: "baseline-model",
        candidateProviderId: "candidate",
        candidateModelId: "candidate-model",
        windowMs: 24 * 60 * 60 * 1000,
        now: new Date("2026-10-04T01:00:00.000Z"),
      });

    const evidence = new TreasuryEconomicPromotionGate().evaluate(
      attribution,
      criteria,
    );

    expect(attribution.evidenceQuality).toBe("USABLE");
    expect(evidence.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(evidence.reasons).toContain(
      "paired_cohort_sample_size_insufficient",
    );
  });

  it("contains no Treasury write API and performs no provider execution", () => {
    const source = sourceFrom([]);
    const attribution = new TreasuryShadowOutcomeAttribution(source);
    const gate = new TreasuryEconomicPromotionGate();

    expect(attribution).not.toHaveProperty("reserve");
    expect(attribution).not.toHaveProperty("settle");
    expect(attribution).not.toHaveProperty("release");
    expect(gate).not.toHaveProperty("execute");
    expect(gate).not.toHaveProperty("reserve");
  });
});
