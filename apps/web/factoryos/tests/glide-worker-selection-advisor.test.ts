import { describe, expect, it, vi, afterEach } from "vitest";
import { GlideDecisionAdapter } from "../core/intelligence/decision/GlideDecisionAdapter";
import {
  GlideWorkerSelectionAdvisor,
} from "../core/compute/router/GlideWorkerSelectionAdvisor";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function candidate(id: string, utilityScore: number, totalSeconds: number, activeJobs: number) {
  return {
    provider: { id, type: id.toUpperCase() } as any,
    capability: {
      providerId: id,
      providerType: id.toUpperCase(),
      executionModel: "CLOUD_JOB",
      cpuCores: 8,
      memoryMb: 32768,
      gpuAvailable: true,
      gpuType: "RTX 5090",
      hardwareVideoEncode: true,
      operatingSystem: "linux",
      supportedWorkloads: ["RENDER"],
      estimatedStartupSeconds: 2,
      transferBandwidthMbps: 1000,
      maxConcurrency: 4,
      maxJobDurationSeconds: 1800,
      isCredentialConfigured: true,
    },
    health: {
      state: "HEALTHY",
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      activeJobs,
      successRate: 0.98,
      avgLatencyMs: 1000,
    },
    estimatedTotalSeconds: totalSeconds,
    utilityScore,
    suitabilityReason: "test",
    scoreBreakdown: {
      queueWaitSeconds: activeJobs * 5,
      startupEstSeconds: 2,
      inputTransferSeconds: 1,
      environmentSetupSeconds: 2,
      executionEstSeconds: totalSeconds - 6,
      outputTransferSeconds: 0.5,
      verificationSeconds: 1,
      reliabilityPenalty: 1,
      policyBonus: 0,
      shortVideoAdjustment: 0,
      utilityScore,
    },
  } as any;
}

describe("GLiDE worker selection advisor", () => {
  it("passes only already-eligible candidates to GLiDE and returns its advisory choice", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        model: "glide",
        answers: {
          selectedWorker: {
            type: "choice",
            choice: "daytona",
            confidence: 0.55,
            probabilities: {
              daytona: 0.7,
              runpod: 0.15,
              vast: 0.15,
            },
          },
          deadlineWorker: {
            type: "choice",
            choice: "daytona",
            confidence: 0.7,
            probabilities: {
              daytona: 0.8,
              runpod: 0.1,
              vast: 0.1,
            },
          },
          reliableWorker: {
            type: "choice",
            choice: "daytona",
            confidence: 0.6,
            probabilities: {
              daytona: 0.7,
              runpod: 0.1,
              vast: 0.2,
            },
          },
          freeWorker: {
            type: "choice",
            choice: "daytona",
            confidence: 0.6,
            probabilities: {
              daytona: 0.7,
              runpod: 0.1,
              vast: 0.2,
            },
          },
        },
      }),
      text: async () => "",
    });

    vi.stubGlobal("fetch", fetchMock);

    const adapter = new GlideDecisionAdapter({
      enabled: true,
      apiKey: "test-key",
      maxRetries: 0,
    });

    const advisor = new GlideWorkerSelectionAdvisor({
      adapter,
      minimumConfidence: 0.35,
    });

    const result = await advisor.advise(
      {
        jobId: "render_123",
        workloadType: "RENDER",
        timeoutMs: 60000,
        requirements: {
          gpuRequired: true,
          minMemoryMb: 24576,
          estimatedDurationSeconds: 40,
        },
      },
      [
        candidate("daytona", 10, 38, 0),
        candidate("runpod", 12, 45, 1),
        candidate("vast", 14, 70, 0),
      ],
      new Map([
        [
          "daytona",
          {
            providerId: "daytona",
            providerType: "LOCAL",
            totalAttempts: 10,
            successfulExecutions: 9,
            failedExecutions: 1,
            avgStartupMs: 40,
            avgExecutionMs: 1200,
            avgTransferMs: 150,
            avgTotalMs: 1390,
            failureLog: [],
          },
        ],
      ]),
    );

    expect(result.status).toBe("ADVISED");
    expect(result.selectedProviderId).toBe("daytona");
    expect(result.candidateProviderIds).toEqual(["daytona", "runpod", "vast"]);
    expect(result.fastestProviderId).toBe("daytona");
    expect(result.mostReliableProviderId).toBe("daytona");
    expect(result.freestProviderId).toBe("daytona");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(body.questions)).toEqual([
      "selectedWorker",
      "deadlineWorker",
      "reliableWorker",
      "freeWorker",
    ]);

    expect(body.state.candidates).toHaveLength(3);
    expect(body.state.candidates[0].observedHistory.observedSuccessRate).toBeCloseTo(0.9, 5);
    expect(body.state.candidates[0].observedHistory.observedAvgTotalMs).toBe(1390);
    expect(body.state.candidates.every((item: any) => item.eligible === true)).toBe(true);
    expect(body.state.candidates.map((item: any) => item.providerId)).toEqual([
      "daytona",
      "runpod",
      "vast",
    ]);
  });

  it("never converts low GLiDE confidence into an authoritative selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        answers: {
          selectedWorker: {
            type: "choice",
            choice: "runpod",
            confidence: 0.1,
            probabilities: { daytona: 0.45, runpod: 0.55 },
          },
          deadlineWorker: {
            type: "choice",
            choice: "runpod",
            confidence: 0.1,
            probabilities: { daytona: 0.45, runpod: 0.55 },
          },
          reliableWorker: {
            type: "choice",
            choice: "daytona",
            confidence: 0.2,
            probabilities: { daytona: 0.6, runpod: 0.4 },
          },
          freeWorker: {
            type: "choice",
            choice: "daytona",
            confidence: 0.2,
            probabilities: { daytona: 0.6, runpod: 0.4 },
          },
        },
      }),
      text: async () => "",
    }));

    const advisor = new GlideWorkerSelectionAdvisor({
      adapter: new GlideDecisionAdapter({
        enabled: true,
        apiKey: "test-key",
        maxRetries: 0,
      }),
      minimumConfidence: 0.35,
    });

    const result = await advisor.advise(
      {
        jobId: "render_ambiguous",
        workloadType: "RENDER",
        timeoutMs: 60000,
        requirements: { gpuRequired: true },
      },
      [candidate("daytona", 10, 38, 0), candidate("runpod", 12, 45, 0)],
    );

    expect(result.status).toBe("UNRESOLVED");
    expect(result.selectedProviderId).toBeUndefined();
    expect(result.reason).toContain("below the configured shadow threshold");
  });

  it("fails closed when GLiDE is unavailable", async () => {
    const advisor = new GlideWorkerSelectionAdvisor();
    const result = await advisor.advise(
      {
        jobId: "render_offline",
        workloadType: "RENDER",
        timeoutMs: 60000,
        requirements: { gpuRequired: true },
      },
      [candidate("daytona", 10, 38, 0), candidate("runpod", 12, 45, 0)],
    );

    expect(result.status).toBe("UNRESOLVED");
    expect(result.selectedProviderId).toBeUndefined();
  });
});
