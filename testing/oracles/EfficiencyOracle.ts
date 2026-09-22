import type { MissionRun } from "../model/MissionRun";
import type { DurationTruth } from "../contracts/execution.contract";
import type { Finding } from "../model/Finding";

export interface EfficiencyMetrics {
  readonly totalDurationMs: number;
  readonly perFloorDurationMs: Record<string, number>;
  readonly perFloorDurationTruth: Record<string, DurationTruth>;
  readonly totalArtifactBytes: number;
  readonly retriesCount: number;
}

export class EfficiencyOracle {
  public static calculate(run: MissionRun): EfficiencyMetrics {
    const totalDurationMs = run.durationMs || 0;
    const perFloorDurationMs: Record<string, number> = {};
    const perFloorDurationTruth: Record<string, DurationTruth> = {};

    for (const evt of run.events) {
      if (evt.action.type === "floor_complete" && evt.actor.floor) {
        const floorId = evt.actor.floor;
        const measuredMs = evt.durationMs ?? (evt.metadata as any)?.executionTimeMs;
        const truth: DurationTruth = evt.durationTruth ?? ((evt.metadata as any)?.durationTruth || (typeof measuredMs === "number" ? "PHYSICAL" : "SYNTHETIC"));

        perFloorDurationMs[floorId] = typeof measuredMs === "number" ? measuredMs : 0;
        perFloorDurationTruth[floorId] = truth;
      }
    }

    const totalArtifactBytes = run.artifacts.reduce((acc, a) => acc + a.byteLength, 0);
    const retriesCount = run.events.filter((e) => e.action.type === "retry").length;

    return {
      totalDurationMs,
      perFloorDurationMs,
      perFloorDurationTruth,
      totalArtifactBytes,
      retriesCount,
    };
  }

  public static evaluate(run: MissionRun): Finding[] {
    const findings: Finding[] = [];
    for (const evt of run.events) {
      if (evt.action.type === "floor_complete" && evt.actor.floor) {
        const floorId = evt.actor.floor;
        const measuredMs = evt.durationMs ?? (evt.metadata as any)?.executionTimeMs;
        if (typeof measuredMs !== "number" || measuredMs <= 0) {
          findings.push({
            id: `find_timing_synthetic_${floorId}`,
            rule: "timing/synthetic-duration-detected",
            severity: "warning",
            subject: floorId,
            evidence: [`Floor ${floorId} did not provide physical monotonic timing`],
            expected: "Physical wall-clock elapsed duration in milliseconds",
            observed: `${measuredMs ?? "undefined"} ms (DurationTruth: SYNTHETIC)`,
            confidence: 1.0,
            supportedRepairs: ["Instrument floor execution with performance.now() timestamps"],
          });
        }
      }
    }
    return findings;
  }
}
