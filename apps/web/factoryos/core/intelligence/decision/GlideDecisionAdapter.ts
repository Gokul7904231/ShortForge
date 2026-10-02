/**
 * ShortForge / FactoryOS — Fastino GLiDE Decision Adapter
 *
 * GLiDE is used as an external Fast Decision Core candidate.
 * This adapter is deliberately fail-closed and shadow/advisory by default.
 *
 * IMPORTANT:
 * - GLiDE may select among caller-declared options.
 * - It cannot authorize capabilities, mint leases, execute jobs, certify F07,
 *   or override ComputePolicy / Guardian.
 * - Confidence is the model's decision confidence. ShortForge must calibrate
 *   action thresholds on representative worker-routing outcomes before promotion.
 */

import { createHash } from "node:crypto";
import type {
  AdapterMetadata,
  ChoiceAnswer,
  ChoiceQuestion,
  DecisionAnswer,
  DecisionBatchRequest,
  DecisionBatchResult,
  DecisionProbabilitySemantics,
  DecisionValidationErrorCode,
  IDecisionAdapter,
  NoulAnswer,
  NoulQuestion,
  ScoreAnswer,
  ScoreQuestion,
} from "./DecisionContracts";

type JsonRecord = Record<string, unknown>;

export interface GlideDecisionAdapterConfig {
  readonly baseUrl: string;
  readonly allowedOrigins: readonly string[];
  readonly apiKey?: string;
  readonly model: string;
  /**
   * ShortForge intentionally uses a much tighter timeout than Fastino's
   * general 300s HTTP example. Worker selection is latency-sensitive.
   */
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly maxQuestions: number;
  readonly maxCandidates: number;
  readonly enabled: boolean;
}

export interface GlideCandidateSetMetadata {
  readonly probabilitySemantics: DecisionProbabilitySemantics;
  readonly candidateFingerprint: string;
}

interface GlideResponse {
  readonly model?: string;
  readonly answers?: Record<string, JsonRecord>;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly token_usage?: number;
  };
}

export class GlideDecisionAdapter implements IDecisionAdapter {
  public readonly adapterName = "GLIDE_SHADOW";

  private readonly config: GlideDecisionAdapterConfig;

  public constructor(config: Partial<GlideDecisionAdapterConfig> = {}) {
    const baseUrl = (config.baseUrl ?? process.env.FASTINO_GLIDE_BASE_URL ?? "https://api.fastino.ai").replace(/\/$/, "");

    this.config = {
      baseUrl,
      allowedOrigins:
        config.allowedOrigins ??
        this.parseOrigins(process.env.FASTINO_GLIDE_ALLOWED_ORIGINS, ["https://api.fastino.ai"]),
      apiKey: config.apiKey ?? process.env.FASTINO_API_KEY,
      model: config.model ?? process.env.FASTINO_GLIDE_MODEL ?? "fastino/GLiDE",
      timeoutMs: Math.max(250, Math.min(config.timeoutMs ?? 5000, 15000)),
      maxRetries: Math.max(0, Math.min(config.maxRetries ?? 2, 3)),
      retryDelayMs: Math.max(0, Math.min(config.retryDelayMs ?? 100, 5000)),
      maxQuestions: Math.max(1, Math.min(config.maxQuestions ?? 32, 64)),
      maxCandidates: Math.max(2, Math.min(config.maxCandidates ?? 255, 255)),
      enabled: config.enabled ?? process.env.FASTINO_GLIDE_ENABLED === "true",
    };
  }

