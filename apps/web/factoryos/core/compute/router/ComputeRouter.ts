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
import { RenderArtifactVerifier } from "../../fabric/verification/RenderArtifactVerifier";
import { GlideWorkerSelectionAdvisor, type GlideWorkerSelectionAdvice } from "./GlideWorkerSelectionAdvisor";

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
  admissionRecord: import("../contracts/ComputeContracts").RenderAdmissionRecord;
  /** Advisory only. It never overrides the deterministic routing decision until promotion gates pass. */
  glideWorkerAdvice?: GlideWorkerSelectionAdvice;
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

export type GlideRoutingMode = "OFF" | "SHADOW" | "CANARY";

export interface ComputeRouterOptions {
  readonly glideWorkerSelectionAdvisor?: GlideWorkerSelectionAdvisor;
  readonly glideRoutingMode?: GlideRoutingMode;
}

export class ComputeRouter {
  private providers: Map<string, IComputeProvider> = new Map();
  private policy: ComputePolicy;
  private telemetry: Map<string, ProviderPerformanceTelemetry> = new Map();
  private receipts: ExecutionReceipt[] = [];
  private readonly artifactVerifier = new RenderArtifactVerifier();
  private readonly glideWorkerSelectionAdvisor?: GlideWorkerSelectionAdvisor;
  private readonly glideRoutingMode: GlideRoutingMode;

