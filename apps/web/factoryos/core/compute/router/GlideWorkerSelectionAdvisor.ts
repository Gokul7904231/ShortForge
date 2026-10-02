/**
 * ShortForge / FactoryOS — GLiDE Worker Selection Advisor
 *
 * Turns already-eligible compute candidates into a compact GLiDE decision.
 * This is an advisory/shadow layer: deterministic eligibility and ComputePolicy
 * remain authoritative, and this class never provisions or dispatches workers.
 */

import type {
  ChoiceAnswer,
  DecisionBatchRequest,
} from "../../intelligence/decision/DecisionContracts";
import { GlideDecisionAdapter } from "../../intelligence/decision/GlideDecisionAdapter";
import type {
  ProviderPerformanceTelemetry,
  ScheduledProviderCandidate,
} from "./ComputeRouter";

export interface GlideWorkerSelectionAdvice {
  readonly status: "ADVISED" | "UNRESOLVED";
  readonly jobId: string;
  readonly selectedProviderId?: string;
  readonly selectedConfidence: number;
  readonly selectedProbability?: number;
  readonly fastestProviderId?: string;
  readonly mostReliableProviderId?: string;
  readonly freestProviderId?: string;
  readonly candidateProviderIds: readonly string[];
  readonly latencyMs: number;
  readonly reason: string;
  readonly decisionBatchId: string;
  readonly modelRef: string;
}

export interface GlideWorkerSelectionAdvisorConfig {
  readonly adapter?: GlideDecisionAdapter;
  readonly minimumConfidence?: number;
}

export class GlideWorkerSelectionAdvisor {
  private readonly adapter: GlideDecisionAdapter;
  private readonly minimumConfidence: number;

  public constructor(config: GlideWorkerSelectionAdvisorConfig = {}) {
    this.adapter = config.adapter ?? new GlideDecisionAdapter();
    this.minimumConfidence = Math.max(0, Math.min(1, config.minimumConfidence ?? 0.35));
  }

