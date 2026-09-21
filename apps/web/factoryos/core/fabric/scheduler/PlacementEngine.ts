/**
 * FactoryOS Render Fabric — Deterministic Placement Engine
 * Evaluates hard eligibility constraints, lifetime safety, and multi-factor ranking.
 */

import {
  RenderJob,
  PlacementDecision,
} from "../contracts/RenderFabricContracts";
import { WorkerFleetManager, ManagedWorkerRecord } from "../worker/WorkerFleetManager";

export class PlacementEngine {
  private fleet: WorkerFleetManager;

  constructor(fleet: WorkerFleetManager) {
    this.fleet = fleet;
  }

  public placeJob(job: RenderJob): PlacementDecision {
    const candidates = this.fleet.getAvailableWorkers();
    const rejectedWorkers: Record<string, string> = {};
    const eligible: Array<{
      worker: ManagedWorkerRecord;
      score: number;
      signals: any;
    }> = [];

    const req = job.requirements;
    const estimatedDuration = req.estimatedDurationSeconds || 5.0;
    const safetyMargin = req.safetyMarginSeconds ?? 30.0;
    const totalRequiredLifetime = estimatedDuration + safetyMargin;

    for (const cand of candidates) {
      const cap = cand.capability;

      // 1. Hard Gate: FFmpeg availability
      if (!cap.ffmpegAvailable) {
        rejectedWorkers[cand.workerId] = "FFmpeg binary unavailable on worker.";
        continue;
      }

      // 2. Hard Gate: GPU requirement
      if (req.gpuRequired) {
        if (cap.gpuVendor === "NONE" || cap.vramMb <= 0) {
          rejectedWorkers[cand.workerId] = "Job requires GPU, but worker has no hardware GPU acceleration.";
          continue;
        }
        if (req.minVramMb && cap.vramMb < req.minVramMb) {
          rejectedWorkers[cand.workerId] = `Insufficient VRAM: requires ${req.minVramMb}MB, worker has ${cap.vramMb}MB.`;
          continue;
        }
      }

      // 3. Hard Gate: Lifetime-Aware Scheduling (Section 43)
      if (cap.isEphemeral && cap.estimatedRemainingLifetimeSeconds > 0) {
        if (totalRequiredLifetime > cap.estimatedRemainingLifetimeSeconds) {
          rejectedWorkers[cand.workerId] = `LIFETIME_INSUFFICIENT: Job requires ${totalRequiredLifetime}s (${estimatedDuration}s + ${safetyMargin}s margin), worker has only ${cap.estimatedRemainingLifetimeSeconds}s remaining.`;
          continue;
        }
      }

      // Soft Ranking Calculation (Higher score = better candidate)
      // Base score starts at 100
      let score = 100;

      // Reliability bonus
      const reliabilityScore = 1.0;
      score += reliabilityScore * 20;

      // VRAM headroom bonus
      const vramMb = cap.vramMb || 0;
      score += Math.min(50, Math.floor(vramMb / 256));

      // Provider preference (e.g. prefer local or AMD when available)
      if (req.preferredGpuVendor && cap.gpuVendor === req.preferredGpuVendor) {
        score += 30;
      }
      if (cap.providerType === "LOCAL") {
        score += 25; // zero network transfer overhead
      }

      const signals = {
        queueDepth: 0,
        remainingLifetimeSeconds: cap.estimatedRemainingLifetimeSeconds,
        vramMb,
        reliabilityScore,
        costScore: cap.providerType === "LOCAL" ? 1.0 : 0.8,
      };

      eligible.push({ worker: cand, score, signals });
    }

    if (eligible.length === 0) {
      throw new Error(
        `[PlacementEngine] No eligible worker found for job '${job.jobId}'. Rejections: ${JSON.stringify(rejectedWorkers)}`
      );
    }

    // Sort by score descending (highest score wins)
    eligible.sort((a, b) => b.score - a.score);
    const chosen = eligible[0];

    return {
      jobId: job.jobId,
      selectedWorkerId: chosen.worker.workerId,
      selectedProvider: chosen.worker.capability.providerType,
      whySelected: `Optimal candidate with score ${chosen.score}. VRAM: ${chosen.worker.capability.vramMb}MB, Provider: ${chosen.worker.capability.providerType}.`,
      rankingScore: chosen.score,
      rankingSignals: chosen.signals,
      rejectedWorkers,
      placedAt: new Date().toISOString(),
    };
  }
}
