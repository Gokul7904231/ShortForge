import type {
  CognitiveProbe,
  EpistemicBudget,
  EpistemicContext,
  EpistemicState,
  EpistemicUsage,
} from "./EpistemicContracts";
import { EpistemicContextBuilder } from "./EpistemicContextBuilder";
import {
  CognitiveRouter,
  type CognitiveRoutingOptions,
} from "./CognitiveRouter";
import {
  EpistemicStateEngine,
  type BuildEpistemicStateInput,
} from "./EpistemicStateEngine";
import { ProbePlanner, type ProbePlanningOptions } from "./ProbePlanner";
import { AscalonEpistemicHandoffBuilder } from "./AscalonEpistemicHandoff";
import { AscalonInvocationGate, type AscalonInvocationAdmission } from "./AscalonInvocationGate";
import { AERMetricsRecorder } from "./AERMetrics";

export interface AERAssessmentInput extends BuildEpistemicStateInput {
  readonly probes?: readonly CognitiveProbe[];
  readonly budget: EpistemicBudget;
  readonly routing?: CognitiveRoutingOptions;
  readonly probePlanning?: ProbePlanningOptions;
  readonly usage?: EpistemicUsage;
  readonly contextTtlMs?: number;
  readonly episodeId?: string;
  readonly assessmentCostUnits?: number;
  readonly tokenEstimator?: (serialized: string) => number;
}

export interface AERAssessment {
  readonly state: EpistemicState;
  readonly context: EpistemicContext;
  readonly ascalonHandoff: ReturnType<AscalonEpistemicHandoffBuilder["build"]>;
  readonly ascalonAdmission: AscalonInvocationAdmission;
}

export class AEREngine {
  private readonly stateEngine = new EpistemicStateEngine();
  private readonly ascalonHandoffBuilder = new AscalonEpistemicHandoffBuilder();
  private readonly ascalonInvocationGate = new AscalonInvocationGate();

  public readonly metrics: AERMetricsRecorder;

  public constructor(metrics = new AERMetricsRecorder()) {
    this.metrics = metrics;
  }

  public assess(input: AERAssessmentInput): AERAssessment {
    const startedAt = Date.now();
    const planner = new ProbePlanner(input.budget);
    const router = new CognitiveRouter(input.budget);

    const state = this.stateEngine.build(input);
    const usage = input.usage ?? state.usage;

    const recommendedProbes = planner.plan(input.probes ?? [], {
      ...input.probePlanning,
      usage,
    });

    const recommendation = router.recommend(
      {
        unknown: state.unknown,
        contradictions: state.contradictions,
        hypotheses: state.hypotheses,
        impact: state.impact,
      },
      usage,
      {
        ...input.routing,
        decisionSeed: input.episodeId ?? state.contextId,
      },
    );

    const enrichedState: EpistemicState = {
      ...state,
      recommendedProbes,
      cognitiveRecommendation: recommendation,
      budgets: input.budget,
      usage,
    };

    const contextBuilder = new EpistemicContextBuilder();
    const context = contextBuilder.build(enrichedState, {
      recommendation,
      budget: input.budget,
      usage,
      ttlMs: input.contextTtlMs,
      tokenEstimator: input.tokenEstimator,
    });

    const ascalonAdmission = this.ascalonInvocationGate.evaluate({ context });
    const ascalonHandoff = this.ascalonHandoffBuilder.build(context);

    const uncertaintyEncountered =
      state.unknown.some((item) => item.material) ||
      state.contradictions.some((item) => item.material) ||
      state.hypotheses.filter(
        (item) => item.status !== "ELIMINATED" && item.status !== "CONTRADICTED",
      ).length > 1;

    this.metrics.recordAssessment({
      episodeId: input.episodeId ?? context.contextId,
      uncertaintyEncountered,
      ascalonEscalationRecommended: recommendation.shouldInvokeAscalon,
      routedMode: recommendation.mode,
      aerLatencyMs: Date.now() - startedAt,
      assessmentCostUnits: input.assessmentCostUnits,
    });

    return { state: enrichedState, context, ascalonHandoff, ascalonAdmission };
  }
}