  public async evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult> {
    const startedAt = Date.now();

    if (!this.config.enabled) {
      return this.unresolvedBatch(
        request,
        Date.now() - startedAt,
        "ADAPTER_UNAVAILABLE",
        "GLiDE adapter is disabled by policy.",
      );
    }

    if (!this.config.apiKey) {
      return this.unresolvedBatch(
        request,
        Date.now() - startedAt,
        "AUTHENTICATION_FAILED",
        "FASTINO_API_KEY is not configured.",
      );
    }

    if (request.questions.length === 0 || request.questions.length > this.config.maxQuestions) {
      return this.unresolvedBatch(
        request,
        Date.now() - startedAt,
        "MISSING_FIELD",
        `GLiDE question count must be between 1 and ${this.config.maxQuestions}.`,
      );
    }

    const sharedState = request.sharedContext ?? {};
    if (!this.hasMaterialState(sharedState)) {
      return this.unresolvedBatch(
        request,
        Date.now() - startedAt,
        "MISSING_FIELD",
        "GLiDE requires a non-empty state.",
      );
    }

    for (const question of request.questions) {
      const candidateCount =
        question.type === "CHOICE"
          ? question.options.length
          : question.type === "SCORE"
            ? question.rubric.length
            : 2;

      if (candidateCount > this.config.maxCandidates) {
        return this.unresolvedBatch(
          request,
          Date.now() - startedAt,
          "INVALID_ENUM",
          `GLiDE candidate count exceeds configured safety limit of ${this.config.maxCandidates}.`,
        );
      }
    }

    try {
      const endpoint = this.buildEndpoint();
      const payload = await this.requestWithRetry(endpoint, request);
      return this.parseResponse(request, payload, Date.now() - startedAt);
    } catch (error: unknown) {
      const code: DecisionValidationErrorCode =
        error instanceof GlideTimeoutError
          ? "ADAPTER_TIMEOUT"
          : error instanceof GlideHttpError && (error.status === 401 || error.status === 403)
            ? "AUTHENTICATION_FAILED"
            : "ADAPTER_UNAVAILABLE";

      return this.unresolvedBatch(
        request,
        Date.now() - startedAt,
        code,
        error instanceof Error ? error.message : "GLiDE request failed.",
      );
    }
  }

  public getCandidateSetMetadata(request: DecisionBatchRequest): GlideCandidateSetMetadata {
    const canonical = request.questions.map((question) => ({
      id: question.id,
      type: question.type,
      candidates:
        question.type === "CHOICE"
          ? [...question.options]
          : question.type === "SCORE"
            ? question.rubric.map((item) => ({
                level: item.level,
                label: item.label,
              }))
            : ["false", "true"],
    }));

    const probabilitySemantics =
      request.questions.length > 0 &&
      request.questions.every((question) => question.type !== "NOUL")
        ? "CANDIDATE_RELATIVE"
        : request.questions.every((question) => question.type === "NOUL")
          ? "ABSOLUTE"
          : "UNKNOWN";

    return {
      probabilitySemantics,
      candidateFingerprint: createHash("sha256")
        .update(JSON.stringify(canonical), "utf8")
        .digest("hex"),
    };
  }

