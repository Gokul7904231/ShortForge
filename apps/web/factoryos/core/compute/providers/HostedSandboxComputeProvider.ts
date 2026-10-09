import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BaseComputeProvider } from "../providers/ComputeProvider";
import type {
  ComputeJob,
  ExecutionReceipt,
  ProviderCapability,
  ProviderConfigValidationResult,
  ProviderHealth,
  ProviderExecutionModel,
  ProviderType,
} from "../contracts/ComputeContracts";
import { ContentAddressedStore } from "../cas/ContentAddressedStore";
import type {
  SandboxCredentialBundle,
  SandboxProviderAdapter,
  SandboxRuntime,
} from "../sandboxes/SandboxContracts";

const HEALTH_CACHE_MS = 15_000;

export interface HostedSandboxComputeProviderOptions {
  adapter: SandboxProviderAdapter;
  credentials?: SandboxCredentialBundle;
  cpuCores?: number;
  memoryMb?: number;
  gpuType?: string;
  gpuCount?: number;
  maxConcurrency?: number;
  startupSeconds?: number;
  transferBandwidthMbps?: number;
  renderCommandEnv?: string;
  renderOutputPathEnv?: string;
}

export class HostedSandboxComputeProvider extends BaseComputeProvider {
  readonly id: string;
  readonly type: ProviderType;
  readonly executionModel: ProviderExecutionModel = "CLOUD_JOB";

  private readonly adapter: SandboxProviderAdapter;
  private readonly credentials?: SandboxCredentialBundle;
  private readonly cpuCores: number;
  private readonly memoryMb: number;
  private readonly gpuType?: string;
  private readonly gpuCount: number;
  private readonly maxConcurrency: number;
  private readonly startupSeconds: number;
  private readonly transferBandwidthMbps: number;
  private readonly renderCommandEnv: string;
  private readonly renderOutputPathEnv: string;
  private readonly cas: ContentAddressedStore;
  private activeJobs = 0;
  private lastHealthAt = 0;
  private lastHealth?: ProviderHealth;

  constructor(options: HostedSandboxComputeProviderOptions) {
    super();
    this.adapter = options.adapter;
    this.credentials = options.credentials;
    this.id = options.adapter.metadata.providerId;
    this.type = options.adapter.metadata.providerType as ProviderType;
    this.cpuCores = options.cpuCores || Number(process.env.SANDBOX_WORKER_CPU_CORES || 4);
    this.memoryMb = options.memoryMb || Number(process.env.SANDBOX_WORKER_MEMORY_MB || 16_384);
    this.gpuType = options.gpuType || process.env.SANDBOX_WORKER_GPU_TYPE;
    this.gpuCount = options.gpuCount || Number(process.env.SANDBOX_WORKER_GPU_COUNT || 1);
    this.maxConcurrency = options.maxConcurrency || Number(process.env.SANDBOX_WORKER_MAX_CONCURRENCY || 1);
    this.startupSeconds = options.startupSeconds || Number(process.env.SANDBOX_WORKER_STARTUP_SECONDS || 3);
    this.transferBandwidthMbps =
      options.transferBandwidthMbps ||
      Number(process.env.SANDBOX_WORKER_TRANSFER_MBPS || 1000);
    this.renderCommandEnv =
      options.renderCommandEnv ||
      "SHORTFORGE_SANDBOX_RENDER_COMMAND";
    this.renderOutputPathEnv =
      options.renderOutputPathEnv ||
      "SHORTFORGE_SANDBOX_OUTPUT_PATH";
    this.cas = ContentAddressedStore.getInstance();
  }

  validateConfiguration(): ProviderConfigValidationResult {
    const command = process.env[this.renderCommandEnv];
    const outputPath = process.env[this.renderOutputPathEnv];
    const requiredCredentialKeys =
      this.type === "DAYTONA"
        ? ["DAYTONA_API_KEY"]
        : this.type === "MODAL"
          ? ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"]
          : ["INSTAVM_API_KEY"];

    const missingKeys: string[] = requiredCredentialKeys.filter(
      (key) => !(this.credentials?.[key] || process.env[key]),
    );
    if (!command) missingKeys.push(this.renderCommandEnv);
    if (!outputPath) missingKeys.push(this.renderOutputPathEnv);

    return {
      isConfigured: missingKeys.length === 0,
      requiredKeys: missingKeys,
      missingKeys,
      errors: missingKeys.map((key) => "Missing required environment variable: " + key),
    };
  }

