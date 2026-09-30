import type {
  CognitiveProbe,
  EpistemicBudget,
  EpistemicUsage,
  ProbePlanEntry,
} from "./EpistemicContracts";
import { EpistemicBudgetController } from "./EpistemicBudget";

export interface ProbePlanningOptions {
  readonly availableCapabilities?: ReadonlySet<string>;
  readonly maxProbes?: number;
  readonly usage?: EpistemicUsage;
}

function normalizedCost(probe: CognitiveProbe): number {
  const latencyCost = Math.max(1, probe.estimatedLatencyMs) / 1000;
  const computeCost = Math.max(0, probe.estimatedCostUnits);
  const riskCost =
    probe.riskClass === "MUTATING"
      ? 10
      : probe.riskClass === "SENSITIVE_READ"
        ? 2
        : 0;
  return Math.max(0.1, latencyCost + computeCost + riskCost);
}

export class ProbePlanner {
  private readonly controller: EpistemicBudgetController;

  constructor(budget: EpistemicBudget) {
    this.controller = new EpistemicBudgetController(budget);
  }

  public plan(
    probes: readonly CognitiveProbe[],
    options: ProbePlanningOptions = {},
  ): ProbePlanEntry[] {
    const capabilities = options.availableCapabilities;
    const usage = options.usage ?? {
      elapsedMs: 0,
      deepCalls: 0,
      microCalls: 0,
      probesExecuted: 0,
      costUnits: 0,
    };

    const entries = probes.map((probe) => {
      const missingCapabilities = probe.requiredCapabilities.filter(
        (capability) => capabilities !== undefined && !capabilities.has(capability),
      );

      if (probe.authorized === false) {
        return {
          ...probe,
          utilityScore: Number.NEGATIVE_INFINITY,
          rejectionReason: "probe_not_authorized",
        };
      }

      if (probe.riskClass !== "READ_ONLY" && probe.authorized !== true) {
        return {
          ...probe,
          utilityScore: Number.NEGATIVE_INFINITY,
          rejectionReason: "side_effecting_probe_requires_authorization",
        };
      }

      if (missingCapabilities.length > 0) {
        return {
          ...probe,
          utilityScore: Number.NEGATIVE_INFINITY,
          rejectionReason: `missing_capabilities:${missingCapabilities.join(",")}`,
        };
      }

      if (!this.controller.canRunProbe(usage, probe.estimatedCostUnits)) {
        return {
          ...probe,
          utilityScore: Number.NEGATIVE_INFINITY,
          rejectionReason: "budget_exhausted",
        };
      }

      if (
        !Number.isFinite(probe.expectedInformationGain) ||
        probe.expectedInformationGain < 0 ||
        probe.expectedInformationGain > 1
      ) {
        return {
          ...probe,
          utilityScore: Number.NEGATIVE_INFINITY,
          rejectionReason: "invalid_information_gain",
        };
      }

      const decisionChangeProbability = Math.max(
        0,
        Math.min(1, probe.expectedDecisionChangeProbability ?? 1),
      );
      const discrimination = Math.max(
        0,
        Math.min(1, probe.hypothesisDiscriminationScore ?? 1),
      );
      const decisionAwareInformationValue =
        probe.expectedInformationGain *
        decisionChangeProbability *
        (0.5 + 0.5 * discrimination);

      const utilityScore =
        decisionAwareInformationValue / normalizedCost(probe);
      return { ...probe, utilityScore };
    });

    const accepted = entries
      .filter((entry) => Number.isFinite(entry.utilityScore))
      .sort(
        (a, b) =>
          b.utilityScore - a.utilityScore ||
          a.estimatedLatencyMs - b.estimatedLatencyMs ||
          a.probeId.localeCompare(b.probeId),
      );

    const limit = Math.max(
      0,
      options.maxProbes ?? this.controller.getBudget().maxProbeCount,
    );

    return accepted.slice(0, limit);
  }
}
