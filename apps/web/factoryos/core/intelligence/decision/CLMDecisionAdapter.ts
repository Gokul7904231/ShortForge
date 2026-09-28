/**
 * Project Ascalon — CLM Fast Decision Shadow Adapter
 *
 * This adapter is deliberately advisory and disabled unless explicitly wired.
 * It may rank a closed candidate set but cannot authorize capabilities,
 * create leases, publish, certify F07, or become a training-label source.
 */

import { createHash } from "node:crypto";
import {
  AdapterMetadata,
  ChoiceQuestion,
  DecisionAnswer,
  DecisionBatchRequest,
  DecisionBatchResult,
  DecisionProbabilitySemantics,
  DecisionStatus,
  DecisionValidationErrorCode,
  IDecisionAdapter,
  NoulQuestion,
  ScoreQuestion,
  ChoiceAnswer,
  NoulAnswer,
  ScoreAnswer,
} from "./DecisionContracts";

type JsonRecord = Record<string, unknown>;

export interface CLMDecisionAdapterConfig {
  readonly baseUrl: string;
  readonly allowedOrigins: readonly string[];
  readonly apiKey?: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxQuestions: number;
  readonly maxCandidates: number;
  readonly enabled: boolean;
}

export interface CLMShadowCandidateSet {
  readonly probabilitySemantics: "CANDIDATE_RELATIVE";
  readonly candidateFingerprint: string;
}

export class CLMDecisionAdapter implements IDecisionAdapter {
  public readonly adapterName = "CLM_SHADOW";

  private readonly config: CLMDecisionAdapterConfig;

  public constructor(config: Partial<CLMDecisionAdapterConfig> = {}) {
    const baseUrl = (config.baseUrl ?? process.env.CLM_BASE_URL ?? "").replace(/\/$/, "");
    this.config = {
      baseUrl,
      allowedOrigins: config.allowedOrigins ?? this.parseOrigins(process.env.CLM_ALLOWED_ORIGINS),
      apiKey: config.apiKey ?? process.env.CLM_API_KEY,
      model: config.model ?? process.env.CLM_MODEL ?? "clm-latest",
      timeoutMs: Math.max(250, Math.min(config.timeoutMs ?? 5000, 30000)),
      maxQuestions: Math.max(1, Math.min(config.maxQuestions ?? 32, 128)),
      maxCandidates: Math.max(2, Math.min(config.maxCandidates ?? 64, 128)),
      enabled: config.enabled ?? process.env.CLM_SHADOW_ENABLED === "true",
    };
  }

