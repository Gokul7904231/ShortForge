import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComputeGateway } from "../core/compute/gateway/ComputeGateway";
import { RenderFabric } from "../core/fabric/RenderFabric";
import { InMemoryTreasuryLedger, TreasuryKernel, TreasuryService, createTreasuryAccount } from "../core";
import { TreasuryPriceRegistry } from "../core/treasury/TreasuryPriceRegistry";
import type { RenderIntent } from "../core/contracts/RenderIntentContracts";
import type { ExecutionReceipt } from "../core/compute/contracts/ComputeContracts";

function intent(overseerCommandId?: string): RenderIntent {
  return {
    intentId: "intent-treasury-test",
    jobId: "job-treasury-test",
    missionId: "mission-treasury-test",
    overseerCommandId,
    compositionType: "FACTS_SHORTS",
    durationSeconds: 5,
    fps: 30,
    resolution: { width: 1080, height: 1920 },
    tracks: { visualAssets: [], audioTracks: [], captions: [] },
    preferredCompiler: "FFMPEG",
    constraints: { hardwareAccel: true },
    createdAt: new Date().toISOString(),
  };
}

function receipt(): ExecutionReceipt {
  return {
    receiptId: "receipt-treasury-test",
    executionId: "exec-treasury-test",
    jobId: "job-treasury-test",
    factoryExecutionId: "factory-treasury-test",
    providerId: "local-test",
    providerType: "LOCAL",
    executionModel: "LOCAL_PROCESS",
    status: "COMPLETED",
    exitCode: 0,
    outputArtifacts: [{
      artifactId: "artifact-treasury-test",
      role: "output_mp4",
      sha256: "a".repeat(64),
      byteLength: 1000,
      mimeType: "video/mp4",
      uri: "/tmp/treasury-test.mp4",
    }],
    metrics: { startupTimeMs: 1, executionTimeMs: 5, transferTimeMs: 1, totalTimeMs: 7 },
    rawReceipt: { duration_seconds: 5, width: 1080, height: 1920, fps: 30, video_codec: "h264", audio_codec: "aac" },
  };
}

describe("Treasury F06 compute admission", () => {
  let service: TreasuryService;
  let submitJob: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const ledger = new InMemoryTreasuryLedger();
    ledger.seedAccount(createTreasuryAccount("factory", 5, 1000));
    const kernel = new TreasuryKernel(ledger, new TreasuryPriceRegistry());
    service = new TreasuryService(kernel);
    submitJob = vi.spyOn(ComputeGateway, "getInstance").mockReturnValue({
      submitJob: vi.fn(async () => ({ receipt: receipt(), failovers: [] })),
    } as any);
  });

  it("reserves before physical compute and leaves settlement to F07", async () => {
    const fabric = new RenderFabric();
    await fabric.executeRender(intent("ovr-1"), {
      treasury: {
        service, accountId: "factory", overseerCommandId: "ovr-1",
        budgetEnvelope: { maxCostUsd: 0.10, maxCapacityUnits: 60, maxDurationMs: 60000 },
        scopeDigest: "sha256:scope-1",
      },
    });

    expect(submitJob).toHaveBeenCalledTimes(1);
    console.log("TREASURY_DEBUG_COMPUTE_GATEWAY_ARGS", JSON.stringify(submitJob.mock.calls[0]));
    expect(submitJob.mock.calls[0]?.[3]).toMatchObject({
      reservationId: expect.any(String),
      commandId: expect.any(String),
      missionId: "mission-treasury-test",
      scopeDigest: "sha256:scope-1",
      maxRetries: 0,
    });

    const report = await service.report("factory");
    expect(report.activeReservations).toBe(1);
    expect(report.account.settledUsd).toBe(0);
  });

  it("releases the Treasury reservation when physical dispatch fails", async () => {
    const gateway = { submitJob: vi.fn(async () => { throw new Error("provider unavailable"); }) };
    submitJob.mockReturnValue(gateway as any);
    const fabric = new RenderFabric();

    await expect(fabric.executeRender(intent("ovr-2"), {
      treasury: {
        service, accountId: "factory", overseerCommandId: "ovr-2",
        budgetEnvelope: { maxCostUsd: 0.10, maxCapacityUnits: 60, maxDurationMs: 60000 },
        scopeDigest: "sha256:scope-2",
      },
    })).rejects.toThrow("provider unavailable");

    const report = await service.report("factory");
    expect(report.activeReservations).toBe(0);
    expect(report.account.settledUsd).toBe(0);
  });

  it("releases the Treasury reservation when a completed provider returns no artifact", async () => {
    const gateway = {
      submitJob: vi.fn(async () => ({
        receipt: { ...receipt(), outputArtifacts: [] },
        failovers: [],
      })),
    };
    submitJob.mockReturnValue(gateway as any);
    const fabric = new RenderFabric();

    await expect(fabric.executeRender(intent("ovr-4"), {
      treasury: {
        service, accountId: "factory", overseerCommandId: "ovr-4",
        budgetEnvelope: { maxCostUsd: 0.10, maxCapacityUnits: 60, maxDurationMs: 60000 },
        scopeDigest: "sha256:scope-4",
      },
    })).rejects.toThrow("without a physical artifact receipt.");

    const report = await service.report("factory");
    expect(report.activeReservations).toBe(0);
    expect(report.account.settledUsd).toBe(0);
  });

  it("rejects Treasury-gated renders whose RenderIntent is not command-bound", async () => {
    const fabric = new RenderFabric();
    await expect(fabric.executeRender(intent(), {
      treasury: {
        service, accountId: "factory", overseerCommandId: "ovr-3",
        budgetEnvelope: { maxCostUsd: 0.10, maxCapacityUnits: 60, maxDurationMs: 60000 },
        scopeDigest: "sha256:scope-3",
      },
    })).rejects.toThrow("requires RenderIntent.overseerCommandId");

    const report = await service.report("factory");
    expect(report.activeReservations).toBe(0);
  });
});

