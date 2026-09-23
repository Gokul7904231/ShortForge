/**
 * ShortForge / FactoryOS — LLM Decision Adapter (Remediated for Project Ascalon)
 *
 * Implements strict, verifiable typed decision evaluation via AIRuntime.
 * Strictly eliminates synthetic fallbacks:
 * - NO default confidence values (e.g. 0.85)
 * - NO synthetic choice probability distributions (e.g. 0.8/0.2)
 * - NO automatic selection of first declared option (q.options[0])
 * - NO automatic selection of first rubric level (q.rubric[0])
 * - Rejects malformed outputs with explicit validation error codes.
 */

import { AIRuntime } from "../../../../ai/runtime";
import {
  DecisionBatchRequest,
  DecisionBatchResult,
  DecisionAnswer,
  IDecisionAdapter,
  NoulQuestion,
  ChoiceQuestion,
  ScoreQuestion,
  NoulAnswer,
  ChoiceAnswer,
  ScoreAnswer,
  DecisionStatus,
  DecisionValidationErrorCode,
} from "./DecisionContracts";

export class LLMDecisionAdapter implements IDecisionAdapter {
  readonly adapterName = "LLM";

  public async evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult> {
    const t0 = Date.now();
    const prompt = this.buildPrompt(request);

    try {
      const response = await AIRuntime.execute(
        "CLASSIFICATION",
        "v1",
        {
          prompt,
          system:
            "You are the FactoryOS Decision Intelligence Kernel. Answer all typed questions in the batch with strict JSON matching the requested schema. You must provide exact probability distributions for all declared options. Do not omit any option.",
          temperature: 0.1,
        },
        {
          contextHash: request.contextFingerprint,
          subtask: "decision_batch",
        }
      );

      const parsedAnswers = this.parseAndValidate(response, request.questions);
      const confidences = parsedAnswers.map((a) => a.confidence).filter((c) => !isNaN(c));
      const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 0.0;

      const answersById: Record<string, DecisionAnswer> = {};
      let hasInvalid = false;

      for (const ans of parsedAnswers) {
        answersById[ans.questionId] = ans;
        if (ans.status === "INVALID" || ans.status === "UNRESOLVED") {
          hasInvalid = true;
        }
      }

      const overallStatus: DecisionStatus = hasInvalid ? "UNRESOLVED" : "VALID";

      return {
        batchId: request.batchId,
        evaluatedAt: new Date().toISOString(),
        answers: parsedAnswers,
        answersById,
        adapterUsed: "LLM",
        totalLatencyMs: Date.now() - t0,
        minConfidence,
        shouldEscalate: minConfidence < 0.7 || hasInvalid,
        status: overallStatus,
        adapterMetadata: {
          adapterType: "LLM",
          implementationVersion: "2.0.0",
          isProductionAuthority: true,
          isTrainingEligible: !hasInvalid,
        },
      };
    } catch (err: any) {
      return this.generateUnresolvedBatch(request, Date.now() - t0, "INVALID_JSON", err.message);
    }
  }

  private buildPrompt(request: DecisionBatchRequest): string {
    const questionsSummary = request.questions.map((q) => {
      if (q.type === "NOUL") {
        return {
          id: q.id,
          type: "NOUL",
          question: q.question,
          threshold: q.threshold ?? 0.5,
        };
      } else if (q.type === "CHOICE") {
        return {
          id: q.id,
          type: "CHOICE",
          question: q.question,
          options: q.options,
        };
      } else {
        return {
          id: q.id,
          type: "SCORE",
          question: q.question,
          rubric: q.rubric,
        };
      }
    });

    return JSON.stringify({
      instruction: "Evaluate the following decision questions based on the provided context.",
      sharedContext: request.sharedContext || {},
      questions: questionsSummary,
      outputFormat: {
        answers: [
          {
            questionId: "string",
            type: "NOUL | CHOICE | SCORE",
            valueOrSelected: "boolean | string | number",
            probabilitiesOrScore: "number | Record<string, number>",
            confidence: "number in [0.0, 1.0]",
            reasoning: "string",
          },
        ],
      },
    });
  }

