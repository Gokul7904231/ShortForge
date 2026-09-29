/**
 * Connects independently verified production trajectories to Ascalon's future
 * learning signal. It exports outcomes, never model reasoning or authority.
 */

import type { ExperienceMemoryEntry } from "./memory/IndexedExperienceMemory";
import type { CognitiveOutcomeLearner } from "./CognitiveOutcomeLearner";
import type { ProductionTrajectory } from "../observability/ProductionTrajectory";

export interface AscalonLearningSignal {
  readonly signalId: string;
  readonly trajectoryId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly outcome: "SUCCESS" | "FAILED" | "INCOMPLETE";
  readonly validatorPassed: boolean;
  readonly predictedSuccess: boolean;
  readonly verificationStatus: "VERIFIED";
  readonly floorIds: readonly string[];
  readonly iterations: number;
  readonly recoveryCount: number;
  readonly evidenceRefs: readonly string[];
  readonly trainingEligible: true;
  readonly createdAt: string;
}

export class TrajectoryLearningBridge {
  constructor(private readonly learner: CognitiveOutcomeLearner) {}

  async recordVerifiedTrajectory(
    trajectory: ProductionTrajectory,
    predictedSuccess: boolean,
  ): Promise<{ signal: AscalonLearningSignal; memory: ExperienceMemoryEntry }> {
    if (!trajectory.trainingEligible || trajectory.verificationStatus !== "VERIFIED") {
      throw new Error(
        "ASCALON_LEARNING_DENIED: trajectory requires complete independent floor verification, evidence, and zero authority violations.",
      );
    }

    const signal: AscalonLearningSignal = {
      signalId: "asl_" + trajectory.trajectoryFingerprint.slice(0, 16),
      trajectoryId: trajectory.trajectoryId,
      missionId: trajectory.missionId,
      runId: trajectory.runId,
      outcome: trajectory.finalOutcome,
      validatorPassed: trajectory.finalOutcome === "SUCCESS",
      predictedSuccess,
      verificationStatus: "VERIFIED",
      floorIds: trajectory.floors.map((floor) => floor.floorId),
      iterations: trajectory.totalIterations,
      recoveryCount: trajectory.recoveredIterations,
      evidenceRefs: [...trajectory.evidenceRefs],
      trainingEligible: true,
      createdAt: new Date().toISOString(),
    };

    const durationMs = Math.max(
      1,
      new Date(trajectory.completedAt).getTime() - new Date(trajectory.startedAt).getTime(),
    );

    const memory = await this.learner.recordOutcome({
      incidentId: trajectory.trajectoryId,
      category: "PRODUCTION_TRAJECTORY",
      floorId: "GLOBAL",
      proposedAction: "EXECUTE_VERIFIED_PRODUCTION_TRAJECTORY",
      predictedSuccess,
      validatorPassed: signal.validatorPassed,
      durationMs,
      symptoms: [
        "trajectory_verified",
        "floors=" + trajectory.verifiedFloorCount + "/" + trajectory.canonicalFloorCount,
        "iterations=" + trajectory.totalIterations,
        "recoveries=" + trajectory.recoveredIterations,
      ],
      trajectoryId: trajectory.trajectoryId,
      evidenceRefs: trajectory.evidenceRefs,
    });

    return { signal, memory };
  }
}
