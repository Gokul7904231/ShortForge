import { createHash } from "node:crypto";
import type {
  CognitiveProbe,
  EpistemicState,
  EpistemicUsage,
} from "./EpistemicContracts";
import { EpistemicBudgetController } from "./EpistemicBudget";
import { validateMeasurement } from "./EpistemicContracts";
import {
  AEREngine,
  type AERAssessment,
  type AERAssessmentInput,
} from "./AEREngine";
import { EpistemicLedger } from "./EpistemicLedger";
import type { AERProbeExecutor, AERProbeExecutionResult } from "./AERProbeExecution";

export type AERInvestigationTermination =
  | "RESOLVED"
  | "ASCALON_ESCALATION"
  | "NO_ADMISSIBLE_PROBES"
  | "BUDGET_EXHAUSTED"
  | "MAX_ITERATIONS"
  | "NO_PROGRESS";

export interface AERInvestigationOptions {
  readonly maxIterations?: number;
  readonly maxParallelReadOnlyProbes?: number;
}

export interface AERInvestigationResult {
  readonly initialAssessment: AERAssessment;
  readonly finalAssessment: AERAssessment;
  readonly probeResults: readonly AERProbeExecutionResult[];
  readonly iterations: number;
  readonly termination: AERInvestigationTermination;
}

function isMateriallyResolved(state: EpistemicState): boolean {
  return (
    !state.unknown.some((item) => item.material) &&
    !state.contradictions.some((item) => item.material) &&
    state.hypotheses.filter(
      (item) => item.status !== "ELIMINATED" && item.status !== "CONTRADICTED",
    ).length <= 1
  );
}

function mergeById<T, K extends keyof T>(
  base: readonly T[],
  additions: readonly T[],
  idKey: K,
): T[] {
  const result = new Map<string, T>();
  for (const item of base) {
    const id = String(item[idKey]);
    if (id) result.set(id, item);
  }
  for (const item of additions) {
    const id = String(item[idKey]);
    if (id) result.set(id, item);
  }
  return [...result.values()];
}

function removeByIds<T, K extends keyof T>(
  base: readonly T[],
  ids: readonly string[],
  idKey: K,
): T[] {
  const blocked = new Set(ids);
  return base.filter((item) => !blocked.has(String(item[idKey])));
}

function chooseProbeBatch(
  probes: readonly CognitiveProbe[],
  maxParallel: number,
  controller: EpistemicBudgetController,
  usage: EpistemicUsage,
): CognitiveProbe[] {
  const readOnly = probes.filter((probe) => probe.riskClass === "READ_ONLY");
  if (readOnly.length === 0) return [];

  const candidates = readOnly.filter((probe) => probe.parallelizable);
  const selected: CognitiveProbe[] = [];

  for (const probe of (candidates.length > 0 ? candidates : readOnly)) {
    const projected: EpistemicUsage = {
      ...usage,
      probesExecuted: usage.probesExecuted + selected.length,
      costUnits: usage.costUnits + selected.reduce(
        (sum, item) => sum + Math.max(0, item.estimatedCostUnits),
        0,
      ),
    };

    if (!controller.canRunProbe(projected, Math.max(0, probe.estimatedCostUnits))) {
      continue;
    }

    selected.push(probe);
    if (candidates.length === 0 || selected.length >= Math.max(1, maxParallel)) {
      break;
    }
  }

  return selected;
}

function epistemicContentFingerprint(state: EpistemicState): string {
  const payload = {
    state: state.state,
    known: state.known,
    unknown: state.unknown,
    contradictions: state.contradictions,
    measurements: state.measurements,
    hypotheses: state.hypotheses,
    evidenceRefs: state.evidenceRefs,
  };

  return createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}

export class AERInvestigationLoop {
  public constructor(
    private readonly engine = new AEREngine(),
    private readonly ledger = new EpistemicLedger(),
  ) {}

