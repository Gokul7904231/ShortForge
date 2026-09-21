/**
 * FactoryOS Compute Router & Utility-Based Scheduler
 *
 * Implements deterministic provider selection based on end-to-end completion utility:
 * Utility Cost = Queue Wait + Startup + Input Transfer + Environment Setup + Execution + Output Transfer + Verification
 *
 * Enforces health-aware routing, failover, and strict isolation between
 * factory job identity and provider execution identity.
 */

import {
  ComputeJob,
  ComputePolicy,
  ExecutionReceipt,
  ProviderCapability,
  ProviderHealth,
  ProviderType,
  DEFAULT_COMPUTE_POLICY,
} from "../contracts/ComputeContracts";
import { IComputeProvider } from "../providers/ComputeProvider";

export interface UtilityScoreBreakdown {
  queueWaitSeconds: number;
  startupEstSeconds: number;
  inputTransferSeconds: number;
  environmentSetupSeconds: number;
  executionEstSeconds: number;
  outputTransferSeconds: number;
  verificationSeconds: number;
  reliabilityPenalty: number;
  policyBonus: number;
  shortVideoAdjustment: number;
  utilityScore: number;
}

export interface ScheduledProviderCandidate {
  provider: IComputeProvider;
  capability: ProviderCapability;
  health: ProviderHealth;
  estimatedTotalSeconds: number;
  utilityScore: number; // lower cost = better score
  suitabilityReason: string;
  scoreBreakdown: UtilityScoreBreakdown;
}

export interface RoutingDecision {
  jobId: string;
  selectedCandidate: ScheduledProviderCandidate;
  selectedProvider: IComputeProvider;
  scoreBreakdown: UtilityScoreBreakdown;
  reason: string;
  evaluatedCandidates: ScheduledProviderCandidate[];
  rejectionReasons: Record<string, string>;
  routedAt: string;
}

export interface ProviderPerformanceTelemetry {
  providerId: string;
  providerType: ProviderType;
  totalAttempts: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgStartupMs: number;
  avgExecutionMs: number;
  avgTransferMs: number;
  avgTotalMs: number;
  lastUsedAt?: string;
  failureLog: Array<{ timestamp: string; jobId: string; reason: string }>;
}

export class ComputeRouter {
  private providers: Map<string, IComputeProvider> = new Map();
  private policy: ComputePolicy;
  private telemetry: Map<string, ProviderPerformanceTelemetry> = new Map();
  private receipts: ExecutionReceipt[] = [];

  constructor(policy: ComputePolicy = DEFAULT_COMPUTE_POLICY) {
    this.policy = policy;
  }

  public registerProvider(provider: IComputeProvider): void {
    this.providers.set(provider.id, provider);
    if (!this.telemetry.has(provider.id)) {
      this.telemetry.set(provider.id, {
        providerId: provider.id,
        providerType: provider.type,
        totalAttempts: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        avgStartupMs: 0,
        avgExecutionMs: 0,
        avgTransferMs: 0,
        avgTotalMs: 0,
        failureLog: [],
      });
    }
  }

  public getProvider(id: string): IComputeProvider | undefined {
    return this.providers.get(id);
  }

  public getAllProviders(): IComputeProvider[] {
    return Array.from(this.providers.values());
  }

  public getProviders(): IComputeProvider[] {
    return this.getAllProviders();
  }

  public getPerformanceComparison(): Record<string, ProviderPerformanceTelemetry> {
    const report: Record<string, ProviderPerformanceTelemetry> = {};
    for (const [id, tel] of this.telemetry.entries()) {
      report[id] = { ...tel, failureLog: [...tel.failureLog] };
    }
    return report;
  }

  public getProviderTelemetry(providerId: string): ProviderPerformanceTelemetry | undefined {
    const tel = this.telemetry.get(providerId);
    return tel ? { ...tel, failureLog: [...tel.failureLog] } : undefined;
  }

  public getExecutionHistory(): ExecutionReceipt[] {
    return [...this.receipts];
  }