describe("Treasury command authority", () => {
  it("rejects an issuer identity that does not match the Overseer command", async () => {
    const ledger = new InMemoryTreasuryLedger();
    ledger.seedAccount(createTreasuryAccount("factory", 5, 1000));
    const kernel = new TreasuryKernel(ledger, new TreasuryPriceRegistry());
    const service = new TreasuryService(kernel);

    await expect(service.quote({
      commandId: "cmd-authority-1",
      overseerCommandId: "ovr-authority-1",
      issuer: { authority: "OVERSEER", issuerId: "different-issuer" },
      accountId: "factory",
      missionId: "mission-authority-1",
      taskId: "job-authority-1",
      purpose: "F06 render",
      resourceRequest: [{
        kind: "COMPUTE",
        workloadType: "RENDER",
        requiresGpu: true,
        verificationRequired: true,
      }],
      budgetEnvelope: { maxCostUsd: 0.1, maxCapacityUnits: 10, maxRetries: 0 },
      priority: "HIGH",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      idempotencyKey: "authority-idem-1",
      scopeDigest: "sha256:authority-scope",
    })).rejects.toThrow("issuer identity must match the originating Overseer command");
  });
});

describe("Treasury permit scope", () => {
  it("rejects a permit replayed against another job scope", async () => {
    const ledger = new InMemoryTreasuryLedger();
    ledger.seedAccount(createTreasuryAccount("factory", 5, 1000));
    const kernel = new TreasuryKernel(ledger, new TreasuryPriceRegistry());
    const service = new TreasuryService(kernel);

    const { reservation, permit } = await service.reserve({
      commandId: "cmd-scope-1",
      overseerCommandId: "ovr-scope-1",
      issuer: { authority: "OVERSEER", issuerId: "ovr-scope-1" },
      accountId: "factory",
      missionId: "mission-scope-1",
      runId: "run-scope-1",
      floorId: "floor06_rendering",
      taskId: "job-scope-1",
      attemptId: "attempt-scope-1",
      purpose: "F06 render",
      resourceRequest: [{
        kind: "COMPUTE",
        workloadType: "RENDER",
        requiresGpu: true,
        scarcityUnits: 10,
        verificationRequired: true,
      }],
      budgetEnvelope: {
        maxCostUsd: 0.1,
        maxCapacityUnits: 10,
        maxDurationMs: 60000,
        maxRetries: 0,
      },
      priority: "HIGH",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      idempotencyKey: "scope-idem-1",
      scopeDigest: "sha256:scope-one",
    });

    await expect(service.validatePermit(permit, {
      jobId: "different-job",
      missionId: reservation.missionId,
      scopeDigest: reservation.scopeDigest,
      accountId: reservation.accountId,
    })).rejects.toThrow("not bound to this execution scope");
  });
});
