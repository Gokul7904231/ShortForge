import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BaseComputeProvider } from "./ComputeProvider";
import type {
  ComputeJob,
  ExecutionReceipt,
  ProviderCapability,
  ProviderConfigValidationResult,
  ProviderHealth,
} from "../contracts/ComputeContracts";
import { KaggleNotebookAdapter } from "../notebooks/KaggleNotebookAdapter";
import type { NotebookCredentialBundle } from "../notebooks/NotebookContracts";
import { ContentAddressedStore } from "../cas/ContentAddressedStore";

export interface KaggleNotebookComputeProviderOptions {
  credentials?: NotebookCredentialBundle;
  maxConcurrency?: number;
}

export class KaggleNotebookComputeProvider extends BaseComputeProvider {
  readonly id = "worker_kaggle_notebook";
  readonly type = "KAGGLE" as const;
  readonly executionModel = "EPHEMERAL_BATCH" as const;

  private readonly adapter = new KaggleNotebookAdapter();
  private readonly credentials?: NotebookCredentialBundle;
  private readonly maxConcurrency: number;
  private readonly cas = ContentAddressedStore.getInstance();
  private activeJobs = 0;
  private lastHealthAt = 0;
  private lastHealth?: ProviderHealth;

  constructor(options: KaggleNotebookComputeProviderOptions = {}) {
    super();
    this.credentials = options.credentials;
    this.maxConcurrency =
      options.maxConcurrency ||
      Number(process.env.KAGGLE_WORKER_MAX_CONCURRENCY || 1);
  }

  validateConfiguration(): ProviderConfigValidationResult {
    const env = { ...process.env, ...(this.credentials || {}) };
    const requiredKeys = [
      "KAGGLE_USERNAME",
      "KAGGLE_KEY",
      "KAGGLE_RENDER_COMMAND",
    ];
    const missingKeys = requiredKeys.filter((key) => !env[key]);
    return {
      isConfigured: missingKeys.length === 0,
      requiredKeys,
      missingKeys,
      errors: missingKeys.map(
        (key) => "Missing required configuration: " + key,
      ),
    };
  }

  async getCapability(): Promise<ProviderCapability> {
    const configured = this.validateConfiguration().isConfigured;
    return {
      providerId: this.id,
      providerType: this.type,
      executionModel: this.executionModel,
      cpuCores: 4,
      memoryMb: 16_384,
      gpuAvailable: configured,
      gpuType: process.env.KAGGLE_RENDER_GPU_TYPE || "NVIDIA Tesla T4",
      operatingSystem: "Kaggle hosted notebook runtime",
      supportedWorkloads: configured ? ["RENDER", "INFERENCE"] : [],
      estimatedStartupSeconds: Number(
        process.env.KAGGLE_WORKER_STARTUP_SECONDS || 35,
      ),
      transferBandwidthMbps: Number(
        process.env.KAGGLE_WORKER_TRANSFER_MBPS || 200,
      ),
      maxConcurrency: this.maxConcurrency,
      maxJobDurationSeconds: 43_200,
      isCredentialConfigured: configured,
    };
  }

  async getHealth(): Promise<ProviderHealth> {
    const now = Date.now();
    if (this.lastHealth && now - this.lastHealthAt < 15_000) {
      return { ...this.lastHealth };
    }

    const started = now;
    try {
      const result = await this.adapter.validateCredentials(this.credentials);
      const value: ProviderHealth = {
        state: result.authenticated ? "HEALTHY" : "BLOCKED",
        lastCheckedAt: result.checkedAt,
        consecutiveFailures: result.authenticated ? 0 : 1,
        failureReason: result.errorMessage,
        activeJobs: this.activeJobs,
        successRate: result.authenticated ? 1 : 0,
        avgLatencyMs: Date.now() - started,
      };
      this.lastHealth = value;
      this.lastHealthAt = Date.now();
      return { ...value };
    } catch (error: any) {
      const value: ProviderHealth = {
        state: "BLOCKED",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 1,
        failureReason: error?.message || String(error),
        activeJobs: this.activeJobs,
        successRate: 0,
        avgLatencyMs: Date.now() - started,
      };
      this.lastHealth = value;
      this.lastHealthAt = Date.now();
      return { ...value };
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.activeJobs >= this.maxConcurrency) return false;
    return (await this.getHealth()).state === "HEALTHY";
  }