  /**
   * Plans the optimal compute provider based on utility modeling (Section 9).
   */
  public async planProvider(job: ComputeJob): Promise<RoutingDecision> {
    const candidates: ScheduledProviderCandidate[] = [];
    const rejectionReasons: Record<string, string> = {};

    for (const provider of this.providers.values()) {
      // 1. Policy check: is provider type allowed?
      if (!this.policy.allowedProviders.includes(provider.type)) {
        rejectionReasons[provider.id] = `Provider type ${provider.type} not permitted by ComputePolicy.`;
        continue;
      }

      // 2. Health check
      const health = await provider.getHealth();
      if (health.state === "BLOCKED" || health.state === "DRAINING") {
        rejectionReasons[provider.id] = `Provider is ${health.state}: ${health.failureReason || "Unhealthy"}`;
        continue;
      }

      // 3. Capability check
      const capability = await provider.getCapability();
      if (!capability.supportedWorkloads.includes(job.workloadType)) {
        rejectionReasons[provider.id] = `Provider does not support workload ${job.workloadType}`;
        continue;
      }

      if (job.requirements.gpuRequired && !capability.gpuAvailable) {
        rejectionReasons[provider.id] = `Workload requires GPU but provider has no GPU available`;
        continue;
      }

      // 4. Utility Model Calculation (Section 9)
      // Total Estimated Duration = Queue Wait + Startup + Input Transfer + Environment Setup + Execution + Output Transfer + Verification
      const queueWaitSeconds = health.activeJobs * 5.0;
      const startupSeconds = capability.estimatedStartupSeconds;
      const inputTransferSeconds = Math.max(0.1, (job.requirements.diskSpaceMb || 10) / (capability.transferBandwidthMbps / 8));
      const environmentSetupSeconds = capability.executionModel === "LOCAL_PROCESS" ? 0 : 2.0;

      // Base execution duration (scales by GPU acceleration if available)
      const baseExecutionSeconds = job.requirements.estimatedDurationSeconds || 5.0;
      const executionSeconds = capability.gpuAvailable ? baseExecutionSeconds * 0.5 : baseExecutionSeconds;
      const outputTransferSeconds = Math.max(0.1, 5 / (capability.transferBandwidthMbps / 8));
      const verificationSeconds = 1.0;

      const estimatedTotalSeconds =
        queueWaitSeconds +
        startupSeconds +
        inputTransferSeconds +
        environmentSetupSeconds +
        executionSeconds +
        outputTransferSeconds +
        verificationSeconds;

      // Reliability multiplier: penalize FLAKY or DEGRADED providers
      let reliabilityPenalty = 1.0;
      if (health.state === "DEGRADED") reliabilityPenalty = 1.5;
      if (health.state === "FLAKY") reliabilityPenalty = 2.5;

      // Policy preference bonus for preferred order
      const preferredIdx = this.policy.preferredOrder.indexOf(provider.type);
      const policyBonus = preferredIdx >= 0 ? preferredIdx * 2.0 : 20.0;

      // Short video preference: if short video, favor zero cold-start local execution
      let shortVideoAdjustment = 0;
      if (
        this.policy.preferLocalForShortVideos &&
        baseExecutionSeconds <= this.policy.shortVideoThresholdSeconds &&
        provider.type === "LOCAL"
      ) {
        shortVideoAdjustment = -10.0;
      }

      const utilityScore = Number(
        ((estimatedTotalSeconds * reliabilityPenalty) + policyBonus + shortVideoAdjustment).toFixed(2)
      );

      const scoreBreakdown: UtilityScoreBreakdown = {
        queueWaitSeconds,
        startupEstSeconds: startupSeconds,
        inputTransferSeconds,
        environmentSetupSeconds,
        executionEstSeconds: executionSeconds,
        outputTransferSeconds,
        verificationSeconds,
        reliabilityPenalty,
        policyBonus,
        shortVideoAdjustment,
        utilityScore,
      };

      candidates.push({
        provider,
        capability,
        health,
        estimatedTotalSeconds: Number(estimatedTotalSeconds.toFixed(2)),
        utilityScore,
        suitabilityReason: `Utility: ${utilityScore} (Est: ${estimatedTotalSeconds.toFixed(1)}s, Health: ${health.state})`,
        scoreBreakdown,
      });
    }

    if (candidates.length === 0) {
      throw new Error(
        `[ComputeRouter] No suitable compute provider available for job ${job.jobId}. Rejections: ${JSON.stringify(rejectionReasons)}`
      );
    }

    // Sort by utility score ascending (lowest cost = best score)
    candidates.sort((a, b) => a.utilityScore - b.utilityScore);

    return {
      jobId: job.jobId,
      selectedCandidate: candidates[0],
      selectedProvider: candidates[0].provider,
      scoreBreakdown: candidates[0].scoreBreakdown,
      reason: candidates[0].suitabilityReason,
      evaluatedCandidates: candidates,
      rejectionReasons,
      routedAt: new Date().toISOString(),
    };
  }

