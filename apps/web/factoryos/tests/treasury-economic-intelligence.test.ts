import { describe, expect, it } from "vitest";
import {
  createTreasuryAccount,
  InMemoryTreasuryLedger,
} from "../core/treasury/TreasuryLedger";
import { TreasuryKernel } from "../core/treasury/TreasuryKernel";
import { TreasuryPriceRegistry } from "../core/treasury/TreasuryPriceRegistry";
import { TreasuryService } from "../core/treasury/TreasuryService";
import { computeTreasuryExecutionScopeDigest } from "../core/treasury/TreasuryScope";
import {
  TreasuryEconomicIntelligence,
  createTreasuryEconomicReadSource,
} from "../core/treasury/TreasuryEconomicIntelligence";

function makeTreasury(now = new Date()) {
  const ledger = new InMemoryTreasuryLedger();
  const registry = new TreasuryPriceRegistry();
  const kernel = new TreasuryKernel(ledger, registry, undefined, () => new Date(now));
  const service = new TreasuryService(kernel);
  ledger.seedAccount(
    createTreasuryAccount("factory", 10, 100, "OPEN", now, 1_000_000),
  );
  return { ledger, service };
}

function command(
  commandId: string,
  now: Date,
  cost: number,
) {
  return {
    commandId,
    overseerCommandId: commandId,
    issuer: {
      authority: "OVERSEER" as const,
      issuerId: commandId,
    },
    accountId: "factory",
    missionId: "mission-econ",
    runId: "run-econ",
    floorId: "floor02_scripting",
    taskId: commandId,
    attemptId: commandId,
    purpose: "economic-intelligence-test",
    resourceRequest: [
      {
        kind: "INFERENCE" as const,
        providerId: "groq",
        modelId: "test-model",
        unit: "INVOCATION",
        quantity: 1,
        verificationRequired: false,
        paidRoute: false,
        metadata: { capability: "SCRIPT" },
      },
    ],
    budgetEnvelope: {
      maxCostUsd: cost,
      maxTokens: 10_000,
      maxCapacityUnits: 0,
      maxRetries: 0,
    },
    priority: "NORMAL" as const,
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    idempotencyKey: commandId,
    scopeDigest: computeTreasuryExecutionScopeDigest({
      version: 1,
      missionId: "mission-econ",
      jobId: commandId,
      floorId: "floor02_scripting",
      overseerCommandId: commandId,
      kind: "INFERENCE",
      resourceId: "test-model",
    }),
  };
}