  public parseAndValidate(
    rawResponse: unknown,
    questions: readonly (NoulQuestion | ChoiceQuestion<any> | ScoreQuestion)[]
  ): DecisionAnswer[] {
    let data: any = rawResponse;
    if (typeof rawResponse === "string") {
      try {
        data = JSON.parse(rawResponse);
      } catch {
        const match = rawResponse.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            data = JSON.parse(match[0]);
          } catch {
            data = null;
          }
        } else {
          data = null;
        }
      }
    }

    if (!data || typeof data !== "object") {
      return questions.map((q) => this.buildInvalidAnswer(q, "INVALID_JSON", "Failed to parse JSON model output"));
    }

    const answersList: any[] = Array.isArray(data?.answers) ? data.answers : [];
    const answersMap = new Map<string, any>();
    const seenQuestionIds = new Set<string>();
    const duplicateIds = new Set<string>();

    for (const a of answersList) {
      if (a?.questionId) {
        if (seenQuestionIds.has(a.questionId)) {
          duplicateIds.add(a.questionId);
        }
        seenQuestionIds.add(a.questionId);
        answersMap.set(a.questionId, a);
      }
    }

    const validatedAnswers: DecisionAnswer[] = [];

    for (const q of questions) {
      if (duplicateIds.has(q.id)) {
        validatedAnswers.push(
          this.buildInvalidAnswer(q, "DUPLICATE_QUESTION", `Multiple conflicting answers received for question ${q.id}`)
        );
        continue;
      }

      const rawAns = answersMap.get(q.id);
      if (!rawAns) {
        validatedAnswers.push(
          this.buildInvalidAnswer(q, "MISSING_QUESTION", `Model omitted answer for question ${q.id}`)
        );
        continue;
      }

      // Validate Confidence
      const conf = rawAns.confidence;
      if (typeof conf !== "number" || isNaN(conf) || conf < 0.0 || conf > 1.0) {
        validatedAnswers.push(
          this.buildInvalidAnswer(q, "INVALID_CONFIDENCE", `Confidence must be a valid float in [0.0, 1.0], received: ${conf}`)
        );
        continue;
      }

      if (q.type === "NOUL") {
        const val = rawAns.valueOrSelected;
        if (typeof val !== "boolean") {
          validatedAnswers.push(
            this.buildInvalidAnswer(q, "MISSING_FIELD", `NOUL answer must have boolean 'valueOrSelected', received: ${typeof val}`)
          );
          continue;
        }

        const prob = rawAns.probabilitiesOrScore;
        if (typeof prob !== "number" || isNaN(prob) || prob < 0.0 || prob > 1.0) {
          validatedAnswers.push(
            this.buildInvalidAnswer(q, "INVALID_PROBABILITY", `NOUL probabilityTrue must be float in [0.0, 1.0], received: ${prob}`)
          );
          continue;
        }

        validatedAnswers.push({
          questionId: q.id,
          type: "NOUL",
          value: val,
          probabilityTrue: prob,
          confidence: conf,
          reasoning: typeof rawAns.reasoning === "string" ? rawAns.reasoning : "Model-evaluated binary assertion",
          isDeterministic: false,
          status: "VALID",
          uncertainty: {
            modelProbability: prob,
            epistemicConfidence: conf,
            calibrationStatus: "UNCALIBRATED",
          },
        });
      } else if (q.type === "CHOICE") {
        const selected = rawAns.valueOrSelected;
        if (typeof selected !== "string" || !q.options.includes(selected)) {
          validatedAnswers.push(
            this.buildInvalidAnswer(
              q,
              "INVALID_ENUM",
              `Selected option '${selected}' is not in declared options: [${q.options.join(", ")}]`
            )
          );
          continue;
        }

        const rawProbs = rawAns.probabilitiesOrScore;
        if (!rawProbs || typeof rawProbs !== "object" || Array.isArray(rawProbs)) {
          validatedAnswers.push(
            this.buildInvalidAnswer(
              q,
              "INVALID_DISTRIBUTION",
              "CHOICE answer requires a probabilities object mapping every option to [0.0, 1.0]"
            )
          );
          continue;
        }

        let sum = 0;
        let distValid = true;
        const typedProbs: Record<string, number> = {};

        for (const opt of q.options) {
          const p = rawProbs[opt];
          if (typeof p !== "number" || isNaN(p) || p < 0.0 || p > 1.0) {
            distValid = false;
            break;
          }
          typedProbs[opt] = p;
          sum += p;
        }

        // Verify all keys in rawProbs are known options
        for (const k of Object.keys(rawProbs)) {
          if (!q.options.includes(k)) {
            distValid = false;
            break;
          }
        }

        if (!distValid || Math.abs(sum - 1.0) > 0.05) {
          validatedAnswers.push(
            this.buildInvalidAnswer(
              q,
              "INVALID_DISTRIBUTION",
              `Probability distribution must cover all declared options and sum to ~1.0. Sum: ${sum.toFixed(3)}`
            )
          );
          continue;
        }

        validatedAnswers.push({
          questionId: q.id,
          type: "CHOICE",
          selected,
          probabilities: typedProbs,
          confidence: conf,
          reasoning: typeof rawAns.reasoning === "string" ? rawAns.reasoning : `Model selected '${selected}'`,
          isDeterministic: false,
          status: "VALID",
          uncertainty: {
            modelProbability: typedProbs[selected],
            epistemicConfidence: conf,
            calibrationStatus: "UNCALIBRATED",
          },
        });
      } else if (q.type === "SCORE") {
        const levelVal = rawAns.valueOrSelected;
        const matchedRubric = q.rubric.find((r) => r.level === levelVal);

        if (typeof levelVal !== "number" || !matchedRubric) {
          validatedAnswers.push(
            this.buildInvalidAnswer(
              q,
              "INVALID_RUBRIC_LEVEL",
              `Level '${levelVal}' not found in declared rubric: [${q.rubric.map((r) => r.level).join(", ")}]`
            )
          );
          continue;
        }

        const maxLevel = Math.max(...q.rubric.map((r) => r.level));
        const normalizedScore = maxLevel > 0 ? matchedRubric.level / maxLevel : 0.0;

        // Verify distribution if provided
        const rawDist = rawAns.probabilitiesOrScore;
        const dist: Record<number, number> = {};
        if (rawDist && typeof rawDist === "object") {
          for (const r of q.rubric) {
            const p = rawDist[r.level];
            dist[r.level] = typeof p === "number" && !isNaN(p) && p >= 0 ? p : 0;
          }
        }

        validatedAnswers.push({
          questionId: q.id,
          type: "SCORE",
          selectedLevel: matchedRubric.level,
          selectedLabel: matchedRubric.label,
          score: normalizedScore,
          distribution: dist,
          confidence: conf,
          reasoning: typeof rawAns.reasoning === "string" ? rawAns.reasoning : `Model evaluated level ${matchedRubric.level}`,
          isDeterministic: false,
          status: "VALID",
          uncertainty: {
            modelProbability: dist[matchedRubric.level] ?? normalizedScore,
            epistemicConfidence: conf,
            calibrationStatus: "UNCALIBRATED",
          },
        });
      }
    }

    return validatedAnswers;
  }

  private buildInvalidAnswer(
    q: NoulQuestion | ChoiceQuestion<any> | ScoreQuestion,
    code: DecisionValidationErrorCode,
    reason: string
  ): DecisionAnswer {
    if (q.type === "NOUL") {
      const ans: NoulAnswer = {
        questionId: q.id,
        type: "NOUL",
        value: false,
        probabilityTrue: 0.0,
        confidence: 0.0,
        reasoning: `VALIDATION_FAILURE: ${reason}`,
        isDeterministic: false,
        status: "INVALID",
        validationErrorCode: code,
        uncertainty: {
          modelProbability: 0.0,
          epistemicConfidence: 0.0,
          calibrationStatus: "UNKNOWN",
          uncertaintyReason: reason,
        },
      };
      return ans;
    } else if (q.type === "CHOICE") {
      const probs: Record<string, number> = {};
      for (const opt of q.options) probs[opt] = 0.0;

      const ans: ChoiceAnswer = {
        questionId: q.id,
        type: "CHOICE",
        selected: "" as any,
        probabilities: probs,
        confidence: 0.0,
        reasoning: `VALIDATION_FAILURE: ${reason}`,
        isDeterministic: false,
        status: "INVALID",
        validationErrorCode: code,
        uncertainty: {
          modelProbability: 0.0,
          epistemicConfidence: 0.0,
          calibrationStatus: "UNKNOWN",
          uncertaintyReason: reason,
        },
      };
      return ans;
    } else {
      const dist: Record<number, number> = {};
      for (const r of q.rubric) dist[r.level] = 0.0;

      const ans: ScoreAnswer = {
        questionId: q.id,
        type: "SCORE",
        selectedLevel: -1,
        selectedLabel: "UNRESOLVED",
        score: 0.0,
        distribution: dist,
        confidence: 0.0,
        reasoning: `VALIDATION_FAILURE: ${reason}`,
        isDeterministic: false,
        status: "INVALID",
        validationErrorCode: code,
        uncertainty: {
          modelProbability: 0.0,
          epistemicConfidence: 0.0,
          calibrationStatus: "UNKNOWN",
          uncertaintyReason: reason,
        },
      };
      return ans;
    }
  }

  private generateUnresolvedBatch(
    request: DecisionBatchRequest,
    latencyMs: number,
    code: DecisionValidationErrorCode,
    errorMsg: string
  ): DecisionBatchResult {
    const answers: DecisionAnswer[] = request.questions.map((q) =>
      this.buildInvalidAnswer(q, code, errorMsg)
    );
    const answersById: Record<string, DecisionAnswer> = {};
    for (const a of answers) {
      answersById[a.questionId] = a;
    }

    return {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers,
      answersById,
      adapterUsed: "LLM",
      totalLatencyMs: latencyMs,
      minConfidence: 0.0,
      shouldEscalate: true,
      status: "UNRESOLVED",
      adapterMetadata: {
        adapterType: "LLM",
        implementationVersion: "2.0.0",
        isProductionAuthority: true,
        isTrainingEligible: false,
      },
    };
  }
}
