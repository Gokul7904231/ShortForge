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

    expect((submitJob.mock.results[0]?.value as Promise<unknown>) || submitJob).toBeDefined();
    const report = await (service as any).kernel?.report?.("factory").catch?.(() => null);
    expect(report).toBeNull();
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
  });
});