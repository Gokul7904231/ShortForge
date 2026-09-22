/**
 * Provider Qualification Matrix v2 — Vitest Suite
 *
 * Verifies the 8-level qualification protocol for IComputeProviderV2 implementations,
 * specifically KaggleComputeProvider.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KaggleComputeProvider } from "../core/compute/providers/KaggleComputeProvider";
import { ProviderQualificationRunner } from "../core/fabric/contracts/ProviderQualificationMatrix";
import { WorkerProtocolValidator } from "../core/fabric/worker/WorkerProtocol";
import { ComputeJob } from "../core/compute/contracts/ComputeContracts";

describe("Provider Qualification Matrix v2 — KaggleComputeProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.KAGGLE_USERNAME;
    delete process.env.KAGGLE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("Level 1 & 2: Truthfully fails closed when Kaggle credentials are missing", async () => {
    const provider = new KaggleComputeProvider();

    const report = await ProviderQualificationRunner.runQualification(provider, {
      maxLevel: 2,
    });

    expect(report.levels.length).toBe(2);
    expect(report.levels[0].passed).toBe(true);
    expect(report.levels[0].evidence).toContain("Tesla T4");

    expect(report.levels[1].passed).toBe(true);
    expect(report.levels[1].evidence).toContain("fails closed as expected: isConfigured=false, health=BLOCKED");

    const health = await provider.getHealth();
    expect(health.state).toBe("BLOCKED");
    expect(health.failureReason).toContain("credentials not yet provisioned");
  });

  it("Levels 1 through 8: Full lifecycle qualification with configured credentials", async () => {
    process.env.KAGGLE_USERNAME = "test_factoryos_bot";
    process.env.KAGGLE_KEY = "test_api_key_0123456789abcdef";

    const provider = new KaggleComputeProvider();

    // Configure a test job with a valid output artifact to test Level 6 execution honesty
    const testJob: ComputeJob = {
      jobId: "job_test_qual_01",
      factoryExecutionId: "exec_test_01",
      workloadType: "RENDER",
      priority: "HIGH",
      timeoutMs: 60000,
      inputArtifacts: {
        bundleId: "bundle_test_01",
        artifacts: [],
        createdTimestamp: Date.now(),
      },
      requirements: {
        gpuRequired: true,
        workloadType: "RENDER",
      },
      manifest: {
        outputArtifacts: [
          {
            artifactId: "art_rendered_short_01",
            role: "output_mp4",
            sha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
            byteLength: 4567890,
            uri: "cas://rendered/short_01.mp4",
            mimeType: "video/mp4",
          },
        ],
      },
      createdAt: new Date().toISOString(),
    };

    const report = await ProviderQualificationRunner.runQualification(provider, {
      maxLevel: 8,
      testJob,
    });

    expect(report.allPassed).toBe(true);
    expect(report.qualifiedUpToLevel).toBe(8);
    expect(report.levels.map((l) => l.level)).toEqual([
      "LEVEL_1_CONTRACT",
      "LEVEL_2_FAIL_CLOSED",
      "LEVEL_3_PROVISIONING",
      "LEVEL_4_WORKER_REGISTRATION",
      "LEVEL_5_JOB_CLAIMING",
      "LEVEL_6_EXECUTION_HONESTY",
      "LEVEL_7_VERIFICATION_CAS",
      "LEVEL_8_TEARDOWN",
    ]);

    // Verify each level passed with high confidence
    for (const level of report.levels) {
      expect(level.passed).toBe(true);
      expect(level.error).toBeUndefined();
    }
  });

  it("Level 6 rejects simulated empty-artifact completion (Honesty Enforcement)", async () => {
    process.env.KAGGLE_USERNAME = "test_factoryos_bot";
    process.env.KAGGLE_KEY = "test_api_key_0123456789abcdef";

    const provider = new KaggleComputeProvider();

    // Dispatch a job with NO output artifacts
    const emptyJob: ComputeJob = {
      jobId: "job_empty_art",
      factoryExecutionId: "exec_empty",
      workloadType: "RENDER",
      priority: "NORMAL",
      timeoutMs: 60000,
      inputArtifacts: {
        bundleId: "bundle_empty",
        artifacts: [],
        createdTimestamp: Date.now(),
      },
      requirements: {
        gpuRequired: true,
        workloadType: "RENDER",
      },
      manifest: {},
      createdAt: new Date().toISOString(),
    };

    const receipt = await provider.dispatch(emptyJob);

    // Invariant: Must fail closed instead of returning fake COMPLETED
    expect(receipt.status).toBe("FAILED");
    expect(receipt.failureReason).toContain("produced no valid output artifacts");
    expect(receipt.outputArtifacts).toHaveLength(0);
  });

  it("Level 7 CAS validator strictly rejects empty or corrupt digests", () => {
    const invalidResult = WorkerProtocolValidator.validateArtifacts([
      {
        artifactId: "bad_sha",
        role: "output_mp4",
        sha256: "too_short",
        byteLength: 100,
        uri: "cas://bad",
        mimeType: "video/mp4",
      },
    ]);
    expect(invalidResult.valid).toBe(false);

    const emptyShaResult = WorkerProtocolValidator.validateArtifacts([
      {
        artifactId: "empty_sha",
        role: "output_mp4",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        byteLength: 0,
        uri: "cas://empty",
        mimeType: "video/mp4",
      },
    ]);
    expect(emptyShaResult.valid).toBe(false);
  });

  it("RunPodComputeProvider: Fails closed when unconfigured and qualifies through Levels 1-8 when configured", async () => {
    delete process.env.RUNPOD_API_KEY;
    const unconfigured = new (await import("../core/compute/providers/RunPodComputeProvider")).RunPodComputeProvider();
    const blockedReport = await ProviderQualificationRunner.runQualification(unconfigured, { maxLevel: 2 });
    expect(blockedReport.levels[1].passed).toBe(true);
    expect(blockedReport.levels[1].evidence).toContain("health=BLOCKED");

    process.env.RUNPOD_API_KEY = "test_runpod_secret_123456";
    const configured = new (await import("../core/compute/providers/RunPodComputeProvider")).RunPodComputeProvider();
    const testJob: ComputeJob = {
      jobId: "job_runpod_qual",
      factoryExecutionId: "exec_runpod_01",
      workloadType: "RENDER",
      priority: "CRITICAL",
      timeoutMs: 60000,
      inputArtifacts: { bundleId: "b1", artifacts: [], createdTimestamp: Date.now() },
      requirements: { gpuRequired: true, workloadType: "RENDER" },
      manifest: {
        outputArtifacts: [
          {
            artifactId: "art_runpod_01",
            role: "output_mp4",
            sha256: "b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1",
            byteLength: 8192000,
            uri: "cas://rendered/runpod.mp4",
            mimeType: "video/mp4",
          },
        ],
      },
      createdAt: new Date().toISOString(),
    };
    const qualReport = await ProviderQualificationRunner.runQualification(configured, { maxLevel: 8, testJob });
    expect(qualReport.allPassed).toBe(true);
    expect(qualReport.qualifiedUpToLevel).toBe(8);
  });

  it("VastComputeProvider: Fails closed when unconfigured and qualifies through Levels 1-8 when configured", async () => {
    delete process.env.VAST_API_KEY;
    const unconfigured = new (await import("../core/compute/providers/VastComputeProvider")).VastComputeProvider();
    const blockedReport = await ProviderQualificationRunner.runQualification(unconfigured, { maxLevel: 2 });
    expect(blockedReport.levels[1].passed).toBe(true);
    expect(blockedReport.levels[1].evidence).toContain("health=BLOCKED");

    process.env.VAST_API_KEY = "test_vast_secret_654321";
    const configured = new (await import("../core/compute/providers/VastComputeProvider")).VastComputeProvider();
    const testJob: ComputeJob = {
      jobId: "job_vast_qual",
      factoryExecutionId: "exec_vast_01",
      workloadType: "RENDER",
      priority: "NORMAL",
      timeoutMs: 60000,
      inputArtifacts: { bundleId: "b2", artifacts: [], createdTimestamp: Date.now() },
      requirements: { gpuRequired: true, workloadType: "RENDER" },
      manifest: {
        outputArtifacts: [
          {
            artifactId: "art_vast_01",
            role: "output_mp4",
            sha256: "c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2",
            byteLength: 6144000,
            uri: "cas://rendered/vast.mp4",
            mimeType: "video/mp4",
          },
        ],
      },
      createdAt: new Date().toISOString(),
    };
    const qualReport = await ProviderQualificationRunner.runQualification(configured, { maxLevel: 8, testJob });
    expect(qualReport.allPassed).toBe(true);
    expect(qualReport.qualifiedUpToLevel).toBe(8);
  });
});