describe("Treasury Economic Intelligence", () => {
  it("derives unit economics from Treasury evidence and does not mutate state", async () => {
    const now = new Date("2026-10-03T08:00:00.000Z");
    const { service } = makeTreasury(now);

    const first = await service.reserve(command("cmd-econ-1", now, 1));
    await service.settle(first.reservation.reservationId, {
      reservationId: first.reservation.reservationId,
      actualCostUsd: 0.10,
      actualCapacityUnits: 0,
      actualTokens: 1_000,
      executionEvidenceId: "exec-econ-1",
      verified: false,
      measuredAt: new Date(now.getTime() + 1_000).toISOString(),
    });

    const second = await service.reserve(command("cmd-econ-2", now, 1));
    await service.settle(second.reservation.reservationId, {
      reservationId: second.reservation.reservationId,
      actualCostUsd: 0.20,
      actualCapacityUnits: 0,
      actualTokens: 1_000,
      executionEvidenceId: "exec-econ-2",
      verified: false,
      measuredAt: new Date(now.getTime() + 2_000).toISOString(),
    });

    const before = await service.getLedger().getAccount("factory");
    const snapshot = await new TreasuryEconomicIntelligence(createTreasuryEconomicReadSource(service)).analyze("factory", {
      windowMs: 60 * 60 * 1000,
      now: new Date("2026-10-03T08:30:00.000Z"),
    });
    const after = await service.getLedger().getAccount("factory");

    expect(snapshot.unitMetrics.settledCostUsd).toBeCloseTo(0.30, 8);
    expect(snapshot.unitMetrics.actualTokens).toBe(2_000);
    expect(snapshot.unitMetrics.costPer1kTokensUsd).toBeCloseTo(0.15, 8);
    expect(snapshot.unitMetrics.reservationUtilization).toBeCloseTo(0.15, 8);
    expect(
      snapshot.recommendations.some(
        (recommendation) => recommendation.kind === "REDUCE_WASTE",
      ),
    ).toBe(true);
    expect(after).toEqual(before);
  });

  it("surfaces verified render/short economics and right-sizing advice from settlement evidence", async () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    const { service } = makeTreasury(now);

    for (let i = 0; i < 5; i += 1) {
      const commandId = "cmd-render-" + i;
      const expiresAt = new Date(now.getTime() + 60_000).toISOString();
      const reserved = await service.reserve({
        commandId,
        overseerCommandId: commandId,
        issuer: { authority: "OVERSEER", issuerId: commandId },
        accountId: "factory",
        missionId: "mission-render",
        runId: "run-render",
        floorId: "floor06_rendering",
        taskId: commandId,
        attemptId: commandId,
        purpose: "verified render economics",
        resourceRequest: [{
          kind: "COMPUTE",
          workloadType: "RENDER",
          unit: "SECONDS",
          quantity: 10,
          scarcityUnits: 10,
          verificationRequired: true,
          paidRoute: false,
        }],
        budgetEnvelope: {
          maxCostUsd: 1,
          maxCapacityUnits: 10,
          maxRetries: 0,
        },
        priority: "NORMAL",
        expiresAt,
        idempotencyKey: commandId,
        scopeDigest: computeTreasuryExecutionScopeDigest({
          version: 1,
          missionId: "mission-render",
          jobId: commandId,
          floorId: "floor06_rendering",
          overseerCommandId: commandId,
          kind: "RENDER",
          resourceId: "render-test",
        }),
      });

      await service.settle(reserved.reservation.reservationId, {
        reservationId: reserved.reservation.reservationId,
        actualCostUsd: 0.2,
        actualCapacityUnits: 2,
        actualTokens: 0,
        executionEvidenceId: "exec-render-" + i,
        verificationReceiptId: "f07-receipt-" + i,
        verified: true,
        measuredAt: new Date(now.getTime() + 1_000 + i).toISOString(),
      });
    }

    const snapshot = await new TreasuryEconomicIntelligence(service).analyze(
      "factory",
      {
        windowMs: 60 * 60 * 1000,
        now: new Date("2026-10-03T12:30:00.000Z"),
      },
    );

    expect(snapshot.unitMetrics.costPerVerifiedRenderUsd).toBeCloseTo(0.2, 8);
    expect(snapshot.unitMetrics.costPerVerifiedShortUsd).toBeCloseTo(0.2, 8);

    const rightSizing = snapshot.reservationRightSizing.find(
      (item) => item.workloadType === "RENDER",
    );
    expect(rightSizing).toBeDefined();
    expect(rightSizing?.samples).toBe(5);
    expect(rightSizing?.recommendedReservationMultiplier).toBeLessThan(1);

    expect(
      snapshot.recommendations.some(
        (item) =>
          item.kind === "REDUCE_RESERVATION_SIZE" &&
          item.evidence.workloadType === "RENDER",
      ),
    ).toBe(true);
    expect(snapshot.forecast.projected7dSpendUsd).toBeGreaterThan(0);
  });

  it("raises a breach signal from a real Treasury envelope overrun", async () => {
    const now = new Date("2026-10-03T09:00:00.000Z");
    const { service } = makeTreasury(now);
    const reserved = await service.reserve(command("cmd-breach", now, 0.05));

    await expect(
      service.settle(reserved.reservation.reservationId, {
        reservationId: reserved.reservation.reservationId,
        actualCostUsd: 0.06,
        actualCapacityUnits: 0,
        actualTokens: 10,
        executionEvidenceId: "exec-breach",
        verified: false,
        measuredAt: new Date(now.getTime() + 1_000).toISOString(),
      }),
    ).rejects.toThrow(/Treasury frozen/);

    const snapshot = await new TreasuryEconomicIntelligence(service).analyze("factory", {
      windowMs: 60 * 60 * 1000,
      now: new Date("2026-10-03T09:30:00.000Z"),
    });

    expect(snapshot.unitMetrics.breachedReservations).toBe(1);
    expect(
      snapshot.signals.some(
        (signal) => signal.code === "TREASURY_BREACH_OR_FROZEN",
      ),
    ).toBe(true);
  });
});