  constructor(
    policy: ComputePolicy = DEFAULT_COMPUTE_POLICY,
    options: ComputeRouterOptions = {},
  ) {
    this.policy = policy;
    this.glideWorkerSelectionAdvisor = options.glideWorkerSelectionAdvisor;
    this.glideRoutingMode = options.glideRoutingMode ?? "OFF";
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
  public async planProvider(job: ComputeJob, preferredProviderType?: ProviderType): Promise<RoutingDecision> {
    const candidates: ScheduledProviderCandidate[] = [];
    const rejectionReasons: Record<string, string> = {};

    for (const provider of this.providers.values()) {
      // 0. Optional hard provider constraint. The Render Fabric uses this for explicit LOCAL requests
      // while AUTO remains fully capability/utility routed.
      if (preferredProviderType && provider.type !== preferredProviderType) {
        rejectionReasons[provider.id] = `Provider type ${provider.type} excluded by explicit provider constraint ${preferredProviderType}.`;
        continue;
      }

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

      // Availability is a hard admission check, not a ranking hint. This prevents
      // a provider at capacity from being selected and failing only after dispatch.
      const available = await provider.isAvailable();
      if (!available) {
        rejectionReasons[provider.id] = "Provider is not currently available for dispatch.";
        continue;
      }

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

    const deterministicSelected = candidates[0];
    let selected = deterministicSelected;
    let orderedCandidates = candidates;
    let glideWorkerAdvice: GlideWorkerSelectionAdvice | undefined;

    if (this.glideWorkerSelectionAdvisor && this.glideRoutingMode === "CANARY") {
      glideWorkerAdvice = await this.glideWorkerSelectionAdvisor.advise(job, candidates, this.telemetry);
      if (
        glideWorkerAdvice.status === "ADVISED" &&
        glideWorkerAdvice.selectedProviderId
      ) {
        const glideCandidate = candidates.find(
          (candidate) => candidate.provider.id === glideWorkerAdvice!.selectedProviderId,
        );
        if (glideCandidate) {
          orderedCandidates = [
            glideCandidate,
            ...candidates.filter(
              (candidate) => candidate.provider.id !== glideCandidate.provider.id,
            ),
          ];
          selected = orderedCandidates[0];
        }
      }
    } else if (
      this.glideWorkerSelectionAdvisor &&
      this.glideRoutingMode === "SHADOW"
    ) {
      // Shadow must never add GLiDE latency to the real render route.
      void this.glideWorkerSelectionAdvisor.advise(job, candidates, this.telemetry).catch((error: unknown) => {
        console.warn("[ComputeRouter] GLiDE shadow advice failed non-fatally:", error);
      });
    }

    const admissionRecord: import("../contracts/ComputeContracts").RenderAdmissionRecord = {
      admissionId: "admission_" + job.jobId + "_" + Date.now().toString(36),
      jobId: job.jobId,
      policyVersion: this.policy.policyVersion || "1.0.0",
      selectedProviderId: selected.provider.id,
      selectedProviderType: selected.provider.type,
      selectedUtilityScore: selected.utilityScore,
      candidateProviderIds: orderedCandidates.map((candidate) => candidate.provider.id),
      rejectionReasons: { ...rejectionReasons },
      capabilitySnapshot: selected.capability,
      healthSnapshot: selected.health,
      evaluatedAt: new Date().toISOString(),
      glideDecision: glideWorkerAdvice
        ? {
            mode: this.glideRoutingMode,
            modelRef: glideWorkerAdvice.modelRef,
            decisionBatchId: glideWorkerAdvice.decisionBatchId,
            selectedProviderId: glideWorkerAdvice.selectedProviderId,
            deterministicProviderId: deterministicSelected.provider.id,
            selectedConfidence: glideWorkerAdvice.selectedConfidence,
            selectedProbability: glideWorkerAdvice.selectedProbability,
            candidateProviderIds: [...glideWorkerAdvice.candidateProviderIds],
            latencyMs: glideWorkerAdvice.latencyMs,
            status: glideWorkerAdvice.status,
            reason: glideWorkerAdvice.reason,
          }
        : undefined,
    };

    return {
      jobId: job.jobId,
      selectedCandidate: selected,
      selectedProvider: selected.provider,
      scoreBreakdown: selected.scoreBreakdown,
      reason: selected.suitabilityReason,
      evaluatedCandidates: orderedCandidates,
      rejectionReasons,
      admissionRecord,
      glideWorkerAdvice,
      routedAt: new Date().toISOString(),
    };
  }

  /**
   * Dispatches job with automatic retry and failover semantics (Section 11).
   */
  public async dispatchWithFailover(
    job: ComputeJob,
    onProgress?: (msg: string) => void,
    preferredProviderType?: ProviderType
  ): Promise<{ receipt: ExecutionReceipt; failovers: string[] }> {
    const routingDecision = await this.planProvider(job, preferredProviderType);
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
        const renderCompletionWithoutArtifact =
          job.workloadType === "RENDER" &&
          receipt.status === "COMPLETED" &&
          receipt.outputArtifacts.length === 0;

        if (receipt.status === "COMPLETED" && !renderCompletionWithoutArtifact) {
          if (job.workloadType === "RENDER") {
            const artifact = receipt.outputArtifacts[0];
            const localIntent =
              ((job.manifest as any)?.localRenderIntent ||
                job.manifest) as Record<string, any>;
            const output = (localIntent?.output || {}) as Record<string, any>;
            const verification = await this.artifactVerifier.verify({
              artifact,
              approvedRoots: [
                process.cwd(),
                process.cwd() + "/data",
                process.cwd() + "/apps/web/data",
              ],
              expected: {
                width: Number(output.width || (job.manifest as any)?.width || 1080),
                height: Number(output.height || (job.manifest as any)?.height || 1920),
                fps: Number(output.fps || (job.manifest as any)?.fps || 30),
                durationSeconds:
                  typeof output.duration_seconds === "number"
                    ? output.duration_seconds
                    : typeof (job.manifest as any)?.estimatedDurationSeconds === "number"
                      ? (job.manifest as any).estimatedDurationSeconds
                      : undefined,
                videoCodec: normalizeCodec(String(output.video_codec || "h264")),
                audioCodec: normalizeCodec(String(output.audio_codec || "aac")),
                requireAudio: output.audio_codec !== "",
              },
            });

            receipt.artifactVerification = verification;
            receipt.admissionRecord = routingDecision.admissionRecord;
            if (verification.status !== "PASS") {
              const failureReason =
                "F06_PHYSICAL_ARTIFACT_REJECTED: " +
                (verification.failureReason || "render artifact failed physical verification");
              if (tel) {
                tel.failedExecutions++;
                tel.failureLog.push({
                  timestamp: new Date().toISOString(),
                  jobId: job.jobId,
                  reason: failureReason,
                });
              }
              failovers.push(
                "Provider " +
                  provider.id +
                  " failed physical verification: " +
                  (verification.failureReason || "unknown reason")
              );
              onProgress?.(
                "Provider " +
                  provider.id +
                  " produced an artifact rejected by the F06 physical verifier. Failing over."
              );
              continue;
            }
          } else {
            receipt.admissionRecord = routingDecision.admissionRecord;
          }

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

        // A render provider may never claim completion without an artifact receipt.
        // Treat that as a failed execution so another qualified provider may be tried.
        const failureReason = renderCompletionWithoutArtifact
          ? "RENDER_COMPLETED_WITHOUT_ARTIFACT"
          : receipt.failureReason || `Exit code ${receipt.exitCode}`;
        if (tel) {
          tel.failedExecutions++;
          tel.failureLog.push({
            timestamp: new Date().toISOString(),
            jobId: job.jobId,
            reason: failureReason,
          });
        }
        failovers.push(`Provider ${provider.id} failed: ${failureReason}`);
        onProgress?.(`Provider ${provider.id} failed: ${failureReason}. Initiating failover.`);
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


function normalizeCodec(codec: string): string {
  const normalized = codec.trim().toLowerCase();
  if (normalized === "libx264" || normalized === "h264_nvenc" || normalized === "h264_vaapi") {
    return "h264";
  }
  if (normalized === "libx265" || normalized === "hevc_nvenc" || normalized === "hevc_vaapi") {
    return "hevc";
  }
  return normalized;
}
