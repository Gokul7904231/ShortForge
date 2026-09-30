import { createHash } from "node:crypto";
import type {
  EpistemicCognitiveMode,
  ValueEstimateSource,
} from "./EpistemicContracts";
import type { AERValuePolicy } from "./AERValueModel";
import { AERMetricsRecorder } from "./AERMetrics";

export interface AERRoutingPolicyCandidate {
  readonly policyVersion: string;
  readonly generatedAt: string;
  readonly baselineMode: EpistemicCognitiveMode;
  readonly ascalonSamples: number;
  readonly baselineSamples: number;
  readonly valuePolicy: AERValuePolicy;
  readonly eligibleForShadow: boolean;
  readonly reason: string;
}

/**
 * Produces a conservative shadow policy from observed episode outcomes.
 *
 * The learner never mutates the live policy and never grants model authority.
 * It uses lower/upper confidence bounds to avoid overestimating Ascalon's
 * incremental resolution benefit.
 */
export class AERRoutingPolicyLearner {
  public constructor(
    private readonly metrics: AERMetricsRecorder,
    private readonly minSamples = 30,
  ) {}

  public propose(input: {
    readonly baselineMode: EpistemicCognitiveMode;
    readonly ascalonMode?: "DEEP";
  }): AERRoutingPolicyCandidate {
    const baselineMode = input.baselineMode;
    const ascalonMode = input.ascalonMode ?? "DEEP";

    const baseline = this.metrics.getModeCalibration(baselineMode);
    const ascalon = this.metrics.getModeCalibration(ascalonMode);

    const sufficientlyObserved =
      baseline.sampleCount >= this.minSamples &&
      ascalon.sampleCount >= this.minSamples;

    const source: ValueEstimateSource = sufficientlyObserved
      ? "OBSERVED_CALIBRATION"
      : "CONFIGURED_PRIOR";

    const policy: AERValuePolicy = {
      baseline: {
        mode: baselineMode,
        resolutionProbability: sufficientlyObserved
          ? baseline.upperBound95
          : baseline.resolutionProbability,
        costUnits: baseline.averageCostUnits,
        latencyMs: baseline.p50LatencyMs,
        latencyP95Ms: baseline.p95LatencyMs,
        source,
      },
      ascalon: {
        mode: ascalonMode,
        resolutionProbability: sufficientlyObserved
          ? ascalon.lowerBound95
          : ascalon.resolutionProbability,
        costUnits: ascalon.averageCostUnits,
        latencyMs: ascalon.p50LatencyMs,
        latencyP95Ms: ascalon.p95LatencyMs,
        source,
      },
      minimumNetValue: 0,
      costWeight: 0.1,
      latencyWeight: 0.01,
      allowUncalibratedEscalation: false,
    };

    const policyVersion = createHash("sha256")
      .update(
        JSON.stringify({
          baselineMode,
          baseline,
          ascalon,
          minSamples: this.minSamples,
        }),
        "utf8",
      )
      .digest("hex")
      .slice(0, 16);

    return {
      policyVersion: "aer-shadow-" + policyVersion,
      generatedAt: new Date().toISOString(),
      baselineMode,
      ascalonSamples: ascalon.sampleCount,
      baselineSamples: baseline.sampleCount,
      valuePolicy: policy,
      eligibleForShadow: sufficientlyObserved,
      reason: sufficientlyObserved
        ? "Observed outcome sample sizes are sufficient for conservative shadow calibration."
        : "Insufficient observed outcomes for calibrated production influence; candidate remains prior-based and shadow-only.",
    };
  }
}
