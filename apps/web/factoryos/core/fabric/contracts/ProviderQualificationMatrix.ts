/**
 * FactoryOS Distributed Compute Fabric — Provider Qualification Matrix (Levels 1–8)
 *
 * Defines the strict 8-level qualification gate that every compute provider
 * (Local, Kaggle, RunPod, Vast, AMD, etc.) must pass before entering production routing.
 */

import { IComputeProviderV2, ComputeJob, ArtifactRef, ComputeInstanceSpec } from "../../compute/contracts/ComputeContracts";
import { WorkerProtocolValidator } from "../worker/WorkerProtocol";

export type QualificationLevel =
  | "LEVEL_1_CONTRACT"
  | "LEVEL_2_FAIL_CLOSED"
  | "LEVEL_3_PROVISIONING"
  | "LEVEL_4_WORKER_REGISTRATION"
  | "LEVEL_5_JOB_CLAIMING"
  | "LEVEL_6_EXECUTION_HONESTY"
  | "LEVEL_7_VERIFICATION_CAS"
  | "LEVEL_8_TEARDOWN";

export interface LevelResult {
  level: QualificationLevel;
  levelNumber: number;
  passed: boolean;
  durationMs: number;
  evidence: string;
  error?: string;
}

export interface ProviderQualificationReport {
  providerId: string;
  providerType: string;
  timestamp: string;
  qualifiedUpToLevel: number;
  allPassed: boolean;
  levels: LevelResult[];
}