  public async advise(
    job: {
      jobId: string;
      workloadType: string;
      requirements: {
        gpuRequired?: boolean;
        preferredGpuType?: string;
        minMemoryMb?: number;
        minCpuCores?: number;
        estimatedDurationSeconds?: number;
      };
      timeoutMs: number;
    },
    candidates: readonly ScheduledProviderCandidate[],
    telemetry?: ReadonlyMap<string, ProviderPerformanceTelemetry>,
  ): Promise<GlideWorkerSelectionAdvice> {
    const startedAt = Date.now();
    const candidateProviderIds = candidates.map((candidate) => candidate.provider.id);

    if (candidates.length < 1) {
      return {
        status: "UNRESOLVED",
        jobId: job.jobId,
        selectedConfidence: 0,
        candidateProviderIds,
        latencyMs: Date.now() - startedAt,
        reason: "No eligible candidates were supplied by the deterministic ComputeRouter.",
        decisionBatchId: `glide_worker_${job.jobId}`,
        modelRef: "fastino/GLiDE",
      };
    }

    const state = {
      job: {
        workloadType: job.workloadType,
        gpuRequired: Boolean(job.requirements.gpuRequired),
        preferredGpuType: job.requirements.preferredGpuType ?? null,
        minMemoryMb: job.requirements.minMemoryMb ?? null,
        minCpuCores: job.requirements.minCpuCores ?? null,
        estimatedDurationSeconds: job.requirements.estimatedDurationSeconds ?? null,
        decisionDeadlineSeconds: Math.max(0, job.timeoutMs / 1000),
      },
      candidates: candidates.map((candidate) => ({
        providerId: candidate.provider.id,
        providerType: candidate.provider.type,
        // Eligibility is already deterministic. GLiDE ranks only within this closed set.
        eligible: true,
        availability: {
          activeJobs: candidate.health.activeJobs,
          maxConcurrency: candidate.capability.maxConcurrency,
          loadRatio:
            candidate.capability.maxConcurrency > 0
              ? Math.min(
                  1,
                  candidate.health.activeJobs /
                    candidate.capability.maxConcurrency,
                )
              : 1,
          freeSlots: Math.max(
            0,
            candidate.capability.maxConcurrency - candidate.health.activeJobs,
          ),
          successRate: candidate.health.successRate,
          avgLatencyMs: candidate.health.avgLatencyMs,
        },
        health: candidate.health.state,
        capability: {
          cpuCores: candidate.capability.cpuCores,
          memoryMb: candidate.capability.memoryMb,
          gpuAvailable: candidate.capability.gpuAvailable,
          gpuType: candidate.capability.gpuType ?? null,
          hardwareVideoEncode: candidate.capability.hardwareVideoEncode ?? false,
          startupSeconds: candidate.capability.estimatedStartupSeconds,
          transferMbps: candidate.capability.transferBandwidthMbps,
          maxConcurrency: candidate.capability.maxConcurrency,
        },
        preflight: {
          canRun: true,
          isHealthy: candidate.health.state === "HEALTHY",
          isFree:
            candidate.health.activeJobs < candidate.capability.maxConcurrency,
          canFinishByDeadline:
            candidate.estimatedTotalSeconds <= job.timeoutMs / 1000,
        },
        estimates: {
          totalSeconds: candidate.estimatedTotalSeconds,
          executionSeconds: candidate.scoreBreakdown.executionEstSeconds,
          queueWaitSeconds: candidate.scoreBreakdown.queueWaitSeconds,
          startupSeconds: candidate.scoreBreakdown.startupEstSeconds,
          transferSeconds:
            candidate.scoreBreakdown.inputTransferSeconds +
            candidate.scoreBreakdown.outputTransferSeconds,
          verificationSeconds: candidate.scoreBreakdown.verificationSeconds,
          deadlineSlackSeconds:
            job.timeoutMs / 1000 - candidate.estimatedTotalSeconds,
          utilityScore: candidate.utilityScore,
        },
        observedHistory: (() => {
          const routerTelemetry = telemetry?.get(candidate.provider.id);

          return routerTelemetry
            ? {
                attempts: routerTelemetry.totalAttempts,
                successfulExecutions: routerTelemetry.successfulExecutions,
                failedExecutions: routerTelemetry.failedExecutions,
                observedSuccessRate:
                  routerTelemetry.totalAttempts > 0
                    ? routerTelemetry.successfulExecutions /
                      routerTelemetry.totalAttempts
                    : null,
                observedAvgStartupMs: routerTelemetry.avgStartupMs,
                observedAvgExecutionMs: routerTelemetry.avgExecutionMs,
                observedAvgTransferMs: routerTelemetry.avgTransferMs,
                observedAvgTotalMs: routerTelemetry.avgTotalMs,
              }
            : null;
        })(),
      })),
    };

    const question: DecisionBatchRequest = {
      batchId: `glide_worker_${job.jobId}`,
      taskId: job.jobId,
      questions: [
        {
          id: "selectedWorker",
          type: "CHOICE",
          question:
            "Which eligible compute worker should execute this render, considering the deterministic preflight answers: can it run, is it healthy, is it free, and can it finish by the deadline?",
          options: candidateProviderIds,
        },
        {
          id: "deadlineWorker",
          type: "CHOICE",
          question:
            "Which eligible compute worker is most likely to finish this render within the job deadline based on the supplied measured and estimated runtime state?",
          options: candidateProviderIds,
        },
        {
          id: "reliableWorker",
          type: "CHOICE",
          question:
            "Which eligible compute worker appears most reliable right now based on health, active load, recent success rate, and observed latency?",
          options: candidateProviderIds,
        },
        {
          id: "freeWorker",
          type: "CHOICE",
          question:
            "Which eligible compute worker has the lowest current load and is most available to start this render now?",
          options: candidateProviderIds,
        },
      ],
      sharedContext: state,
      policyVersion: "glide-worker-routing-v1",
      decisionSchemaVersion: "2.1.0",
    };

    const result = await this.adapter.evaluateBatch(question);
    const selected = this.asChoice(result.answersById.selectedWorker);
    const deadline = this.asChoice(result.answersById.deadlineWorker);
    const reliable = this.asChoice(result.answersById.reliableWorker);
    const free = this.asChoice(result.answersById.freeWorker);

    if (!selected || selected.status !== "VALID" || selected.confidence < this.minimumConfidence) {
      return {
        status: "UNRESOLVED",
        jobId: job.jobId,
        selectedConfidence: selected?.confidence ?? 0,
        selectedProbability: selected?.selected
          ? selected.probabilities[selected.selected]
          : undefined,
        fastestProviderId: deadline?.status === "VALID" ? String(deadline.selected) : undefined,
        mostReliableProviderId:
          reliable?.status === "VALID" ? String(reliable.selected) : undefined,
        freestProviderId: free?.status === "VALID" ? String(free.selected) : undefined,
        candidateProviderIds,
        latencyMs: Date.now() - startedAt,
        reason:
          selected?.status === "VALID"
            ? `GLiDE confidence ${selected.confidence.toFixed(3)} is below the configured shadow threshold.`
            : "GLiDE did not return a valid worker selection.",
        decisionBatchId: question.batchId,
        modelRef: "fastino/GLiDE",
      };
    }

    return {
      status: "ADVISED",
      jobId: job.jobId,
      selectedProviderId: String(selected.selected),
      selectedConfidence: selected.confidence,
      selectedProbability: selected.probabilities[selected.selected],
      fastestProviderId: deadline?.status === "VALID" ? String(deadline.selected) : undefined,
      mostReliableProviderId:
        reliable?.status === "VALID" ? String(reliable.selected) : undefined,
      freestProviderId: free?.status === "VALID" ? String(free.selected) : undefined,
      candidateProviderIds,
      latencyMs: Date.now() - startedAt,
      reason:
        `GLiDE advised ${String(selected.selected)} with confidence ${selected.confidence.toFixed(3)}.`,
      decisionBatchId: question.batchId,
      modelRef: "fastino/GLiDE",
    };
  }

  private asChoice(answer: unknown): ChoiceAnswer<string> | undefined {
    if (!answer || typeof answer !== "object") return undefined;
    const candidate = answer as ChoiceAnswer<string>;
    return candidate.type === "CHOICE" ? candidate : undefined;
  }
}
