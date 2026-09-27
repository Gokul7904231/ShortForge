import {
  DecisionBatchRequest,
  DecisionBatchResult,
  DecisionAnswer,
  IDecisionAdapter,
  NoulQuestion,
  ChoiceQuestion,
  ScoreQuestion,
  DecisionStatus,
  DecisionValidationErrorCode,
} from "./DecisionContracts";

type JsonRecord = Record<string, any>;

export interface CLMDecisionAdapterConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
}

/**
 * CLM-backed fast decision adapter for ShortForge.
 *
 * This adapter is intentionally SHADOW ONLY: CLM ranks a closed candidate set,
 * its probabilities are relative to that candidate set, and the adapter never
 * becomes an authorization or release authority. Malformed/unavailable responses
 * fail closed; there is no heuristic or first-option fallback.
 */
export class CLMDecisionAdapter implements IDecisionAdapter {
  readonly adapterName = "CLM";
  private readonly config: Required<Pick<CLMDecisionAdapterConfig, "baseUrl" | "model" | "timeoutMs" | "temperature">> &
    Pick<CLMDecisionAdapterConfig, "apiKey">;

  constructor(config: CLMDecisionAdapterConfig = {}) {
    this.config = {
      baseUrl: (config.baseUrl ?? process.env.CLM_BASE_URL ?? "http://127.0.0.1:8700").replace(/\/$/, ""),
      apiKey: config.apiKey ?? process.env.CLM_API_KEY,
      model: config.model ?? process.env.CLM_MODEL ?? "clm-latest",
      timeoutMs: config.timeoutMs ?? 5_000,
      temperature: config.temperature ?? 1.0,
    };
  }

