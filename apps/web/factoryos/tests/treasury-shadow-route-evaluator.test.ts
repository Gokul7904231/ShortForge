import { describe, expect, it } from "vitest";
import {
  createTreasuryAccount,
  InMemoryTreasuryLedger,
} from "../core/treasury/TreasuryLedger";
import { TreasuryKernel } from "../core/treasury/TreasuryKernel";
import { TreasuryPriceRegistry } from "../core/treasury/TreasuryPriceRegistry";
import { TreasuryService } from "../core/treasury/TreasuryService";
import { computeTreasuryExecutionScopeDigest } from "../core/treasury/TreasuryScope";
import { createTreasuryEconomicReadSource } from "../core/treasury/TreasuryEconomicIntelligence";
import { TreasuryEconomicCalibration } from "../core/treasury/TreasuryEconomicCalibration";
import { TreasuryShadowRouteEvaluator } from "../core/treasury/TreasuryShadowRouteEvaluator";

function makeTreasury(now = new Date("2026-10-04T00:00:00.000Z")) {
  const ledger = new InMemoryTreasuryLedger();
  const registry = new TreasuryPriceRegistry();
  const kernel = new TreasuryKernel(
    ledger,
    registry,
    undefined,
    () => new Date(now),
  );
  const service = new TreasuryService(kernel);
  ledger.seedAccount(
    createTreasuryAccount(
      "factory",
      100,
      10_000,
      "OPEN",
      now,
      1_000_000,
    ),
  );
  return { ledger, service, now };
}

function command(
  id: string,
  providerId: string,
  modelId: string,
  now: Date,
) {
  return {
    commandId: id,
    overseerCommandId: id,
    issuer: { authority: "OVERSEER" as const, issuerId: id },
    accountId: "factory",
    missionId: "mission-calibration",
    runId: "run-calibration",
    floorId: "floor02_scripting",
    taskId: id,
    attemptId: id,
    purpose: "shadow calibration proof",
    resourceRequest: [
      {
        kind: "INFERENCE" as const,
        providerId,
        modelId,
        workloadType: "SCRIPT",
        unit: "INVOCATION",
        quantity: 1,
        verificationRequired: true,
        paidRoute: false,
        metadata: { capability: "SCRIPT" },
      },
    ],
    budgetEnvelope: {
      maxCostUsd: 1,
      maxTokens: 20_000,
      maxCapacityUnits: 0,
      maxRetries: 0,
    },
    priority: "NORMAL" as const,
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    idempotencyKey: id,
    scopeDigest: computeTreasuryExecutionScopeDigest({
      version: 1,
      missionId: "mission-calibration",
      jobId: id,
      floorId: "floor02_scripting",
      overseerCommandId: id,
      kind: "INFERENCE",
      resourceId: modelId,
    }),
  };
}