  async executeJob(
    job: ComputeJob,
    onProgress?: (message: string) => void,
  ): Promise<ExecutionReceipt> {
    const startedAt = Date.now();
    const executionId =
      "exec_kaggle_worker_" +
      job.jobId +
      "_" +
      Date.now().toString(36);

    if (job.workloadType !== "RENDER") {
      return this.failedReceipt(
        job,
        executionId,
        64,
        "Kaggle notebook worker supports RENDER only.",
      );
    }

    const config = this.validateConfiguration();
    if (!config.isConfigured) {
      return this.failedReceipt(job, executionId, 126, config.errors.join("; "));
    }

    this.activeJobs++;
    let tempDir: string | undefined;

    try {
      const manifest = job.manifest as Record<string, any>;
      const command =
        typeof manifest.renderCommand === "string"
          ? manifest.renderCommand
          : String(process.env.KAGGLE_RENDER_COMMAND);
      const outputPath =
        typeof manifest.outputPath === "string" && manifest.outputPath
          ? manifest.outputPath
          : "/kaggle/working/shortforge-output.mp4";

      const request = {
        idempotencyKey: job.jobId + ":" + executionId,
        name: "ShortForge render " + job.jobId,
        command,
        outputPath,
        gpuType:
          typeof manifest.gpuType === "string" && manifest.gpuType
            ? manifest.gpuType
            : job.requirements.preferredGpuType,
        timeoutMs: job.timeoutMs,
        metadata: {
          factoryExecutionId: job.factoryExecutionId,
          missionId: job.missionId || "",
        },
      };

      onProgress?.("Submitting render worker to Kaggle.");
      const notebookStartedAt = Date.now();
      const result = await this.adapter.execute(
        {
          provision: request,
          command,
          timeoutMs: job.timeoutMs,
          outputPath,
        },
        this.credentials,
      );

      if (
        result.status !== "SUCCEEDED" ||
        result.verificationLevel !== "PHYSICAL_ARTIFACT_VERIFIED" ||
        !result.artifactPath ||
        !result.artifactSha256
      ) {
        return this.failedReceipt(
          job,
          executionId,
          result.status === "TIMED_OUT" ? 124 : 1,
          result.evidence.join("; ") +
            (result.limitation ? " " + result.limitation : ""),
          Date.now() - startedAt,
        );
      }

      tempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "shortforge-kaggle-worker-"),
      );
      const copied = path.join(tempDir, path.basename(result.artifactPath));
      await fs.copyFile(result.artifactPath, copied);
      const artifact = await this.cas.putFile(
        copied,
        "output_mp4",
        "video/mp4",
        {
          jobId: job.jobId,
          executionId,
          provider: "KAGGLE",
          remoteArtifactSha256: result.artifactSha256,
        },
      );

      if (
        artifact.sha256 !== result.artifactSha256 ||
        !(await this.cas.verify(artifact))
      ) {
        return this.failedReceipt(
          job,
          executionId,
          1,
          "Kaggle artifact failed local CAS integrity verification.",
          Date.now() - startedAt,
        );
      }

      return {
        receiptId: "rcpt_" + executionId,
        executionId,
        jobId: job.jobId,
        factoryExecutionId: job.factoryExecutionId,
        providerId: this.id,
        providerType: this.type,
        executionModel: this.executionModel,
        status: "COMPLETED",
        exitCode: 0,
        outputArtifacts: [artifact],
        metrics: {
          startupTimeMs:
            Number(process.env.KAGGLE_WORKER_STARTUP_SECONDS || 35) * 1000,
          executionTimeMs: Math.max(0, Date.now() - notebookStartedAt),
          transferTimeMs: Math.max(
            0,
            Date.now() - startedAt - (Math.max(0, Date.now() - notebookStartedAt)),
          ),
          totalTimeMs: Date.now() - startedAt,
        },
        stdoutSnippet: result.stdout?.slice(0, 1000),
        stderrSnippet: result.stderr?.slice(0, 1000),
        sha256Proof: artifact.sha256,
        verifiedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.failedReceipt(
        job,
        executionId,
        1,
        error?.message || String(error),
        Date.now() - startedAt,
      );
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
      this.activeJobs = Math.max(0, this.activeJobs - 1);
    }
  }

  private failedReceipt(
    job: ComputeJob,
    executionId: string,
    exitCode: number,
    reason: string,
    totalTimeMs = 0,
  ): ExecutionReceipt {
    return {
      receiptId: "rcpt_" + executionId,
      executionId,
      jobId: job.jobId,
      factoryExecutionId: job.factoryExecutionId,
      providerId: this.id,
      providerType: this.type,
      executionModel: this.executionModel,
      status: "FAILED",
      exitCode,
      outputArtifacts: [],
      metrics: {
        startupTimeMs: 0,
        executionTimeMs: 0,
        transferTimeMs: 0,
        totalTimeMs,
      },
      failureReason: reason,
    };
  }
}