  public async evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult> {
    const startedAt = Date.now();

    if (!this.config.enabled) {
      return this.unresolvedBatch(
        request,
        Date.now() - startedAt,
        "ADAPTER_UNAVAILABLE",
        "CLM shadow adapter is disabled by policy."
      );
    }

    if (!this.config.baseUrl) {
      return this.unresolvedBatch(
        request,
        Date.now() - startedAt,
        "ADAPTER_UNAVAILABLE",
        "CLM base URL is not configured."
      );
    }

    if (request.questions.length === 0 || request.questions.length > this.config.maxQuestions) {
      return this.unresolvedBatch(
        request,
        Date.now() - startedAt,
        "MISSING_FIELD",
        `CLM question count must be between 1 and ${this.config.maxQuestions}.`
      );
    }

    for (const question of request.questions) {
      const candidateCount = question.type === "CHOICE"
        ? question.options.length
        : question.type === "SCORE"
          ? question.rubric.length
          : 2;

      if (candidateCount > this.config.maxCandidates) {
        return this.unresolvedBatch(
          request,
          Date.now() - startedAt,
          "INVALID_ENUM",
          `CLM candidate count exceeds configured safety limit of ${this.config.maxCandidates}.`
        );
      }
    }

    try {
      const endpoint = this.buildEndpoint();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.config.model,
            state: request.sharedContext ?? {},
            questions: Object.fromEntries(
              request.questions.map((question) => [question.id, this.toCLMQuestion(question)])
            ),
            decisionSchemaVersion: request.decisionSchemaVersion ?? "2.1.0",
            policyVersion: request.policyVersion ?? "ascalon-decision-policy-v1",
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const code: DecisionValidationErrorCode =
            response.status === 401 || response.status === 403
              ? "AUTHENTICATION_FAILED"
              : "ADAPTER_UNAVAILABLE";
          return this.unresolvedBatch(
            request,
            Date.now() - startedAt,
            code,
            `CLM HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`
          );
        }

        const payload = await response.json() as JsonRecord;
        return this.parseResponse(request, payload, Date.now() - startedAt);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error: unknown) {
      const code: DecisionValidationErrorCode =
        error instanceof DOMException && error.name === "AbortError"
          ? "ADAPTER_TIMEOUT"
          : "ADAPTER_UNAVAILABLE";

      return this.unresolvedBatch(
        request,
        Date.now() - startedAt,
        code,
        error instanceof Error ? error.message : "CLM shadow request failed"
      );
    }
  }

  public getCandidateSetMetadata(request: DecisionBatchRequest): CLMShadowCandidateSet {
    const canonical = request.questions.map((question) => ({
      id: question.id,
      type: question.type,
      candidates: question.type === "CHOICE"
        ? [...question.options]
        : question.type === "SCORE"
          ? question.rubric.map((item) => ({
              level: item.level,
              label: item.label,
            }))
          : ["false", "true"],
    }));
    const candidateFingerprint = createHash("sha256")
      .update(JSON.stringify(canonical))
      .digest("hex");

    return {
      probabilitySemantics: "CANDIDATE_RELATIVE",
      candidateFingerprint,
    };
  }

  private buildEndpoint(): string {
    const parsed = new URL(this.config.baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("CLM base URL must use HTTP(S).");
    }

    const allowed = this.config.allowedOrigins.map((origin) => new URL(origin).origin);
    if (allowed.length === 0 || !allowed.includes(parsed.origin)) {
      throw new Error("CLM base origin is not explicitly allowlisted.");
    }

    return new URL("/v1/systemone", parsed.origin).toString();
  }

  private parseOrigins(raw: string | undefined): readonly string[] {
    if (!raw) return [];
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private parseResponse(
    request: DecisionBatchRequest,
    payload: JsonRecord,
    latencyMs: number
  ): DecisionBatchResult {
    const rawAnswers = payload.answers;
    if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
      return this.unresolvedBatch(
        request,
        latencyMs,
        "INVALID_MODEL_RESPONSE",
        "CLM response did not contain a valid answers object."
      );
    }

    const answers: DecisionAnswer[] = [];
    const answersById: Record<string, DecisionAnswer> = {};
    let invalid = false;

    for (const question of request.questions) {
      const raw = (rawAnswers as Record<string, unknown>)[question.id];
      const answer = raw && typeof raw === "object" && !Array.isArray(raw)
        ? this.parseAnswer(question, raw as JsonRecord)
        : this.invalidAnswer(question, "MISSING_QUESTION", `CLM omitted question ${question.id}.`);

      answers.push(answer);
      answersById[question.id] = answer;
      if (answer.status !== "VALID") invalid = true;
    }

    const minConfidence = answers.length
      ? Math.min(...answers.map((answer) => answer.confidence))
      : 0;

    const candidateMetadata = this.getCandidateSetMetadata(request);
    const adapterMetadata: AdapterMetadata = {
      adapterType: "CLM_SHADOW",
      implementationVersion: "2.0.0",
      isProductionAuthority: false,
      isTrainingEligible: false,
      authorityClass: "SHADOW_ONLY",
      modelRef: this.config.model,
      probabilitySemantics: candidateMetadata.probabilitySemantics,
      capabilityClass: "FAST_DECISION",
    };

    return {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers,
      answersById,
      adapterUsed: "CLM_SHADOW",
      totalLatencyMs: latencyMs,
      minConfidence,
      shouldEscalate: invalid || minConfidence < 0.70,
      status: invalid ? "UNRESOLVED" : "VALID",
      adapterMetadata,
    };
  }

  private parseAnswer(
    question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion,
    raw: JsonRecord
  ): DecisionAnswer {
    if (question.type === "NOUL") return this.parseNoul(question, raw);
    if (question.type === "CHOICE") return this.parseChoice(question, raw);
    return this.parseScore(question, raw);
  }

  private parseNoul(question: NoulQuestion, raw: JsonRecord): NoulAnswer {
    const probability = raw.noul;
    if (!this.validProbability(probability)) {
      return this.invalidAnswer(question, "INVALID_PROBABILITY", "CLM NOUL probability is invalid.");
    }

    const confidence = this.readConfidence(raw);
    return {
      questionId: question.id,
      type: "NOUL",
      value: probability >= (question.threshold ?? 0.5),
      probabilityTrue: probability,
      confidence,
      reasoning: "CLM candidate-relative NOUL decision.",
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: probability,
        epistemicConfidence: confidence,
        calibrationStatus: "UNCALIBRATED",
        confidenceSource: confidence > 0 ? "MODEL" : "NONE",
        probabilitySemantics: "CANDIDATE_RELATIVE",
      },
    };
  }

  private parseChoice(question: ChoiceQuestion<any>, raw: JsonRecord): ChoiceAnswer<any> {
    const selected = raw.choice;
    const probabilities = raw.probabilities;
    if (typeof selected !== "string" || !question.options.includes(selected)) {
      return this.invalidAnswer(question, "INVALID_ENUM", "CLM selected an undeclared option.");
    }
    if (!probabilities || typeof probabilities !== "object" || Array.isArray(probabilities)) {
      return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM choice probabilities are missing.");
    }

    const typed: Record<string, number> = {};
    let sum = 0;
    for (const option of question.options) {
      const probability = (probabilities as Record<string, unknown>)[option];
      if (!this.validProbability(probability)) {
        return this.invalidAnswer(question, "INVALID_DISTRIBUTION", `CLM probability is invalid for '${option}'.`);
      }
      typed[option] = probability;
      sum += probability;
    }

    for (const key of Object.keys(probabilities as Record<string, unknown>)) {
      if (!question.options.includes(key)) {
        return this.invalidAnswer(question, "INVALID_DISTRIBUTION", `CLM returned undeclared option '${key}'.`);
      }
    }

    if (Math.abs(sum - 1) > 0.01) {
      return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM probabilities do not normalize.");
    }

    const confidence = this.readConfidence(raw);
    return {
      questionId: question.id,
      type: "CHOICE",
      selected: selected as any,
      probabilities: typed as Record<any, number>,
      confidence,
      reasoning: "CLM candidate-relative choice ranking.",
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: typed[selected],
        epistemicConfidence: confidence,
        calibrationStatus: "UNCALIBRATED",
        confidenceSource: confidence > 0 ? "MODEL" : "NONE",
        probabilitySemantics: "CANDIDATE_RELATIVE",
      },
    };
  }

  private parseScore(question: ScoreQuestion, raw: JsonRecord): ScoreAnswer {
    const probabilities = raw.probabilities;
    if (!probabilities || typeof probabilities !== "object" || Array.isArray(probabilities)) {
      return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM score probabilities are missing.");
    }

    const mapped: Record<number, number> = {};
    let sum = 0;
    let bestLevel = -1;
    let bestProbability = -1;

    for (const rubric of question.rubric) {
      const keyByLevel = String(rubric.level);
      const keyByIndex = String(question.rubric.indexOf(rubric));
      const candidate = (probabilities as Record<string, unknown>)[keyByLevel]
        ?? (probabilities as Record<string, unknown>)[keyByIndex];

      if (!this.validProbability(candidate)) {
        return this.invalidAnswer(question, "INVALID_DISTRIBUTION", `CLM probability missing for rubric level ${rubric.level}.`);
      }

      mapped[rubric.level] = candidate;
      sum += candidate;
      if (candidate > bestProbability) {
        bestProbability = candidate;
        bestLevel = rubric.level;
      }
    }

    if (Math.abs(sum - 1) > 0.01 || bestLevel < 0) {
      return this.invalidAnswer(question, "INVALID_DISTRIBUTION", "CLM score probabilities do not normalize.");
    }

    const confidence = this.readConfidence(raw);
    const maxLevel = Math.max(...question.rubric.map((item) => item.level), 1);

    return {
      questionId: question.id,
      type: "SCORE",
      selectedLevel: bestLevel,
      selectedLabel: question.rubric.find((item) => item.level === bestLevel)?.label ?? "UNRESOLVED",
      score: bestLevel / maxLevel,
      distribution: mapped,
      confidence,
      reasoning: "CLM candidate-relative rubric ranking.",
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: bestProbability,
        epistemicConfidence: confidence,
        calibrationStatus: "UNCALIBRATED",
        confidenceSource: confidence > 0 ? "MODEL" : "NONE",
        probabilitySemantics: "CANDIDATE_RELATIVE",
      },
    };
  }

  private readConfidence(raw: JsonRecord): number {
    return this.validProbability(raw.confidence) ? Number(raw.confidence) : 0;
  }

  private validProbability(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
  }

  private toCLMQuestion(question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion): JsonRecord {
    if (question.type === "NOUL") {
      return {
        type: "noul",
        instructions: question.question,
        criteria: { true: "true", false: "false" },
      };
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

  private invalidAnswer(
    question: NoulQuestion,
    code: DecisionValidationErrorCode,
    reason: string
  ): NoulAnswer;
  private invalidAnswer(
    question: ChoiceQuestion<any>,
    code: DecisionValidationErrorCode,
    reason: string
  ): ChoiceAnswer<any>;
  private invalidAnswer(
    question: ScoreQuestion,
    code: DecisionValidationErrorCode,
    reason: string
  ): ScoreAnswer;
  private invalidAnswer(
    question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion,
    code: DecisionValidationErrorCode,
    reason: string
  ): DecisionAnswer;
  private invalidAnswer(
    question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion,
    code: DecisionValidationErrorCode,
    reason: string
  ): DecisionAnswer {
    if (question.type === "NOUL") {
      return {
        questionId: question.id,
        type: "NOUL",
        value: false,
        probabilityTrue: 0,
        confidence: 0,
        reasoning: `VALIDATION_FAILURE: ${reason}`,
        isDeterministic: false,
        status: "INVALID",
        validationErrorCode: code,
        uncertainty: {
          modelProbability: 0,
          epistemicConfidence: 0,
          calibrationStatus: "UNKNOWN",
          confidenceSource: "NONE",
          probabilitySemantics: "UNKNOWN",
          uncertaintyReason: reason,
        },
      };
    }

    if (question.type === "CHOICE") {
      return {
        questionId: question.id,
        type: "CHOICE",
        selected: "" as any,
        probabilities: Object.fromEntries(question.options.map((option) => [option, 0])) as Record<any, number>,
        confidence: 0,
        reasoning: `VALIDATION_FAILURE: ${reason}`,
        isDeterministic: false,
        status: "INVALID",
        validationErrorCode: code,
        uncertainty: {
          epistemicConfidence: 0,
          calibrationStatus: "UNKNOWN",
          confidenceSource: "NONE",
          probabilitySemantics: "UNKNOWN",
          uncertaintyReason: reason,
        },
      };
    }

    return {
      questionId: question.id,
      type: "SCORE",
      selectedLevel: -1,
      selectedLabel: "UNRESOLVED",
      score: 0,
      distribution: Object.fromEntries(question.rubric.map((item) => [item.level, 0])),
      confidence: 0,
      reasoning: `VALIDATION_FAILURE: ${reason}`,
      isDeterministic: false,
      status: "INVALID",
      validationErrorCode: code,
      uncertainty: {
        epistemicConfidence: 0,
        calibrationStatus: "UNKNOWN",
        confidenceSource: "NONE",
        probabilitySemantics: "UNKNOWN",
        uncertaintyReason: reason,
      },
    };
  }

  private unresolvedBatch(
    request: DecisionBatchRequest,
    latencyMs: number,
    code: DecisionValidationErrorCode,
    reason: string
  ): DecisionBatchResult {
    const answers = request.questions.map((question) => this.invalidAnswer(question, code, reason));
    const answersById: Record<string, DecisionAnswer> = Object.fromEntries(
      answers.map((answer) => [answer.questionId, answer])
    );
    const adapterMetadata: AdapterMetadata = {
      adapterType: "CLM_SHADOW",
      implementationVersion: "2.0.0",
      isProductionAuthority: false,
      isTrainingEligible: false,
      authorityClass: "SHADOW_ONLY",
      modelRef: this.config.model,
      probabilitySemantics: "UNKNOWN",
      capabilityClass: "FAST_DECISION",
    };

    return {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers,
      answersById,
      adapterUsed: "CLM_SHADOW",
      totalLatencyMs: latencyMs,
      minConfidence: 0,
      shouldEscalate: true,
      status: "UNRESOLVED",
      adapterMetadata,
    };
  }
}
