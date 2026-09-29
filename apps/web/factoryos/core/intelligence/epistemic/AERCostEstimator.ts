import type { RegisteredModel } from "../../routing/ModelRoutingContracts";

export interface AERTokenEstimate {
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
  readonly totalTokens: number;
  readonly method: "PROVIDER_MODEL_METADATA" | "CHARACTER_HEURISTIC" | "EXTERNAL_TOKENIZER";
}

export interface AERModelCostEstimate extends AERTokenEstimate {
  readonly providerId: string;
  readonly modelId: string;
  readonly estimatedCostUsd: number;
  readonly estimatedLatencyMs: number;
  readonly pricingSource: "REGISTERED_MODEL";
}

export class AERCostEstimator {
  public static estimateTokens(
    serializedContext: string,
    estimatedOutputTokens = 0,
  ): AERTokenEstimate {
    const input = Math.max(0, Math.ceil(serializedContext.length / 4));
    const output = Math.max(0, estimatedOutputTokens);

    return {
      estimatedInputTokens: input,
      estimatedOutputTokens: output,
      totalTokens: input + output,
      method: "CHARACTER_HEURISTIC",
    };
  }

  public static estimateFromModel(
    model: RegisteredModel,
    serializedContext: string,
    estimatedOutputTokens = 0,
  ): AERModelCostEstimate {
    const tokens = this.estimateTokens(serializedContext, estimatedOutputTokens);
    const estimatedCostUsd =
      (tokens.totalTokens / 1000) * Math.max(0, model.costPer1kTokensUsd);

    return {
      ...tokens,
      providerId: model.providerId,
      modelId: model.modelId,
      estimatedCostUsd,
      estimatedLatencyMs: Math.max(0, model.baselineLatencyMs),
      pricingSource: "REGISTERED_MODEL",
    };
  }

  public static withExternalTokenizer(
    serializedContext: string,
    tokenize: (value: string) => number,
    estimatedOutputTokens = 0,
  ): AERTokenEstimate {
    const estimatedInputTokens = Math.max(
      0,
      Math.floor(tokenize(serializedContext)),
    );
    const output = Math.max(0, estimatedOutputTokens);

    return {
      estimatedInputTokens,
      estimatedOutputTokens: output,
      totalTokens: estimatedInputTokens + output,
      method: "EXTERNAL_TOKENIZER",
    };
  }
}