  public async investigate(
    input: AERAssessmentInput,
    executor: AERProbeExecutor,
    options: AERInvestigationOptions = {},
  ): Promise<AERInvestigationResult> {
    const maxIterations = Math.max(1, options.maxIterations ?? 3);
    const maxParallel = Math.max(1, options.maxParallelReadOnlyProbes ?? 3);

    let currentInput: AERAssessmentInput = { ...input };
    let assessment = this.engine.assess(currentInput);
    const initialAssessment = assessment;
    const probeResults: AERProbeExecutionResult[] = [];

    this.ledger.append({
      context: assessment.context,
      eventType: "ASSESSMENT",
      payload: {
        episodeId: input.episodeId ?? assessment.context.contextId,
        route: assessment.state.cognitiveRecommendation.mode,
        shouldInvokeAscalon: assessment.state.cognitiveRecommendation.shouldInvokeAscalon,
      },
    });

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const state = assessment.state;

      if (isMateriallyResolved(state)) {
        this.recordOutcome(assessment, "resolved", iteration);
        return {
          initialAssessment,
          finalAssessment: assessment,
          probeResults,
          iterations: iteration - 1,
          termination: "RESOLVED",
        };
      }

      if (state.cognitiveRecommendation.shouldInvokeAscalon) {
        return {
          initialAssessment,
          finalAssessment: assessment,
          probeResults,
          iterations: iteration - 1,
          termination: "ASCALON_ESCALATION",
        };
      }

      const controller = new EpistemicBudgetController(state.budgets);
      const planned = chooseProbeBatch(
        state.recommendedProbes,
        maxParallel,
        controller,
        state.usage,
      );

      if (planned.length === 0) {
        const exhausted =
          state.usage.probesExecuted >= state.budgets.maxProbeCount ||
          state.usage.costUnits >= state.budgets.maxCostUnits ||
          state.usage.elapsedMs >= state.budgets.maxEpistemicTimeMs;
        return {
          initialAssessment,
          finalAssessment: assessment,
          probeResults,
          iterations: iteration - 1,
          termination: exhausted ? "BUDGET_EXHAUSTED" : "NO_ADMISSIBLE_PROBES",
        };
      }

      const started = Date.now();
      const episodeId = input.episodeId ?? assessment.context.contextId;
      const deadlineAtMs =
        Date.now() + state.cognitiveRecommendation.budget.maxTimeMs;

      const results = await Promise.all(
        planned.map((probe) =>
          executor.execute({
            episodeId,
            context: assessment.context,
            probe,
            deadlineAtMs,
          }),
        ),
      );

      probeResults.push(...results);

      let known = [...(currentInput.known ?? [])];
      let unknown = [...(currentInput.unknown ?? [])];
      let contradictions = [...(currentInput.contradictions ?? [])];
      let measurements = [...(currentInput.measurements ?? [])];
      let hypotheses = [...(currentInput.hypotheses ?? [])];
      const evidenceRefs = new Set(currentInput.evidenceRefs ?? []);
      let investigationHistory = [...(currentInput.investigationHistory ?? [])];

      for (const result of results) {
        if (
          (result.status === "VERIFIED" || result.status === "OBSERVED") &&
          result.evidenceRefs.length === 0
        ) {
          throw new Error(
            `[AER] Probe ${result.probeId} returned ${result.status} without evidenceRefs.`,
          );
        }

        if (result.latencyMs < 0 || result.costUnits < 0) {
          throw new Error(
            `[AER] Probe ${result.probeId} returned negative latency/cost.`,
          );
        }

        for (const measurement of result.measurementsAdded ?? []) {
          validateMeasurement(measurement);
        }

        if (
          (result.resolvedUnknownIds?.length ?? 0) > 0 &&
          (result.status !== "VERIFIED" || result.evidenceRefs.length === 0)
        ) {
          throw new Error(
            `[AER] Probe ${result.probeId} cannot resolve unknowns unless VERIFIED evidence is returned.`,
          );
        }

        if (
          (result.resolvedContradictionIds?.length ?? 0) > 0 &&
          (result.status !== "VERIFIED" || result.evidenceRefs.length === 0)
        ) {
          throw new Error(
            `[AER] Probe ${result.probeId} cannot resolve contradictions unless VERIFIED evidence is returned.`,
          );
        }

        for (const ref of result.evidenceRefs) evidenceRefs.add(ref);
        known = mergeById(known, result.knownAdded ?? [], "factId");
        unknown = mergeById(unknown, result.unknownAdded ?? [], "unknownId");
        contradictions = mergeById(
          contradictions,
          result.contradictionsAdded ?? [],
          "contradictionId",
        );
        measurements = mergeById(
          measurements,
          result.measurementsAdded ?? [],
          "measurementId",
        );
        hypotheses = mergeById(
          hypotheses,
          result.hypothesesAddedOrUpdated ?? [],
          "hypothesisId",
        );
        unknown = removeByIds(
          unknown,
          result.resolvedUnknownIds ?? [],
          "unknownId",
        );
        contradictions = removeByIds(
          contradictions,
          result.resolvedContradictionIds ?? [],
          "contradictionId",
        );

        investigationHistory.push({
          iteration,
          probeId: result.probeId,
          executorRunId: result.executorRunId,
          status: result.status,
          latencyMs: result.latencyMs,
          costUnits: result.costUnits,
          error: result.error ?? null,
        });

        this.engine.metrics.recordProbe({
          episodeId,
          executed: true,
          useful:
            (result.knownAdded?.length ?? 0) > 0 ||
            (result.measurementsAdded?.length ?? 0) > 0 ||
            (result.resolvedUnknownIds?.length ?? 0) > 0 ||
            (result.resolvedContradictionIds?.length ?? 0) > 0,
          costUnits: result.costUnits,
        });

        this.ledger.append({
          context: assessment.context,
          eventType: "PROBE_RESULT",
          payload: {
            probeId: result.probeId,
            executorRunId: result.executorRunId,
            status: result.status,
            evidenceRefs: result.evidenceRefs,
            latencyMs: result.latencyMs,
            costUnits: result.costUnits,
            error: result.error ?? null,
          },
        });
      }

      const elapsedMs = state.usage.elapsedMs + (Date.now() - started);
      const probesExecuted = state.usage.probesExecuted + results.length;
      const costUnits =
        state.usage.costUnits +
        results.reduce((sum, result) => sum + Math.max(0, result.costUnits), 0);

      const usage: EpistemicUsage = {
        elapsedMs,
        deepCalls: state.usage.deepCalls,
        microCalls: state.usage.microCalls,
        probesExecuted,
        costUnits,
      };

      currentInput = {
        ...currentInput,
        known,
        unknown,
        contradictions,
        measurements,
        hypotheses,
        evidenceRefs: [...evidenceRefs].sort(),
        investigationHistory,
        usage,
      };

      const previousFingerprint = epistemicContentFingerprint(assessment.state);
      assessment = this.engine.assess(currentInput);

      if (epistemicContentFingerprint(assessment.state) === previousFingerprint) {
        return {
          initialAssessment,
          finalAssessment: assessment,
          probeResults,
          iterations: iteration,
          termination: "NO_PROGRESS",
        };
      }
    }

    return {
      initialAssessment,
      finalAssessment: assessment,
      probeResults,
      iterations: maxIterations,
      termination: "MAX_ITERATIONS",
    };
  }

  private recordOutcome(
    assessment: AERAssessment,
    result: "resolved",
    iteration: number,
  ): void {
    this.ledger.append({
      context: assessment.context,
      eventType: "OUTCOME",
      payload: {
        result,
        iteration,
        evidenceRefs: assessment.state.evidenceRefs,
      },
    });
  }
}