  async getCapability(): Promise<ProviderCapability> {
    const configured = this.validateConfiguration().isConfigured;
    return {
      providerId: this.id,
      providerType: this.type,
      executionModel: this.executionModel,
      cpuCores: this.cpuCores,
      memoryMb: this.memoryMb,
      gpuAvailable: Boolean(this.gpuType) && this.gpuCount > 0,
      hardwareVideoEncode: false,
      gpuType: this.gpuType,
      operatingSystem: "Hosted sandbox",
      supportedWorkloads: configured ? ["RENDER"] : [],
      estimatedStartupSeconds: this.startupSeconds,
      transferBandwidthMbps: this.transferBandwidthMbps,
      maxConcurrency: this.maxConcurrency,
      maxJobDurationSeconds: 3600,
      isCredentialConfigured: configured,
    };
  }

  async getHealth(): Promise<ProviderHealth> {
    if (Date.now() - this.lastHealthAt < HEALTH_CACHE_MS && this.lastHealth) {
      return { ...this.lastHealth };
    }

    const config = this.validateConfiguration();
    if (!config.isConfigured) {
      return this.cacheHealth({
        state: "BLOCKED",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
        failureReason: config.errors.join("; "),
        activeJobs: this.activeJobs,
        successRate: 0,
        avgLatencyMs: 0,
      });
    }

    const healthStartedAt = Date.now();
    try {
      const result = await this.adapter.validateCredentials(this.credentials);
      return this.cacheHealth({
        state: result.authenticated ? "HEALTHY" : "DEGRADED",
        lastCheckedAt: result.checkedAt,
        consecutiveFailures: result.authenticated ? 0 : 1,
        failureReason: result.errorMessage,
        activeJobs: this.activeJobs,
        successRate: result.authenticated ? 1 : 0,
        avgLatencyMs: Date.now() - healthStartedAt,
      });
    } catch (error: any) {
      return this.cacheHealth({
        state: "BLOCKED",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 1,
        failureReason: error?.message || String(error),
        activeJobs: this.activeJobs,
        successRate: 0,
        avgLatencyMs: 0,
      });
    }
  }

  async isAvailable(): Promise<boolean> {
    const config = this.validateConfiguration();
    if (!config.isConfigured || this.activeJobs >= this.maxConcurrency) return false;
    const health = await this.getHealth();
    return health.state === "HEALTHY";
  }

