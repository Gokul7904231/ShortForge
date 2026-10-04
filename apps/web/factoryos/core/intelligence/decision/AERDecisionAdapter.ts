/**
 * ShortForge / FactoryOS — AER Decision Core Adapter
 *
 * Provider-injected boundary for the future trained AER Decision Core.
 * This adapter never invents model outputs, probabilities or confidence.
 */

import {
  type DecisionAnswer,
  type DecisionBatchRequest,
  type DecisionBatchResult,
  type IDecisionAdapter,
} from "./DecisionContracts";
import {
  AER_DECISION_CORE_AUTHORITY,
  assertDynamicQuestionContract,
  type AERDecisionCoreProvider,
} from "./AERDecisionCoreContract";

export interface AERDecisionAdapterConfig {
  readonly provider: AERDecisionCoreProvider;
  readonly implementationVersion?: string;
}

export class AERDecisionAdapter implements IDecisionAdapter {
  public readonly adapterName = "AER_CORE";

  private readonly provider: AERDecisionCoreProvider;
  private readonly implementationVersion: string;

  public constructor(config: AERDecisionAdapterConfig) {
    this.provider = config.provider;
    this.implementationVersion = config.implementationVersion ?? "0.1.0-contract";
  }

  public async evaluateBatch(
    request: DecisionBatchRequest,
  ): Promise<DecisionBatchResult> {
    assertDynamicQuestionContract(request.questions);

    const startedAt = Date.now();
    const output = await this.provider.evaluate({
      request,
      epistemicContext: request.sharedContext,
    });

    const answersById: Record<string, DecisionAnswer> = {};
    for (const answer of output.answers) {
      answersById[answer.questionId] = answer;
    }

    const expectedIds = new Set(request.questions.map((question) => question.id));
    const missing = request.questions.some((question) => !answersById[question.id]);
    const foreign = output.answers.some((answer) => !expectedIds.has(answer.questionId));

    if (missing || foreign) {
      return {
        batchId: request.batchId,
        evaluatedAt: new Date().toISOString(),
        answers: output.answers,
        answersById,
        adapterUsed: "AER_CORE",
        totalLatencyMs: Date.now() - startedAt,
        minConfidence: 0,
        shouldEscalate: true,
        status: "UNRESOLVED",
        adapterMetadata: {
          adapterType: this.adapterName,
          implementationVersion: this.implementationVersion,
          isProductionAuthority: false,
          isTrainingEligible: false,
          authorityClass: "MODEL_ADVISORY",
          modelRef: output.modelRef,
          probabilitySemantics: output.probabilitySemantics,
          capabilityClass: "FAST_TYPED_DECISION",
        },
      };
    }

    const confidences = output.answers.map((answer) => answer.confidence);
    const minConfidence = confidences.length ? Math.min(...confidences) : 0;

    return {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers: output.answers,
      answersById,
      adapterUsed: "AER_CORE",
      totalLatencyMs: Date.now() - startedAt,
      minConfidence,
      shouldEscalate: minConfidence < 0.7,
      status: "VALID",
      adapterMetadata: {
        adapterType: this.adapterName,
        implementationVersion: this.implementationVersion,
        isProductionAuthority:
          output.productionAuthority && AER_DECISION_CORE_AUTHORITY.productionAuthority,
        isTrainingEligible: output.trainingEligible,
        authorityClass: "MODEL_ADVISORY",
        modelRef: output.modelRef,
        probabilitySemantics: output.probabilitySemantics,
        capabilityClass: "FAST_TYPED_DECISION",
      },
    };
  }
}
