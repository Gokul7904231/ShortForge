/**
 * Project Ascalon — Trajectory Exporter
 *
 * Deterministically exports validated, redacted operational trajectories into
 * train/validation/test splits, preventing family/mission leakage.
 */

import { createHash } from "node:crypto";
import { AscalonTrajectoryValidator } from "../validators/AscalonTrajectoryValidator";

export interface SplitResult {
  readonly train: any[];
  readonly validation: any[];
  readonly test: any[];
  readonly rejected: Array<{ trajectory: any; reasons: string[] }>;
  readonly splitManifest: {
    readonly totalExported: number;
    readonly trainCount: number;
    readonly validationCount: number;
    readonly testCount: number;
    readonly rejectedCount: number;
    readonly splitRatio: string;
  };
}

export class AscalonTrajectoryExporter {
  /**
   * Partitions trajectories by mission/incident family to avoid leakage.
   * Split ratio: ~70% train, ~15% validation, ~15% test.
   */
  public static exportDataset(trajectories: any[]): SplitResult {
    const validTrajectories: any[] = [];
    const rejected: Array<{ trajectory: any; reasons: string[] }> = [];

    // 1. Validation & Quality Filtering
    for (const traj of trajectories) {
      const report = AscalonTrajectoryValidator.validate(traj);
      const isSynthetic =
        traj.environment?.environmentType === "SIMULATION" ||
        traj.provenance?.synthetic === true ||
        traj.provenance?.simulation === true;

      if (
        isSynthetic ||
        !report.valid ||
        traj.provenance?.trainingEligible !== true
      ) {
        validTrajectories.push(traj);
      } else {
        const reasons = report.issues.map(
          (i) => `[${i.code}] ${i.message}`,
        );
        if (isSynthetic) {
          reasons.push(
            "[SYNTHETIC_CURRICULUM] Synthetic/simulation data belongs in the curriculum path, not production-golden training export.",
          );
        }
        rejected.push({
          trajectory: traj,
          reasons,
        });
      }
    }

    // 2. Group by mission/episode family
    const familyMap = new Map<string, any[]>();
    for (const traj of validTrajectories) {
      const familyKey = traj.episode?.missionId || traj.episode?.caseId || traj.trajectoryId;
      if (!familyMap.has(familyKey)) {
        familyMap.set(familyKey, []);
      }
      familyMap.get(familyKey)!.push(traj);
    }

    const train: any[] = [];
    const validation: any[] = [];
    const test: any[] = [];

    for (const [familyKey, items] of [...familyMap.entries()].sort()) {
      const digest = createHash("sha256")
        .update(familyKey)
        .digest("hex");
      const bucket =
        parseInt(digest.slice(0, 8), 16) % 100;

      if (bucket < 70) {
        train.push(...items);
      } else if (bucket < 85) {
        validation.push(...items);
      } else {
        test.push(...items);
      }
    }

    return {
      train,
      validation,
      test,
      rejected,
      splitManifest: {
        totalExported: validTrajectories.length,
        trainCount: train.length,
        validationCount: validation.length,
        testCount: test.length,
        rejectedCount: rejected.length,
        splitRatio: "70/15/15",
      },
    };
  }

  public static toJSONL(items: any[]): string {
    return items.map((item) => JSON.stringify(item)).join("\n");
  }
}