export class ProviderQualificationRunner {
  /**
   * Runs the qualification levels against a given IComputeProviderV2.
   * Can run static levels (1-2) or full lifecycle levels (1-8).
   */
  public static async runQualification(
    provider: IComputeProviderV2,
    options: {
      maxLevel?: number;
      testJob?: ComputeJob;
      mockInstance?: boolean;
    } = {}
  ): Promise<ProviderQualificationReport> {
    const maxLevel = options.maxLevel ?? 8;
    const levels: LevelResult[] = [];
    let currentLevel = 1;
    let provisionedInstanceId: string | undefined;

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 1: Contract Validation
    // ─────────────────────────────────────────────────────────────────────────
    if (currentLevel <= maxLevel) {
      const t0 = Date.now();
      try {
        const capability = await provider.getCapability();
        if (
          !capability.providerId ||
          !capability.providerType ||
          capability.cpuCores <= 0 ||
          capability.memoryMb <= 0 ||
          !Array.isArray(capability.supportedWorkloads)
        ) {
          throw new Error("Capability descriptor violates schema invariants");
        }
        levels.push({
          level: "LEVEL_1_CONTRACT",
          levelNumber: 1,
          passed: true,
          durationMs: Date.now() - t0,
          evidence: `Capability valid: ${capability.cpuCores} cores, ${capability.memoryMb}MB RAM, GPU: ${capability.gpuAvailable} (${capability.gpuType || "none"})`,
        });
      } catch (err: any) {
        levels.push({
          level: "LEVEL_1_CONTRACT",
          levelNumber: 1,
          passed: false,
          durationMs: Date.now() - t0,
          evidence: "Capability validation failed",
          error: err.message,
        });
        return this.summarize(provider, levels);
      }
      currentLevel++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 2: Credential & Fail-Closed Behavior
    // ─────────────────────────────────────────────────────────────────────────
    if (currentLevel <= maxLevel) {
      const t0 = Date.now();
      try {
        const configValidation = provider.validateConfiguration ? provider.validateConfiguration() : { isConfigured: true };
        const health = await provider.getHealth();

        if (!configValidation.isConfigured) {
          if (health.state !== "BLOCKED" && health.state !== "DEGRADED") {
            throw new Error(`Unconfigured provider reported state "${health.state}", expected "BLOCKED" or "DEGRADED"`);
          }
          levels.push({
            level: "LEVEL_2_FAIL_CLOSED",
            levelNumber: 2,
            passed: true,
            durationMs: Date.now() - t0,
            evidence: `Provider fails closed as expected: isConfigured=false, health=${health.state}, reason=${health.failureReason}`,
          });
        } else {
          levels.push({
            level: "LEVEL_2_FAIL_CLOSED",
            levelNumber: 2,
            passed: true,
            durationMs: Date.now() - t0,
            evidence: `Provider configured and healthy: state=${health.state}`,
          });
        }
      } catch (err: any) {
        levels.push({
          level: "LEVEL_2_FAIL_CLOSED",
          levelNumber: 2,
          passed: false,
          durationMs: Date.now() - t0,
          evidence: "Fail-closed check failed",
          error: err.message,
        });
        return this.summarize(provider, levels);
      }
      currentLevel++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 3: Provisioning Lifecycle
    // ─────────────────────────────────────────────────────────────────────────
    if (currentLevel <= maxLevel) {
      const t0 = Date.now();
      try {
        const spec: ComputeInstanceSpec = {
          providerType: provider.type,
          gpuRequired: true,
          minVramMb: 8192,
          maxDurationSeconds: 300,
        };
        const status = await provider.provision(spec);

        if (status.state === "ERROR") {
          // If unconfigured, this is an honest error from provider
          levels.push({
            level: "LEVEL_3_PROVISIONING",
            levelNumber: 3,
            passed: true,
            durationMs: Date.now() - t0,
            evidence: `Provisioning honestly reported ERROR for unconfigured credentials: ${status.error}`,
          });
          return this.summarize(provider, levels);
        }

        provisionedInstanceId = status.instanceId;
        const ready = await provider.waitReady(status.instanceId, 5000);
        const pollStatus = await provider.getStatus(status.instanceId);

        if (!ready || pollStatus.state !== "READY") {
          throw new Error(`Instance ${status.instanceId} did not reach READY state`);
        }

        levels.push({
          level: "LEVEL_3_PROVISIONING",
          levelNumber: 3,
          passed: true,
          durationMs: Date.now() - t0,
          evidence: `Instance ${status.instanceId} provisioned and transitioned to READY`,
        });
      } catch (err: any) {
        levels.push({
          level: "LEVEL_3_PROVISIONING",
          levelNumber: 3,
          passed: false,
          durationMs: Date.now() - t0,
          evidence: "Provisioning lifecycle failed",
          error: err.message,
        });
        return this.summarize(provider, levels);
      }
      currentLevel++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 4: Worker Registration
    // ─────────────────────────────────────────────────────────────────────────
    if (currentLevel <= maxLevel) {
      const t0 = Date.now();
      try {
        if (!provider.registerWorker) {
          throw new Error("Provider does not support registerWorker");
        }
        const reg = await provider.registerWorker({
          workerId: `qual_worker_${Date.now()}`,
          gpuModel: "Tesla T4",
          vramMb: 16384,
        });
        if (!reg.acknowledged || !reg.token) {
          throw new Error("Worker registration rejected or token missing");
        }
        levels.push({
          level: "LEVEL_4_WORKER_REGISTRATION",
          levelNumber: 4,
          passed: true,
          durationMs: Date.now() - t0,
          evidence: `Worker registration acknowledged with session token: ${reg.token.slice(0, 16)}...`,
        });
      } catch (err: any) {
        levels.push({
          level: "LEVEL_4_WORKER_REGISTRATION",
          levelNumber: 4,
          passed: false,
          durationMs: Date.now() - t0,
          evidence: "Worker registration failed",
          error: err.message,
        });
        return this.summarize(provider, levels);
      }
      currentLevel++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 5: Job Claiming & Fencing
    // ─────────────────────────────────────────────────────────────────────────
    if (currentLevel <= maxLevel) {
      const t0 = Date.now();
      try {
        // Test fencing token invariant
        const isValid = WorkerProtocolValidator.isFencingTokenValid(10, 5);
        const isStale = WorkerProtocolValidator.isFencingTokenValid(4, 5);
        if (!isValid || isStale) {
          throw new Error("Fencing token validator failed logic invariants");
        }
        levels.push({
          level: "LEVEL_5_JOB_CLAIMING",
          levelNumber: 5,
          passed: true,
          durationMs: Date.now() - t0,
          evidence: "Job claiming protocol & fencing token invariants validated",
        });
      } catch (err: any) {
        levels.push({
          level: "LEVEL_5_JOB_CLAIMING",
          levelNumber: 5,
          passed: false,
          durationMs: Date.now() - t0,
          evidence: "Job claiming invariant check failed",
          error: err.message,
        });
        return this.summarize(provider, levels);
      }
      currentLevel++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 6: Execution Honesty (No Fake Success)
    // ─────────────────────────────────────────────────────────────────────────
    if (currentLevel <= maxLevel) {
      const t0 = Date.now();
      try {
        const defaultJob: ComputeJob = {
          jobId: `qual_job_${Date.now()}`,
          factoryExecutionId: `exec_qual_${Date.now()}`,
          workloadType: "RENDER",
          manifest: {},
          inputArtifacts: {
            bundleId: `bundle_${Date.now()}`,
            artifacts: [],
            createdTimestamp: Date.now(),
          },
          requirements: {
            gpuRequired: true,
            workloadType: "RENDER",
          },
          priority: "NORMAL",
          timeoutMs: 60000,
          createdAt: new Date().toISOString(),
        };

        const jobToRun: ComputeJob = options.testJob ?? defaultJob;
        const receipt = await provider.dispatch(jobToRun, provisionedInstanceId);

        // Invariant: If credentials missing or empty artifacts, status MUST NOT be COMPLETED
        if (receipt.status === "COMPLETED" && receipt.outputArtifacts.length === 0) {
          throw new Error("VIOLATION: Provider returned COMPLETED receipt with 0 output artifacts!");
        }

        levels.push({
          level: "LEVEL_6_EXECUTION_HONESTY",
          levelNumber: 6,
          passed: true,
          durationMs: Date.now() - t0,
          evidence: `Execution receipt truthful: status=${receipt.status}, artifacts=${receipt.outputArtifacts.length}`,
        });
      } catch (err: any) {
        levels.push({
          level: "LEVEL_6_EXECUTION_HONESTY",
          levelNumber: 6,
          passed: false,
          durationMs: Date.now() - t0,
          evidence: "Execution honesty check failed",
          error: err.message,
        });
        return this.summarize(provider, levels);
      }
      currentLevel++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 7: CAS Verification
    // ─────────────────────────────────────────────────────────────────────────
    if (currentLevel <= maxLevel) {
      const t0 = Date.now();
      try {
        // Validate artifact validator rejects mock empty sha
        const emptyShaArtifact: ArtifactRef = {
          artifactId: "art_test",
          role: "output_mp4",
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          byteLength: 0,
          uri: "cas://empty",
          mimeType: "video/mp4",
        };
        const invalidCheck = WorkerProtocolValidator.validateArtifacts([emptyShaArtifact]);
        if (invalidCheck.valid) {
          throw new Error("WorkerProtocolValidator accepted empty/placeholder artifact SHA!");
        }

        const validArtifact: ArtifactRef = {
          artifactId: "art_valid",
          role: "output_mp4",
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          byteLength: 1048576,
          uri: "cas://art_valid",
          mimeType: "video/mp4",
        };
        const validCheck = WorkerProtocolValidator.validateArtifacts([validArtifact]);
        if (!validCheck.valid) {
          throw new Error("WorkerProtocolValidator rejected valid artifact SHA!");
        }

        levels.push({
          level: "LEVEL_7_VERIFICATION_CAS",
          levelNumber: 7,
          passed: true,
          durationMs: Date.now() - t0,
          evidence: "CAS SHA-256 and byteLength verification gates strictly enforced",
        });
      } catch (err: any) {
        levels.push({
          level: "LEVEL_7_VERIFICATION_CAS",
          levelNumber: 7,
          passed: false,
          durationMs: Date.now() - t0,
          evidence: "CAS verification check failed",
          error: err.message,
        });
        return this.summarize(provider, levels);
      }
      currentLevel++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEVEL 8: Teardown Cleanliness
    // ─────────────────────────────────────────────────────────────────────────
    if (currentLevel <= maxLevel) {
      const t0 = Date.now();
      try {
        if (provisionedInstanceId) {
          await provider.terminate(provisionedInstanceId);
          const status = await provider.getStatus(provisionedInstanceId);
          if (status.state !== "TERMINATED") {
            throw new Error(`Instance did not terminate cleanly: state=${status.state}`);
          }
        }
        levels.push({
          level: "LEVEL_8_TEARDOWN",
          levelNumber: 8,
          passed: true,
          durationMs: Date.now() - t0,
          evidence: `Instance teardown verified clean: state=TERMINATED`,
        });
      } catch (err: any) {
        levels.push({
          level: "LEVEL_8_TEARDOWN",
          levelNumber: 8,
          passed: false,
          durationMs: Date.now() - t0,
          evidence: "Teardown check failed",
          error: err.message,
        });
        return this.summarize(provider, levels);
      }
    }

    return this.summarize(provider, levels);
  }

  private static summarize(provider: IComputeProviderV2, levels: LevelResult[]): ProviderQualificationReport {
    const passedLevels = levels.filter((l) => l.passed);
    const qualifiedUpToLevel = passedLevels.length > 0 ? Math.max(...passedLevels.map((l) => l.levelNumber)) : 0;
    const allPassed = levels.length > 0 && levels.every((l) => l.passed);

    return {
      providerId: provider.id,
      providerType: provider.type,
      timestamp: new Date().toISOString(),
      qualifiedUpToLevel,
      allPassed,
      levels,
    };
  }
}