  public async evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.baseUrl + "/v1/systemone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey ? { Authorization: "Bearer " + this.config.apiKey } : {}),
        },
        body: JSON.stringify({
          state: request.sharedContext ?? {},
          model: this.config.model,
          temperature: this.config.temperature,
          questions: Object.fromEntries(request.questions.map((question) => [question.id, this.toCLMQuestion(question)])),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const code: DecisionValidationErrorCode = response.status === 401 || response.status === 403
          ? "AUTHENTICATION_FAILED"
          : "ADAPTER_UNAVAILABLE";
        return this.unresolvedBatch(request, Date.now() - startedAt, code,
          "CLM HTTP " + response.status + (detail ? ": " + detail.slice(0, 300) : ""));
      }

      const payload = (await response.json()) as JsonRecord;
      return this.parseResponse(request, payload, Date.now() - startedAt);
    } catch (error: any) {
      const code: DecisionValidationErrorCode = error?.name === "AbortError"
        ? "ADAPTER_TIMEOUT"
        : "ADAPTER_UNAVAILABLE";
      return this.unresolvedBatch(request, Date.now() - startedAt, code, error?.message ?? "CLM request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse(request: DecisionBatchRequest, payload: JsonRecord, latencyMs: number): DecisionBatchResult {
    if (!payload || typeof payload !== "object" || !payload.answers || typeof payload.answers !== "object") {
      return this.unresolvedBatch(request, latencyMs, "INVALID_MODEL_RESPONSE", "CLM response did not contain an answers object");
    }

    const answersById: Record<string, DecisionAnswer> = {};
    const answers: DecisionAnswer[] = [];
    let invalid = false;

    for (const question of request.questions) {
      const raw = payload.answers[question.id] as JsonRecord | undefined;
      const answer = raw ? this.parseAnswer(question, raw) : this.invalidAnswer(question, "MISSING_QUESTION",
        "CLM response omitted question " + question.id);
      answers.push(answer);
      answersById[question.id] = answer;
      if (answer.status === "INVALID" || answer.status === "UNRESOLVED") invalid = true;
    }

    const minConfidence = answers.length ? Math.min(...answers.map((answer) => answer.confidence)) : 0;
    return {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers,
      answersById,
      adapterUsed: "CLM_SHADOW",
      totalLatencyMs: latencyMs,
      minConfidence,
      shouldEscalate: minConfidence < 0.7 || invalid,
      status: invalid ? "UNRESOLVED" : "VALID",
      adapterMetadata: {
        adapterType: "CLM_SHADOW",
        implementationVersion: "1.0.0",
        isProductionAuthority: false,
        isTrainingEligible: false,
        modelRef: this.config.model,
        probabilitySemantics: "CANDIDATE_RELATIVE",
        capabilityClass: "FAST_DECISION",
      },
    };
  }

  private parseAnswer(question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion, raw: JsonRecord): DecisionAnswer {
    if (question.type === "NOUL") {
      const probability = raw.noul;
      if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
        return this.invalidAnswer(question, "INVALID_PROBABILITY", "CLM NOUL probability must be in [0,1]");
      }
      const confidence = this.readConfidence(raw);
      return {
        questionId: question.id,
        type: "NOUL",
        value: probability >= (question.threshold ?? 0.5),
        probabilityTrue: probability,
        confidence: confidence.value,
        reasoning: "CLM candidate-relative decision; no generative fallback used",
        isDeterministic: false,
        status: "VALID",
        uncertainty: {
          modelProbability: probability,
          epistemicConfidence: confidence.value,
          calibrationStatus: "UNCALIBRATED",
          confidenceSource: confidence.source,
          probabilitySemantics: "CANDIDATE_RELATIVE",
          uncertaintyReason: confidence.source === "NONE"
            ? "CLM response did not expose epistemic confidence for NOUL; confidence is intentionally set to 0."
            : "CLM probability is relative to the supplied candidate set.",
        },
      };
    }

    if (question.type === "CHOICE") {
      const selected = raw.choice;
      const probabilities = raw.probabilities;
      if (typeof selected !== "string" || !question.options.includes(selected)) {
        return this.invalidAnswer(question, "INVALID_ENUM", "CLM selected an undeclared choice");
      }
      if (!probabilities || typeof probabilities !== "object" || Array.isArray(probabilities)) {
        return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM choice response lacks probabilities");
      }
      const typed: Record<string, number> = {};
      let sum = 0;
      for (const option of question.options) {
        const p = probabilities[option];
        if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) {
          return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM probability missing/invalid for option " + option);
        }
        typed[option] = p;
        sum += p;
      }
      for (const key of Object.keys(probabilities)) {
        if (!question.options.includes(key)) {
          return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM returned an undeclared probability key " + key);
        }
      }
      if (Math.abs(sum - 1) > 0.01) {
        return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM probability distribution does not normalize");
      }
      const confidence = this.readConfidence(raw);
      return {
        questionId: question.id,
        type: "CHOICE",
        selected,
        probabilities: typed,
        confidence: confidence.value,
        reasoning: "CLM candidate-relative choice ranking",
        isDeterministic: false,
        status: "VALID",
        uncertainty: {
          modelProbability: typed[selected],
          epistemicConfidence: confidence.value,
          calibrationStatus: "UNCALIBRATED",
          confidenceSource: confidence.source,
          probabilitySemantics: "CANDIDATE_RELATIVE",
          uncertaintyReason: "Probabilities are computed over the exact option set supplied to CLM.",
        },
      };
    }

    const probabilities = raw.probabilities;
    if (!probabilities || typeof probabilities !== "object" || Array.isArray(probabilities)) {
      return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM score response lacks probabilities");
    }
    const mapped: Record<number, number> = {};
    let sum = 0;
    let bestIndex = -1;
    let bestProbability = -1;
    for (let index = 0; index < question.rubric.length; index++) {
      const rawProbability = probabilities[String(index)];
      if (typeof rawProbability !== "number" || !Number.isFinite(rawProbability) || rawProbability < 0 || rawProbability > 1) {
        return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM score probability missing/invalid at index " + index);
      }
      const level = question.rubric[index].level;
      mapped[level] = rawProbability;
      sum += rawProbability;
      if (rawProbability > bestProbability) {
        bestProbability = rawProbability;
        bestIndex = index;
      }
    }
    if (Math.abs(sum - 1) > 0.01 || bestIndex < 0) {
      return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM score probability distribution does not normalize");
    }
    const expectedIndex = typeof raw.score === "number" && Number.isFinite(raw.score)
      ? raw.score
      : Object.entries(probabilities).reduce((acc, [key, p]) => acc + Number(key) * Number(p), 0);
    const maxIndex = Math.max(question.rubric.length - 1, 1);
    const normalizedScore = Math.max(0, Math.min(1, expectedIndex / maxIndex));
    const confidence = this.readConfidence(raw);
    return {
      questionId: question.id,
      type: "SCORE",
      selectedLevel: question.rubric[bestIndex].level,
      selectedLabel: question.rubric[bestIndex].label,
      score: normalizedScore,
      distribution: mapped,
      confidence: confidence.value,
      reasoning: "CLM candidate-relative ordered score",
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: bestProbability,
        epistemicConfidence: confidence.value,
        calibrationStatus: "UNCALIBRATED",
        confidenceSource: confidence.source,
        probabilitySemantics: "CANDIDATE_RELATIVE",
        uncertaintyReason: "Score probabilities are defined over the supplied ordered rubric only.",
      },
    };
  }

  private readConfidence(raw: JsonRecord): { value: number; source: "MODEL" | "NONE" } {
    if (typeof raw.confidence === "number" && Number.isFinite(raw.confidence) && raw.confidence >= 0 && raw.confidence <= 1) {
      return { value: raw.confidence, source: "MODEL" };
    }
    return { value: 0, source: "NONE" };
  }

  private toCLMQuestion(question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion): JsonRecord {
    if (question.type === "NOUL") {
      return { type: "noul", instructions: question.question, criteria: { true: "true", false: "false" } };
    }
    if (question.type === "CHOICE") {
      return {
        type: "choice",
        instructions: question.question,
        criteria: Object.fromEntries(question.options.map((option) => [option, option])),
      };
    }
    return {
      type: "score",
      instructions: question.question,
      criteria: question.rubric.map((level) => level.description || level.label),
    };
  }

  private invalidAnswer(question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion,
    code: DecisionValidationErrorCode, reason: string): DecisionAnswer {
    if (question.type === "NOUL") {
      return {
        questionId: question.id, type: "NOUL", value: false, probabilityTrue: 0, confidence: 0,
        reasoning: "VALIDATION_FAILURE: " + reason, isDeterministic: false, status: "INVALID",
        validationErrorCode: code, uncertainty: { modelProbability: 0, epistemicConfidence: 0,
          calibrationStatus: "UNKNOWN", confidenceSource: "NONE", probabilitySemantics: "UNKNOWN", uncertaintyReason: reason },
      };
    }
    if (question.type === "CHOICE") {
      const probabilities: Record<string, number> = Object.fromEntries(question.options.map((option) => [option, 0]));
      return {
        questionId: question.id, type: "CHOICE", selected: "" as any, probabilities, confidence: 0,
        reasoning: "VALIDATION_FAILURE: " + reason, isDeterministic: false, status: "INVALID",
        validationErrorCode: code, uncertainty: { epistemicConfidence: 0, calibrationStatus: "UNKNOWN",
          confidenceSource: "NONE", probabilitySemantics: "UNKNOWN", uncertaintyReason: reason },
      };
    }
    const distribution: Record<number, number> = Object.fromEntries(question.rubric.map((level) => [level.level, 0]));
    return {
      questionId: question.id, type: "SCORE", selectedLevel: -1, selectedLabel: "UNRESOLVED", score: 0,
      distribution, confidence: 0, reasoning: "VALIDATION_FAILURE: " + reason, isDeterministic: false, status: "INVALID",
      validationErrorCode: code, uncertainty: { epistemicConfidence: 0, calibrationStatus: "UNKNOWN",
        confidenceSource: "NONE", probabilitySemantics: "UNKNOWN", uncertaintyReason: reason },
    };
  }

  private unresolvedBatch(request: DecisionBatchRequest, latencyMs: number,
    code: DecisionValidationErrorCode, reason: string): DecisionBatchResult {
    const answers = request.questions.map((question) => this.invalidAnswer(question, code, reason));
    const answersById: Record<string, DecisionAnswer> = {};
    for (const answer of answers) answersById[answer.questionId] = answer;
    return {
      batchId: request.batchId, evaluatedAt: new Date().toISOString(), answers, answersById,
      adapterUsed: "CLM_SHADOW", totalLatencyMs: latencyMs, minConfidence: 0, shouldEscalate: true,
      status: "UNRESOLVED",
      adapterMetadata: {
        adapterType: "CLM_SHADOW", implementationVersion: "1.0.0", isProductionAuthority: false,
        isTrainingEligible: false, modelRef: this.config.model, probabilitySemantics: "CANDIDATE_RELATIVE",
        capabilityClass: "FAST_DECISION",
      },
    };
  }
}