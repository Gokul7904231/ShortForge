/**
 * ShortForge / FactoryOS — AER Decision Core Adapter
 *
 * Provider-injected boundary for the trained AER Decision Core.
 * This adapter remains advisory; production authority is impossible here.
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
    this.implementationVersion =
      config.implementationVersion ?? "0.2.0-adapter";
  }

  public async evaluateBatch(
    request: DecisionBatchRequest,
  ): Promise<DecisionBatchResult> {
    assertDynamicQuestionContract(request.questions);

    const unsupportedQuestion = request.questions.find(
      (question) => !this.provider.supportedModes.includes(question.type),
    );
    if (unsupportedQuestion) {
      throw new Error(
        "AER-Core provider does not support decision mode: " +
          unsupportedQuestion.type,
      );
    }

    const startedAt = Date.now();
    const output = await this.provider.evaluate({
      request,
      epistemicContext: request.sharedContext,
    });

    const answersById: Record<string, DecisionAnswer> = {};
    let duplicate = false;
    for (const answer of output.answers) {
      if (answersById[answer.questionId]) duplicate = true;
      answersById[answer.questionId] = answer;
    }

    const expectedIds = new Set(request.questions.map((question) => question.id));
    const missing = request.questions.some(
      (question) => !answersById[question.id],
    );
    const foreign = output.answers.some(
      (answer) => !expectedIds.has(answer.questionId),
    );
    const batchMismatch = output.batchId !== request.batchId;

    if (missing || foreign || duplicate || batchMismatch) {
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
          implementationVersion: output.modelVersion || this.implementationVersion,
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
    const minConfidence = confidences.length
      ? Math.min(...confidences)
      : 0;

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
        implementationVersion:
          output.modelVersion || this.implementationVersion,
        isProductionAuthority:
          output.productionAuthority &&
          AER_DECISION_CORE_AUTHORITY.productionAuthority,
        // Runtime model predictions are never themselves golden training data.
        isTrainingEligible: false,
        authorityClass: "MODEL_ADVISORY",
        modelRef: output.modelRef,
        probabilitySemantics: output.probabilitySemantics,
        capabilityClass: "FAST_TYPED_DECISION",
      },
    };
  }
}
