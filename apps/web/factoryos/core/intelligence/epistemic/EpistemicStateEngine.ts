import { createHash } from "node:crypto";
import type {
  EpistemicContradiction,
  EpistemicFact,
  EpistemicHypothesis,
  EpistemicImpact,
  EpistemicMeasurement,
  EpistemicState,
  EpistemicStateStatus,
  EpistemicUnknown,
} from "./EpistemicContracts";
import {
  assertUnitInterval,
  validateHypothesis,
  validateMeasurement,
} from "./EpistemicContracts";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalize(obj[key]))
      .join(",") +
    "}"
  );
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function classifyStatus(
  known: readonly EpistemicFact[],
  unknown: readonly EpistemicUnknown[],
  contradictions: readonly EpistemicContradiction[],
  hasMaterialStaleEvidence: boolean,
): EpistemicStateStatus {
  if (contradictions.some((item) => item.material)) return "CONTRADICTED";
  if (hasMaterialStaleEvidence) return "STALE";
  if (unknown.some((item) => item.material)) return "UNCERTAIN";
  if (known.length > 0 && known.every((item) => item.status === "INFERRED")) return "INFERRED";
  if (known.some((item) => item.status === "SUPPORTED")) return "SUPPORTED";
  if (known.some((item) => item.status === "CONFIRMED")) return "CONFIRMED";
  return "UNRESOLVED";
}

export interface BuildEpistemicStateInput {
  readonly contextSeed: string;
  readonly known?: readonly EpistemicFact[];
  readonly unknown?: readonly EpistemicUnknown[];
  readonly contradictions?: readonly EpistemicContradiction[];
  readonly measurements?: readonly EpistemicMeasurement[];
  readonly hypotheses?: readonly EpistemicHypothesis[];
  readonly evidenceRefs?: readonly string[];
  readonly investigationHistory?: readonly Record<string, unknown>[];
  readonly impact?: EpistemicImpact;
  readonly freshness?: Record<string, unknown>;
  readonly freshnessPolicy?: Readonly<Record<string, number>>;
  readonly authorityClass?: "MODEL_ADVISORY";
}

export class EpistemicStateEngine {
  public build(input: BuildEpistemicStateInput): EpistemicState {
    const measurements = [...(input.measurements ?? [])];
    measurements.forEach(validateMeasurement);

    const hypotheses = [...(input.hypotheses ?? [])];
    hypotheses.forEach(validateHypothesis);

    const known = [...(input.known ?? [])];
    const unknown = [...(input.unknown ?? [])];
    const contradictions = [...(input.contradictions ?? [])];
    const evidenceRefs = [...new Set(input.evidenceRefs ?? [])].sort();

    const contextId =
      "aer_" +
      fingerprint({
        contextSeed: input.contextSeed,
        known,
        unknown,
        contradictions,
        measurements,
        hypotheses,
        evidenceRefs,
      }).slice(0, 20);

    const now = Date.now();
    const freshness = { ...(input.freshness ?? {}) };
    let hasMaterialStaleEvidence = false;

    for (const measurement of measurements) {
      if (measurement.freshnessSeconds !== undefined) {
        const policyThreshold =
          input.freshnessPolicy?.[measurement.dimension] ?? 3600;
        const staleAfterSeconds = Math.max(
          0,
          measurement.staleAfterSeconds ?? policyThreshold,
        );
        const stale = measurement.freshnessSeconds > staleAfterSeconds;

        freshness[measurement.measurementId] = {
          freshnessSeconds: measurement.freshnessSeconds,
          staleAfterSeconds,
          stale,
          material: measurement.material ?? false,
        };

        if (stale && measurement.material === true) {
          hasMaterialStaleEvidence = true;
        }
      }
    }

    const knownStatus = classifyStatus(
      known,
      unknown,
      contradictions,
      hasMaterialStaleEvidence,
    );

    return {
      schemaVersion: "1.0",
      contextId,
      state: knownStatus,
      known,
      unknown,
      contradictions,
      measurements,
      hypotheses,
      recommendedProbes: [],
      evidenceRefs,
      investigationHistory: [...(input.investigationHistory ?? [])],
      impact: input.impact ?? {
        affectedFloors: [],
        affectedArtifacts: [],
        severity: "LOW",
        reversible: true,
      },
      cognitiveRecommendation: {
        mode: "DETERMINISTIC",
        reason: "Epistemic state constructed; routing pending.",
        reasonCode: "NO_MATERIAL_UNCERTAINTY",
        deadlineMs: 1,
        expectedValue: 0,
        shouldInvokeAscalon: false,
        estimatedCostUnits: 0,
        expectedBenefit: 0,
        expectedCost: 0,
        uncertaintyBurden: 0,
        baselineMode: "DETERMINISTIC",
        expectedValueSource: "UNAVAILABLE",
        budget: {
          maxTimeMs: 0,
          maxCallsRemaining: 0,
          maxCostUnits: 0,
        },
      },
      budgets: {
        maxEpistemicTimeMs: 0,
        maxDeepCalls: 0,
        maxMicroCalls: 0,
        maxProbeCount: 0,
        maxCostUnits: 0,
      },
      usage: {
        elapsedMs: Date.now() - now,
        deepCalls: 0,
        microCalls: 0,
        probesExecuted: 0,
        costUnits: 0,
      },
      freshness,
      authorityClass: input.authorityClass ?? "MODEL_ADVISORY",
    };
  }

  public computeFingerprint(state: unknown): string {
    return fingerprint(state);
  }

  public validateModelSupport(value: number): void {
    assertUnitInterval(value, "model support");
  }
}