  async executeJob(
    job: ComputeJob,
    onProgress?: (message: string) => void,
  ): Promise<ExecutionReceipt> {
    const startedAt = Date.now();
    const executionId =
      "exec_" + this.type.toLowerCase() + "_" + job.jobId + "_" + Date.now().toString(36);

    if (job.workloadType !== "RENDER") {
      return this.failedReceipt(job, executionId, 64, "Hosted sandbox worker only supports RENDER.");
    }

    const config = this.validateConfiguration();
    if (!config.isConfigured) {
      return this.failedReceipt(
        job,
        executionId,
        126,
        "Hosted sandbox worker is not configured: " + config.errors.join("; "),
      );
    }

    this.activeJobs++;
    let runtime: SandboxRuntime | undefined;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shortforge-sandbox-worker-"));

    try {
      const manifestPath = path.join(tempDir, "job-manifest.json");
      await fs.writeFile(
        manifestPath,
        JSON.stringify(
          {
            jobId: job.jobId,
            factoryExecutionId: job.factoryExecutionId,
            missionId: job.missionId,
            manifest: job.manifest,
            requirements: job.requirements,
          },
          null,
          2,
        ),
        "utf8",
      );

      onProgress?.("Provisioning hosted sandbox worker: " + this.type);
      const provision = await this.adapter.provision(
        {
          idempotencyKey: job.jobId + ":" + executionId,
          template:
            this.type === "DAYTONA"
              ? process.env.DAYTONA_SANDBOX_IMAGE
              : this.type === "MODAL"
                ? process.env.MODAL_SANDBOX_IMAGE
                : process.env.INSTAVM_SNAPSHOT_ID,
          ttlSeconds: Math.max(60, Math.ceil(job.timeoutMs / 1000) + 120),
          metadata: {
            shortforge_name: "shortforge-" + executionId,
            gpuType: this.gpuType || "",
            gpuCount: String(this.gpuCount),
            cpuCores: String(this.cpuCores),
            memoryGb: String(Math.ceil(this.memoryMb / 1024)),
          },
        },
        this.credentials,
      );
      runtime = provision.runtime;

      if (runtime.state !== "RUNNING" && runtime.state !== "READY") {
        runtime = await this.adapter.waitReady(
          runtime.resourceId,
          Math.min(60_000, job.timeoutMs),
          this.credentials,
        );
      }

      const remoteManifestPath = "/tmp/shortforge/job-manifest.json";
      if (this.adapter.uploadFile) {
        await this.adapter.uploadFile(
          {
            runtime,
            localPath: manifestPath,
            remotePath: remoteManifestPath,
            timeoutMs: Math.min(300_000, job.timeoutMs),
          },
          this.credentials,
        );
      }

      const outputPath =
        String(process.env[this.renderOutputPathEnv]) ||
        "/tmp/shortforge/output.mp4";
      const commandTemplate = String(process.env[this.renderCommandEnv]);
      const command = commandTemplate
        .replaceAll("{{JOB_ID}}", shellQuote(job.jobId))
        .replaceAll("{{EXECUTION_ID}}", shellQuote(executionId))
        .replaceAll("{{MANIFEST_PATH}}", shellQuote(remoteManifestPath))
        .replaceAll("{{OUTPUT_PATH}}", shellQuote(outputPath));

      onProgress?.("Running ShortForge render worker command in " + this.type);
      const result = await this.adapter.execute(
        {
          runtime,
          command,
          timeoutMs: job.timeoutMs,
          env: {
            SHORTFORGE_JOB_ID: job.jobId,
            SHORTFORGE_EXECUTION_ID: executionId,
            SHORTFORGE_MANIFEST_PATH: remoteManifestPath,
            SHORTFORGE_OUTPUT_PATH: outputPath,
          },
        },
        this.credentials,
      );

      if (result.status !== "SUCCEEDED") {
        return this.failedReceipt(
          job,
          executionId,
          result.exitCode || 1,
          result.evidence.join("; ") + (result.limitation ? " " + result.limitation : ""),
          Date.now() - startedAt,
        );
      }

      if (!this.adapter.downloadFile) {
        return this.failedReceipt(
          job,
          executionId,
          1,
          "Hosted sandbox completed but has no artifact download capability.",
          Date.now() - startedAt,
        );
      }

      const localOutputPath = path.join(tempDir, path.basename(outputPath));
      await this.adapter.downloadFile(
        {
          runtime,
          remotePath: outputPath,
          localPath: localOutputPath,
          timeoutMs: Math.min(600_000, job.timeoutMs),
        },
        this.credentials,
      );

      const artifact = await this.cas.putFile(
        localOutputPath,
        "output_mp4",
        "video/mp4",
        {
          jobId: job.jobId,
          executionId,
          provider: this.type,
          sandboxRuntimeId: runtime.resourceId,
        },
      );

      if (!(await this.cas.verify(artifact))) {
        return this.failedReceipt(
          job,
          executionId,
          1,
          "Hosted sandbox output failed local CAS integrity verification.",
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
          startupTimeMs: this.startupSeconds * 1000,
          executionTimeMs: result.durationMs || 0,
          transferTimeMs: Math.max(0, Date.now() - startedAt - (result.durationMs || 0)),
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
      if (runtime) {
        await this.adapter.terminate(runtime, this.credentials).catch(() => undefined);
      }
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      this.activeJobs = Math.max(0, this.activeJobs - 1);
    }
  }

  private cacheHealth(value: ProviderHealth): ProviderHealth {
    this.lastHealth = value;
    this.lastHealthAt = Date.now();
    return { ...value };
  }

  private failedReceipt(
    job: ComputeJob,
    executionId: string,
    exitCode: number,
    failureReason: string,
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
      failureReason,
    };
  }
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
