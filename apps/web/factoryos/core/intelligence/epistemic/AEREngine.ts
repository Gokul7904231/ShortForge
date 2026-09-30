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

export interface AERAssessmentInput extends BuildEpistemicStateInput {
  readonly probes?: readonly CognitiveProbe[];
  readonly budget: EpistemicBudget;
  readonly routing?: CognitiveRoutingOptions;
  readonly probePlanning?: ProbePlanningOptions;
  readonly usage?: EpistemicUsage;
  readonly contextTtlMs?: number;
}

export interface AERAssessment {
  readonly state: EpistemicState;
  readonly context: EpistemicContext;
  readonly ascalonHandoff: ReturnType<AscalonEpistemicHandoffBuilder["build"]>;
}

export class AEREngine {
  private readonly stateEngine = new EpistemicStateEngine();
  private readonly ascalonHandoffBuilder = new AscalonEpistemicHandoffBuilder();

  public assess(input: AERAssessmentInput): AERAssessment {
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
      input.routing,
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
    });

    const ascalonHandoff = this.ascalonHandoffBuilder.build(context);

    return { state: enrichedState, context, ascalonHandoff };
  }
}
