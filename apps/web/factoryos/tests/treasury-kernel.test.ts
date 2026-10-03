import { describe, expect, it } from "vitest";
import {
  DEFAULT_TREASURY_POLICY,
  InMemoryTreasuryLedger,
  TreasuryKernel,
  TreasuryDeniedError,
  TreasuryPriceRegistry,
  createTreasuryAccount,
  type TreasuryCommand,
} from "../core";

function command(overrides: Partial<TreasuryCommand> = {}): TreasuryCommand {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  return {
    commandId: "cmd-1",
    overseerCommandId: "ovr-1",
    issuer: { authority: "OVERSEER", issuerId: "overseer-test" },
    accountId: "factory",
    missionId: "mission-1",
    purpose: "Test compute reservation",
    resourceRequest: [{ kind: "COMPUTE", scarcityUnits: 10 }],
    budgetEnvelope: {
      maxCostUsd: 1,
      maxCapacityUnits: 10,
      maxDurationMs: 30_000,
    },
    priority: "NORMAL",
    expiresAt,
    idempotencyKey: "idem-1",
    scopeDigest: "sha256:test",
    ...overrides,
  };
}

function makeTreasury() {
  const ledger = new InMemoryTreasuryLedger();
  ledger.seedAccount(createTreasuryAccount("factory", 5, 100));
  const registry = new TreasuryPriceRegistry();
  const kernel = new TreasuryKernel(ledger, registry, DEFAULT_TREASURY_POLICY);
  return { ledger, kernel };
}

describe("Treasurer constitutional kernel", () => {
  it("accepts a bounded Overseer command and issues a non-owning permit", async () => {
    const { kernel } = makeTreasury();
    const result = await kernel.reserve(command());

    expect(result.reservation.status).toBe("ACTIVE");
    expect(result.permit.maxCostUsd).toBe(1);
    expect(result.permit.reservationId).toBe(result.reservation.reservationId);
  });

  it("rejects discretionary commands that are not from Overseer", async () => {
    const { kernel } = makeTreasury();
    const bad = command({ issuer: { authority: "OVERSEER", issuerId: "" } });
    await expect(kernel.reserve(bad)).rejects.toBeInstanceOf(TreasuryDeniedError);
  });

  it("is idempotent for the same command", async () => {
    const { kernel } = makeTreasury();
    const first = await kernel.reserve(command());
    const second = await kernel.reserve(command());

    expect(second.reservation.reservationId).toBe(first.reservation.reservationId);
  });

  it("requires verification evidence before settling production-artifact spend", async () => {
    const { kernel } = makeTreasury();
    const reserved = await kernel.reserve(command({
      resourceRequest: [{ kind: "COMPUTE", verificationRequired: true }],
    }));

    await expect(kernel.settle(reserved.reservation.reservationId, {
      reservationId: reserved.reservation.reservationId,
      actualCostUsd: 0.5,
      actualCapacityUnits: 5,
      executionEvidenceId: "exec-proof",
      verified: false,
      measuredAt: new Date().toISOString(),
    })).rejects.toBeInstanceOf(TreasuryDeniedError);
  });

  it("settles actual spend and releases the unused reservation", async () => {
    const { kernel } = makeTreasury();
    const reserved = await kernel.reserve(command());

    const settled = await kernel.settle(reserved.reservation.reservationId, {
      reservationId: reserved.reservation.reservationId,
      actualCostUsd: 0.5,
      actualCapacityUnits: 5,
      actualTokens: 1200,
      actualDurationMs: 1200,
      executionEvidenceId: "exec-proof",
      verified: true,
      measuredAt: new Date().toISOString(),
    });

    expect(settled.status).toBe("SETTLED");
    const report = await kernel.report("factory");
    expect(report.account.settledUsd).toBe(0.5);
    expect(report.account.reservedUsd).toBe(0);
    expect(report.account.availableUsd).toBe(4.5);
  });

  it("releases reservations without charging them", async () => {
    const { kernel } = makeTreasury();
    const reserved = await kernel.reserve(command());

    await kernel.release(reserved.reservation.reservationId);

    const report = await kernel.report("factory");
    expect(report.account.settledUsd).toBe(0);
    expect(report.account.availableUsd).toBe(5);
  });

  it("freezes the account when actual consumption exceeds the economic envelope", async () => {
    const { kernel } = makeTreasury();
    const reserved = await kernel.reserve(command());

    await expect(kernel.settle(reserved.reservation.reservationId, {
      reservationId: reserved.reservation.reservationId,
      actualCostUsd: 2,
      actualCapacityUnits: 5,
      executionEvidenceId: "exec-proof",
      verified: true,
      measuredAt: new Date().toISOString(),
    })).rejects.toBeInstanceOf(TreasuryDeniedError);

    const account = (await kernel.report("factory")).account;
    expect(account.mode).toBe("FROZEN");
  });

  it("never treats zero-cost capacity as unlimited capacity", async () => {
    const { kernel } = makeTreasury();
    await expect(kernel.reserve(command({
      budgetEnvelope: { maxCostUsd: 0, maxCapacityUnits: 101 },
    }))).rejects.toBeInstanceOf(TreasuryDeniedError);
  });

  it("blocks paid routes when Treasury policy has paid spend disabled", async () => {
    const { kernel } = makeTreasury();
    await expect(kernel.reserve(command({
      resourceRequest: [{ kind: "INFERENCE", paidRoute: true }],
    }))).rejects.toBeInstanceOf(TreasuryDeniedError);
  });

  it("can enter defensive mode and allow only bounded normal spend", async () => {
    const ledger = new InMemoryTreasuryLedger();
    ledger.seedAccount(createTreasuryAccount("defensive", 5, 100, "DEFENSIVE"));
    const kernel = new TreasuryKernel(ledger);

    const allowed = await kernel.reserve(command({
      accountId: "defensive",
      budgetEnvelope: { maxCostUsd: 0.5, maxCapacityUnits: 5 },
    }));
    expect(allowed.reservation.status).toBe("ACTIVE");

    await expect(kernel.reserve(command({
      commandId: "cmd-high",
      accountId: "defensive",
      priority: "HIGH",
      budgetEnvelope: { maxCostUsd: 2, maxCapacityUnits: 5 },
    }))).rejects.toBeInstanceOf(TreasuryDeniedError);
  });

  it("keeps settlement and release usable after a Treasury freeze", async () => {
    const { kernel } = makeTreasury();
    const reserved = await kernel.reserve(command());
    const freezeCommand = command({ commandId: "freeze-1", overseerCommandId: "ovr-freeze" });

    await kernel.freeze(freezeCommand, "test freeze");
    await expect(kernel.reserve(command({ commandId: "blocked-while-frozen" }))).rejects.toBeInstanceOf(TreasuryDeniedError);

    await kernel.release(reserved.reservation.reservationId, "CANCELLED");
    const report = await kernel.report("factory");
    expect(report.account.availableUsd).toBe(5);
  });
});