  /**
   * Dispatches job with automatic retry and failover semantics (Section 11).
   */
  public async dispatchWithFailover(
    job: ComputeJob,
    onProgress?: (msg: string) => void
  ): Promise<{ receipt: ExecutionReceipt; failovers: string[] }> {
    const routingDecision = await this.planProvider(job);
    const failovers: string[] = [];

    const candidatesToTry = routingDecision.evaluatedCandidates.map((c) => c.provider);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < candidatesToTry.length; attempt++) {
      const provider = candidatesToTry[attempt];
      onProgress?.(`Routing job ${job.jobId} to provider "${provider.id}" (attempt ${attempt + 1})`);

      const tel = this.telemetry.get(provider.id);
      if (tel) {
        tel.totalAttempts++;
        tel.lastUsedAt = new Date().toISOString();
      }

      try {
        const receipt = await provider.executeJob(job, onProgress);
        if (receipt.status === "COMPLETED") {
          this.receipts.push(receipt);
          if (tel) {
            tel.successfulExecutions++;
            const n = tel.successfulExecutions;
            tel.avgStartupMs = Math.round(((tel.avgStartupMs * (n - 1)) + (receipt.metrics?.startupTimeMs || 0)) / n);
            tel.avgExecutionMs = Math.round(((tel.avgExecutionMs * (n - 1)) + (receipt.metrics?.executionTimeMs || 0)) / n);
            tel.avgTransferMs = Math.round(((tel.avgTransferMs * (n - 1)) + (receipt.metrics?.transferTimeMs || 0)) / n);
            tel.avgTotalMs = Math.round(((tel.avgTotalMs * (n - 1)) + (receipt.metrics?.totalTimeMs || 0)) / n);
          }
          return { receipt, failovers };
        }

        // Execution failed on this provider
        if (tel) {
          tel.failedExecutions++;
          tel.failureLog.push({
            timestamp: new Date().toISOString(),
            jobId: job.jobId,
            reason: receipt.failureReason || `Exit code ${receipt.exitCode}`,
          });
        }
        failovers.push(`Provider ${provider.id} failed: ${receipt.failureReason}`);
        onProgress?.(`Provider ${provider.id} failed with exit code ${receipt.exitCode}. Initiating failover.`);
      } catch (err: any) {
        lastError = err;
        if (tel) {
          tel.failedExecutions++;
          tel.failureLog.push({
            timestamp: new Date().toISOString(),
            jobId: job.jobId,
            reason: err.message || String(err),
          });
        }
        failovers.push(`Provider ${provider.id} threw exception: ${err.message}`);
        onProgress?.(`Provider ${provider.id} exception: ${err.message}. Failing over to next candidate.`);
      }

      if (!this.policy.failoverAllowed || attempt >= this.policy.maxRetries) {
        break;
      }
    }

    throw new Error(
      `[ComputeRouter] All compute provider attempts failed for job ${job.jobId}. Failovers: ${failovers.join(" | ")}. Last error: ${lastError?.message}`
    );
  }
}