describe("Treasury shadow route evaluation", () => {
  it("calibrates only from verification-backed settlement evidence", async () => {
    const { service, now } = makeTreasury();

    const verified = await service.reserve(
      command("cmd-good", "provider-a", "model-a", now),
    );
    await service.settle(verified.reservation.reservationId, {
      reservationId: verified.reservation.reservationId,
      actualCostUsd: 0.02,
      actualCapacityUnits: 0,
      actualTokens: 1_000,
      actualDurationMs: 100,
      executionEvidenceId: "exec-good",
      verificationReceiptId: "f07-good",
      verified: true,
      measuredAt: now.toISOString(),
    });

    const unverified = await service.reserve(
      command("cmd-unverified", "provider-b", "model-b", now),
    );
    await service.settle(unverified.reservation.reservationId, {
      reservationId: unverified.reservation.reservationId,
      actualCostUsd: 0.001,
      actualCapacityUnits: 0,
      actualTokens: 1_000,
      actualDurationMs: 20,
      executionEvidenceId: "exec-unverified",
      verified: false,
      measuredAt: now.toISOString(),
    });

    const source = createTreasuryEconomicReadSource(service);
    const snapshot = await new TreasuryEconomicCalibration(source).calibrate(
      "factory",
      { windowMs: 60 * 60 * 1000, now },
    );

    expect(snapshot.observations).toHaveLength(1);
    expect(snapshot.observations[0].providerId).toBe("provider-a");
    expect(snapshot.observations[0].verificationSuccessRate).toBe(1);
    expect(snapshot.observations[0].averageLatencyMs).toBe(100);
  });

  it("emits only an evidence-backed shadow recommendation and does not mutate Treasury", async () => {
    const { service, now } = makeTreasury();

    for (let i = 0; i < 10; i += 1) {
      for (const [provider, cost, latency] of [
        ["baseline", 0.05, 120],
        ["alternative", 0.02, 150],
      ] as const) {
        const id = provider + "-" + i;
        const reserved = await service.reserve(
          command(id, provider, provider + "-model", now),
        );
        await service.settle(reserved.reservation.reservationId, {
          reservationId: reserved.reservation.reservationId,
          actualCostUsd: cost,
          actualCapacityUnits: 0,
          actualTokens: 1_000,
          actualDurationMs: latency,
          executionEvidenceId: "exec-" + id,
          verificationReceiptId: "f07-" + id,
          verified: true,
          measuredAt: now.toISOString(),
        });
      }
    }

    const source = createTreasuryEconomicReadSource(service);
    const before = await service.getLedger().getAccount("factory");
    const evaluation = await new TreasuryShadowRouteEvaluator(
      new TreasuryEconomicCalibration(source),
    ).evaluate(
      {
        accountId: "factory",
        workloadType: "SCRIPT",
        capability: "SCRIPT",
        baselineProviderId: "baseline",
        baselineModelId: "baseline-model",
        requiredVerificationSuccessRate: 0.95,
        maxLatencyMs: 200,
        minSamples: 5,
      },
      { windowMs: 60 * 60 * 1000, now },
    );
    const after = await service.getLedger().getAccount("factory");

    expect(evaluation.baseline?.providerId).toBe("baseline");
    expect(evaluation.recommendation?.providerId).toBe("alternative");
    expect(evaluation.recommendation?.expectedCostSavingsPct).toBeCloseTo(60, 8);
    expect(evaluation.recommendation?.expectedLatencyDeltaPct).toBeCloseTo(25, 8);
    expect(evaluation.alternatives).toHaveLength(1);
    expect(after).toEqual(before);
  });

  it("rejects a cheaper route when quality or latency evidence is insufficient", async () => {
    const { service, now } = makeTreasury();

    for (let i = 0; i < 10; i += 1) {
      const id = "quality-" + i;
      const reserved = await service.reserve(
        command(id, "cheap", "cheap-model", now),
      );
      await service.settle(reserved.reservation.reservationId, {
        reservationId: reserved.reservation.reservationId,
        actualCostUsd: 0.01,
        actualCapacityUnits: 0,
        actualTokens: 1_000,
        actualDurationMs: 500,
        executionEvidenceId: "exec-" + id,
        verificationReceiptId: "f07-" + id,
        verified: i < 5,
        measuredAt: now.toISOString(),
      });
    }

    const source = createTreasuryEconomicReadSource(service);
    const evaluation = await new TreasuryShadowRouteEvaluator(
      new TreasuryEconomicCalibration(source),
    ).evaluate(
      {
        accountId: "factory",
        workloadType: "SCRIPT",
        capability: "SCRIPT",
        baselineProviderId: "cheap",
        baselineModelId: "cheap-model",
        requiredVerificationSuccessRate: 0.9,
        maxLatencyMs: 100,
        minSamples: 5,
      },
      { windowMs: 60 * 60 * 1000, now },
    );

    expect(evaluation.baseline).toBeUndefined();
    expect(evaluation.recommendation).toBeUndefined();
  });
});
