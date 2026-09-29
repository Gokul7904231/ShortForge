/**
 * FactoryOS — production trajectory evidence and evaluation.
 *
 * A trajectory is an evidence record, not an authority layer. It deliberately
 * stores outcomes, bounded loop telemetry, and verification references without
 * persisting model chain-of-thought or secrets.
 */

import { createHash } from "node:crypto";
import type { FloorClosedLoopReceipt, FloorLoopType } from "../governance/FloorClosedLoop";
import { CANONICAL_FLOOR_LOOPS } from "../governance/FloorClosedLoopRegistry";

export type TrajectoryProofLevel =
  | "LOOP_RECEIPT"
  | "PHYSICAL_VERIFICATION"
  | "HANDOFF_CONTRACT"
  | "NONE";

export type TrajectoryVerificationStatus =
  | "VERIFIED"
  | "PARTIAL"
  | "FAILED"
  | "UNVERIFIED";

export interface FloorTrajectoryObservation {
  readonly floorId: string;
  readonly loopType: FloorLoopType;
  readonly proofLevel: TrajectoryProofLevel;
  readonly verified: boolean;
  readonly termination?: string;
  readonly iterations?: number;
  readonly evidenceRefs: readonly string[];
  readonly failureReason?: string;
}

export interface ProductionTrajectory {
  readonly trajectoryId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly floors: readonly FloorTrajectoryObservation[];
  readonly verificationStatus: TrajectoryVerificationStatus;
  readonly verifiedFloorCount: number;
  readonly canonicalFloorCount: number;
  readonly totalIterations: number;
  readonly recoveredIterations: number;
  readonly evidenceRefs: readonly string[];
  readonly authorityViolations: readonly string[];
  readonly finalOutcome: "SUCCESS" | "FAILED" | "INCOMPLETE";
  readonly trajectoryFingerprint: string;
  readonly trainingEligible: boolean;
}

export interface TrajectoryEvaluationInput {
  readonly missionId: string;
  readonly runId?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly floorObservations: readonly FloorTrajectoryObservation[];
  readonly authorityViolations?: readonly string[];
}

function canonicalOrder(ids: readonly string[]): readonly string[] {
  const order = new Map(CANONICAL_FLOOR_LOOPS.map((item, index) => [item.floorId, index]));
  return [...ids].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
}

export function observationFromLoopReceipt(
  receipt: FloorClosedLoopReceipt,
  proofLevel: TrajectoryProofLevel = "LOOP_RECEIPT",
): FloorTrajectoryObservation {
  return {
    floorId: receipt.floorId,
    loopType: receipt.loopType,
    proofLevel,
    verified: receipt.verified,
    termination: receipt.termination,
    iterations: receipt.iterations,
    evidenceRefs: [...receipt.evidenceRefs],
    failureReason: receipt.failureReason,
  };
}

export class ProductionTrajectoryEvaluator {
  static evaluate(input: TrajectoryEvaluationInput): ProductionTrajectory {
    const now = input.completedAt || new Date().toISOString();
    const authorityViolations = [...(input.authorityViolations || [])];
    const byFloor = new Map<string, FloorTrajectoryObservation>();

    for (const observation of input.floorObservations) {
      if (byFloor.has(observation.floorId)) {
        authorityViolations.push("DUPLICATE_FLOOR_TRAJECTORY_OBSERVATION:" + observation.floorId);
        continue;
      }
      byFloor.set(observation.floorId, observation);
    }

    const floors: FloorTrajectoryObservation[] = CANONICAL_FLOOR_LOOPS.map((definition) => {
      return byFloor.get(definition.floorId) || {
        floorId: definition.floorId,
        loopType: definition.loopType,
        proofLevel: "NONE",
        verified: false,
        evidenceRefs: [],
        failureReason: "No trajectory evidence was observed for this canonical floor.",
      };
    });

    const verifiedFloorCount = floors.filter((floor) => floor.verified).length;
    const missingProofCount = floors.filter((floor) => floor.proofLevel === "NONE").length;
    const failedFloorCount = floors.filter(
      (floor) => floor.proofLevel !== "NONE" && !floor.verified,
    ).length;
    const evidenceRefs = [...new Set(floors.flatMap((floor) => floor.evidenceRefs))];
    const totalIterations = floors.reduce((sum, floor) => sum + (floor.iterations || 0), 0);
    const recoveredIterations = floors.filter((floor) => (floor.iterations || 0) > 1).length;
    const allVerified = verifiedFloorCount === CANONICAL_FLOOR_LOOPS.length;
    const allProofGrade = floors.every((floor) => floor.proofLevel !== "NONE");
    const hasWeakEvidence = floors.some((floor) => floor.proofLevel === "HANDOFF_CONTRACT");

    let verificationStatus: TrajectoryVerificationStatus = "VERIFIED";
    if (authorityViolations.length > 0 || failedFloorCount > 0) verificationStatus = "FAILED";
    else if (missingProofCount > 0 && verifiedFloorCount > 0) verificationStatus = "PARTIAL";
    else if (missingProofCount > 0) verificationStatus = "UNVERIFIED";

    const trainingEligible =
      verificationStatus === "VERIFIED" &&
      allVerified &&
      allProofGrade &&
      !hasWeakEvidence &&
      authorityViolations.length === 0 &&
      evidenceRefs.length > 0;

    const fingerprintMaterial = JSON.stringify({
      missionId: input.missionId,
      runId: input.runId,
      floors: canonicalOrder(floors.map((floor) => floor.floorId)).map((floorId) => {
        const floor = floors.find((item) => item.floorId === floorId)!;
        return {
          floorId,
          loopType: floor.loopType,
          proofLevel: floor.proofLevel,
          verified: floor.verified,
          termination: floor.termination,
          iterations: floor.iterations,
          evidenceRefs: [...floor.evidenceRefs].sort(),
        };
      }),
      authorityViolations,
      verificationStatus,
    });

    const trajectoryFingerprint = createHash("sha256").update(fingerprintMaterial).digest("hex");

    return {
      trajectoryId: "traj_" + trajectoryFingerprint.slice(0, 20),
      missionId: input.missionId,
      runId: input.runId,
      startedAt: input.startedAt,
      completedAt: now,
      floors: Object.freeze(floors),
      verificationStatus,
      verifiedFloorCount,
      canonicalFloorCount: CANONICAL_FLOOR_LOOPS.length,
      totalIterations,
      recoveredIterations,
      evidenceRefs: Object.freeze(evidenceRefs),
      authorityViolations: Object.freeze(authorityViolations),
      finalOutcome: allVerified ? "SUCCESS" : verifiedFloorCount > 0 ? "INCOMPLETE" : "FAILED",
      trajectoryFingerprint,
      trainingEligible,
    };
  }
}