  private async requestWithRetry(
    endpoint: string,
    request: DecisionBatchRequest,
  ): Promise<GlideResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": this.config.apiKey!,
            },
            body: JSON.stringify({
              model: this.config.model,
              state: request.sharedContext,
              questions: Object.fromEntries(
                request.questions.map((question) => [
                  question.id,
                  this.toGlideQuestion(question),
                ]),
              ),
            }),
            signal: controller.signal,
          });

          if (response.ok) {
            const payload = (await response.json()) as GlideResponse;
            return payload;
          }

          const retryAfterMs = this.readRetryAfterMs(response.headers.get("Retry-After"));

          if (!this.isRetryableStatus(response.status) || attempt >= this.config.maxRetries) {
            const detail = await response.text().catch(() => "");
            throw new GlideHttpError(
              response.status,
              `GLiDE HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
            );
          }

          await this.sleep(retryAfterMs ?? this.config.retryDelayMs * Math.max(1, attempt + 1));
        } finally {
          clearTimeout(timeout);
        }
      } catch (error: unknown) {
        if (error instanceof GlideHttpError) throw error;

        if (error instanceof Error && error.name === "AbortError") {
          lastError = new GlideTimeoutError("GLiDE request timed out.");
        } else {
          lastError = error instanceof Error ? error : new Error("GLiDE request failed.");
        }

        if (attempt >= this.config.maxRetries) {
          throw lastError;
        }

        await this.sleep(this.config.retryDelayMs * Math.max(1, attempt + 1));
      }
    }

    throw lastError ?? new Error("GLiDE request failed.");
  }

  private isRetryableStatus(status: number): boolean {
    return status === 425 || status === 429 || status === 503;
  }

  private readRetryAfterMs(value: string | null): number | undefined {
    if (!value) return undefined;

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 5000);
    }

    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return undefined;

    return Math.min(Math.max(0, timestamp - Date.now()), 5000);
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private buildEndpoint(): string {
    const parsed = new URL(this.config.baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("GLiDE base URL must use HTTP(S).");
    }

    const allowed = this.config.allowedOrigins.map((origin) => new URL(origin).origin);
    if (allowed.length === 0 || !allowed.includes(parsed.origin)) {
      throw new Error("GLiDE base origin is not explicitly allowlisted.");
    }

    return new URL("/v1/systemone", parsed.origin).toString();
  }

  private toGlideQuestion(
    question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion,
  ): JsonRecord {
    if (question.type === "NOUL") {
      return {
        type: "noul",
        instructions: question.question,
        criteria: {
          true: "true",
          false: "false",
        },
      };
    }

    if (question.type === "CHOICE") {
      return {
        type: "choice",
        instructions: question.question,
        criteria: Object.fromEntries(
          question.options.map((option) => [option, option]),
        ),
      };
    }

    return {
      type: "score",
      instructions: question.question,
      criteria: question.rubric.map(
        (level) => level.description || level.label,
      ),
    };
  }

  private parseResponse(
    request: DecisionBatchRequest,
    payload: GlideResponse,
    latencyMs: number,
  ): DecisionBatchResult {
    if (!payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
      return this.unresolvedBatch(
        request,
        latencyMs,
        "INVALID_MODEL_RESPONSE",
        "GLiDE response did not contain a valid answers object.",
      );
    }

    const answers: DecisionAnswer[] = [];
    const answersById: Record<string, DecisionAnswer> = {};
    let invalid = false;

    for (const question of request.questions) {
      const raw = payload.answers[question.id];
      const answer =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? this.parseAnswer(question, raw)
          : this.invalidAnswer(
              question,
              "MISSING_QUESTION",
              `GLiDE omitted question ${question.id}.`,
            );

      answers.push(answer);
      answersById[question.id] = answer;
      if (answer.status !== "VALID") invalid = true;
    }

    const minConfidence = answers.length
      ? Math.min(...answers.map((answer) => answer.confidence))
      : 0;

    const candidateMetadata = this.getCandidateSetMetadata(request);

    const adapterMetadata: AdapterMetadata = {
      adapterType: "GLIDE",
      implementationVersion: "1.0.0",
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
      adapterUsed: "GLIDE_SHADOW",
      totalLatencyMs: latencyMs,
      minConfidence,
      shouldEscalate: invalid || minConfidence < 0.70,
      status: invalid ? "UNRESOLVED" : "VALID",
      adapterMetadata,
    };
  }

  private parseAnswer(
    question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion,
    raw: JsonRecord,
  ): DecisionAnswer {
    if (question.type === "NOUL") return this.parseNoul(question, raw);
    if (question.type === "CHOICE") return this.parseChoice(question, raw);
    return this.parseScore(question, raw);
  }

  private parseNoul(question: NoulQuestion, raw: JsonRecord): NoulAnswer {
    const probability = raw.noul;
    if (!this.validProbability(probability)) {
      return this.invalidAnswer(
        question,
        "INVALID_PROBABILITY",
        "GLiDE NOUL probability is invalid.",
      ) as NoulAnswer;
    }

    const derivedConfidence = Math.abs(2 * Number(probability) - 1);
    const suppliedConfidence = raw.confidence;

    if (
      suppliedConfidence !== undefined &&
      (!this.validProbability(suppliedConfidence) ||
        Math.abs(Number(suppliedConfidence) - derivedConfidence) > 0.02)
    ) {
      return this.invalidAnswer(
        question,
        "INVALID_CONFIDENCE",
        "GLiDE NOUL confidence does not match its documented probability-margin formula.",
      ) as NoulAnswer;
    }

    const confidence = derivedConfidence;
    return {
      questionId: question.id,
      type: "NOUL",
      value: Number(probability) >= (question.threshold ?? 0.5),
      probabilityTrue: Number(probability),
      confidence,
      reasoning: "GLiDE structured decision.",
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: Number(probability),
        epistemicConfidence: confidence,
        calibrationStatus: "UNCALIBRATED",
        confidenceSource: "MODEL",
        probabilitySemantics: "ABSOLUTE",
      },
    };
  }

  private parseChoice(question: ChoiceQuestion<any>, raw: JsonRecord): ChoiceAnswer<any> {
    const selected = raw.choice;
    const probabilities = raw.probabilities;

    if (typeof selected !== "string" || !question.options.includes(selected)) {
      return this.invalidAnswer(
        question,
        "INVALID_ENUM",
        "GLiDE selected an undeclared option.",
      ) as ChoiceAnswer<any>;
    }

    if (!probabilities || typeof probabilities !== "object" || Array.isArray(probabilities)) {
      return this.invalidAnswer(
        question,
        "INVALID_DISTRIBUTION",
        "GLiDE choice probabilities are missing.",
      ) as ChoiceAnswer<any>;
    }

    const typed: Record<string, number> = {};
    for (const option of question.options) {
      const probability = (probabilities as Record<string, unknown>)[option];
      if (!this.validProbability(probability)) {
        return this.invalidAnswer(
          question,
          "INVALID_DISTRIBUTION",
          `GLiDE probability is invalid for '${option}'.`,
        ) as ChoiceAnswer<any>;
      }
      typed[option] = Number(probability);
    }

    for (const key of Object.keys(probabilities as Record<string, unknown>)) {
      if (!question.options.includes(key)) {
        return this.invalidAnswer(
          question,
          "INVALID_DISTRIBUTION",
          `GLiDE returned undeclared option '${key}'.`,
        ) as ChoiceAnswer<any>;
      }
    }

    const sum = Object.values(typed).reduce((acc, value) => acc + value, 0);
    if (Math.abs(sum - 1) > 0.02) {
      return this.invalidAnswer(
        question,
        "INVALID_DISTRIBUTION",
        `GLiDE probabilities do not normalize (sum=${sum.toFixed(6)}).`,
      ) as ChoiceAnswer<any>;
    }

    const maxProbability = Math.max(...Object.values(typed));
    if (typed[selected] + 0.02 < maxProbability) {
      return this.invalidAnswer(
        question,
        "INVALID_ENUM",
        "GLiDE declared a choice that is not the highest-probability option.",
      ) as ChoiceAnswer<any>;
    }

    const confidence = this.derivedChoiceConfidence(Object.values(typed));
    if (
      raw.confidence !== undefined &&
      (!this.validProbability(raw.confidence) ||
        Math.abs(Number(raw.confidence) - confidence) > 0.02)
    ) {
      return this.invalidAnswer(
        question,
        "INVALID_CONFIDENCE",
        "GLiDE choice confidence does not match its top1-top2 margin.",
      ) as ChoiceAnswer<any>;
    }

    return {
      questionId: question.id,
      type: "CHOICE",
      selected: selected as any,
      probabilities: typed as Record<any, number>,
      confidence,
      reasoning: "GLiDE candidate-relative choice.",
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: typed[selected],
        epistemicConfidence: confidence,
        calibrationStatus: "UNCALIBRATED",
        confidenceSource: "MODEL",
        probabilitySemantics: "CANDIDATE_RELATIVE",
      },
    };
  }

  private parseScore(question: ScoreQuestion, raw: JsonRecord): ScoreAnswer {
    const probabilities = raw.probabilities;
    if (!probabilities || typeof probabilities !== "object" || Array.isArray(probabilities)) {
      return this.invalidAnswer(
        question,
        "INVALID_DISTRIBUTION",
        "GLiDE score probabilities are missing.",
      ) as ScoreAnswer;
    }

    const mapped: Record<number, number> = {};
    let bestIndex = -1;
    let bestProbability = -1;

    for (let index = 0; index < question.rubric.length; index += 1) {
      const candidate = (probabilities as Record<string, unknown>)[String(index)];
      if (!this.validProbability(candidate)) {
        return this.invalidAnswer(
          question,
          "INVALID_DISTRIBUTION",
          `GLiDE probability missing for score index ${index}.`,
        ) as ScoreAnswer;
      }

      mapped[index] = Number(candidate);
      if (Number(candidate) > bestProbability) {
        bestProbability = Number(candidate);
        bestIndex = index;
      }
    }

    for (const key of Object.keys(probabilities as Record<string, unknown>)) {
      if (!/^[0-9]+$/.test(key) || Number(key) >= question.rubric.length) {
        return this.invalidAnswer(
          question,
          "INVALID_DISTRIBUTION",
          `GLiDE returned an invalid score level key '${key}'.`,
        ) as ScoreAnswer;
      }
    }

    const sum = Object.values(mapped).reduce((acc, value) => acc + value, 0);
    if (Math.abs(sum - 1) > 0.02 || bestIndex < 0) {
      return this.invalidAnswer(
        question,
        "INVALID_DISTRIBUTION",
        `GLiDE score probabilities do not normalize (sum=${sum.toFixed(6)}).`,
      ) as ScoreAnswer;
    }

    const confidence = this.derivedChoiceConfidence(Object.values(mapped));
    if (
      raw.confidence !== undefined &&
      (!this.validProbability(raw.confidence) ||
        Math.abs(Number(raw.confidence) - confidence) > 0.02)
    ) {
      return this.invalidAnswer(
        question,
        "INVALID_CONFIDENCE",
        "GLiDE score confidence does not match its top1-top2 margin.",
      ) as ScoreAnswer;
    }

    if (
      raw.score !== undefined &&
      (!Number.isInteger(raw.score) ||
        Number(raw.score) < 0 ||
        Number(raw.score) >= question.rubric.length ||
        Number(raw.score) !== bestIndex)
    ) {
      return this.invalidAnswer(
        question,
        "INVALID_ENUM",
        "GLiDE score index does not match the highest-probability rubric level.",
      ) as ScoreAnswer;
    }

    const rubric = question.rubric[bestIndex];
    const expectedLevel = raw.expected_level;
    const weightedScore =
      this.validProbabilityOrFiniteNumber(expectedLevel)
        ? Number(expectedLevel)
        : Object.entries(mapped).reduce((sumValue, [index, probability]) => {
            return sumValue + Number(index) * probability;
          }, 0);

    if (
      weightedScore < 0 ||
      weightedScore > Math.max(0, question.rubric.length - 1)
    ) {
      return this.invalidAnswer(
        question,
        "INVALID_PROBABILITY",
        "GLiDE expected_level is outside the declared score range.",
      ) as ScoreAnswer;
    }

    const normalizedScore =
      question.rubric.length > 1 ? weightedScore / (question.rubric.length - 1) : 0;

    return {
      questionId: question.id,
      type: "SCORE",
      selectedLevel: rubric.level,
      selectedLabel: rubric.label,
      score: Math.max(0, Math.min(1, normalizedScore)),
      distribution: mapped,
      confidence,
      reasoning: "GLiDE ordered-score decision.",
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: bestProbability,
        epistemicConfidence: confidence,
        calibrationStatus: "UNCALIBRATED",
        confidenceSource: "MODEL",
        probabilitySemantics: "CANDIDATE_RELATIVE",
      },
    };
  }

  private derivedChoiceConfidence(probabilities: number[]): number {
    const sorted = [...probabilities].sort((a, b) => b - a);
    return Math.max(0, Math.min(1, (sorted[0] ?? 0) - (sorted[1] ?? 0)));
  }

  private validProbability(value: unknown): value is number {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1
    );
  }

  private validProbabilityOrFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  private hasMaterialState(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as object).length > 0;
    return true;
  }

  private invalidAnswer(
    question: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion,
    code: DecisionValidationErrorCode,
    reason: string,
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
        probabilities: Object.fromEntries(
          question.options.map((option) => [option, 0]),
        ) as Record<any, number>,
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
      distribution: Object.fromEntries(
        question.rubric.map((item, index) => [index, 0]),
      ),
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
    reason: string,
  ): DecisionBatchResult {
    const answers = request.questions.map((question) =>
      this.invalidAnswer(question, code, reason),
    );

    const answersById: Record<string, DecisionAnswer> = Object.fromEntries(
      answers.map((answer) => [answer.questionId, answer]),
    );

    return {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers,
      answersById,
      adapterUsed: "GLIDE_SHADOW",
      totalLatencyMs: latencyMs,
      minConfidence: 0,
      shouldEscalate: true,
      status: "UNRESOLVED",
      adapterMetadata: {
        adapterType: "GLIDE",
        implementationVersion: "1.0.0",
        isProductionAuthority: false,
        isTrainingEligible: false,
        authorityClass: "SHADOW_ONLY",
        modelRef: this.config.model,
        probabilitySemantics: "UNKNOWN",
        capabilityClass: "FAST_DECISION",
      },
    };
  }

  private parseOrigins(
    raw: string | undefined,
    fallback: readonly string[],
  ): readonly string[] {
    if (!raw) return fallback;
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
}

class GlideTimeoutError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GlideTimeoutError";
  }
}

class GlideHttpError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = "GlideHttpError";
    this.status = status;
  }
}
