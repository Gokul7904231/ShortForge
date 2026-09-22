/**
 * ShortForge / FactoryOS — LLM Decision Adapter
 *
 * Implements structured multi-decision evaluation via AIRuntime.
 * Employs strict JSON parsing, declared option validation, and TokenEconomy tracking.
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
} from "./DecisionContracts";

export class LLMDecisionAdapter implements IDecisionAdapter {
  readonly adapterName = "LLM";

  public async evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult> {
    const t0 = Date.now();

    // Construct structured prompt specifying exact typed output requirements
    const prompt = this.buildPrompt(request);

    try {
      const response = await AIRuntime.execute(
        "CLASSIFICATION", // Canonical decision classification capability
        "v1",
        {
          prompt,
          system:
            "You are the FactoryOS Decision Intelligence Kernel. Answer all typed questions in the batch with strict JSON matching the requested schema. Separate probability distribution from confidence.",
          temperature: 0.1,
        },
        {
          contextHash: request.contextFingerprint,
          subtask: "decision_batch",
        }
      );

      const parsedAnswers = this.parseAndValidate(response, request.questions);
      const confidences = parsedAnswers.map((a) => a.confidence);
      const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 0.8;

      const answersById: Record<string, DecisionAnswer> = {};
      for (const ans of parsedAnswers) {
        answersById[ans.questionId] = ans;
      }

      return {
        batchId: request.batchId,
        evaluatedAt: new Date().toISOString(),
        answers: parsedAnswers,
        answersById,
        adapterUsed: "LLM",
        totalLatencyMs: Date.now() - t0,
        minConfidence,
        shouldEscalate: minConfidence < 0.7,
      };
    } catch (err: any) {
      // Fallback if LLM execution fails
      return this.generateFallbackBatch(request, Date.now() - t0, err.message);
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

  private parseAndValidate(
    rawResponse: unknown,
    questions: readonly (NoulQuestion | ChoiceQuestion<any> | ScoreQuestion)[]
  ): DecisionAnswer[] {
    let data: any = rawResponse;
    if (typeof rawResponse === "string") {
      try {
        data = JSON.parse(rawResponse);
      } catch {
        // Find JSON block
        const match = rawResponse.match(/\{[\s\S]*\}/);
        if (match) data = JSON.parse(match[0]);
      }
    }

    const answersList: any[] = Array.isArray(data?.answers) ? data.answers : [];
    const answersMap = new Map<string, any>();
    for (const a of answersList) {
      if (a?.questionId) answersMap.set(a.questionId, a);
    }

    const validatedAnswers: DecisionAnswer[] = [];

    for (const q of questions) {
      const rawAns = answersMap.get(q.id);

      if (q.type === "NOUL") {
        const val = typeof rawAns?.valueOrSelected === "boolean" ? rawAns.valueOrSelected : false;
        const prob = typeof rawAns?.probabilitiesOrScore === "number" ? rawAns.probabilitiesOrScore : val ? 1.0 : 0.0;
        const conf = typeof rawAns?.confidence === "number" ? Math.max(0, Math.min(1, rawAns.confidence)) : 0.85;

        validatedAnswers.push({
          questionId: q.id,
          type: "NOUL",
          value: val,
          probabilityTrue: prob,
          confidence: conf,
          reasoning: rawAns?.reasoning || "LLM evaluated binary assertion",
          isDeterministic: false,
        });
      } else if (q.type === "CHOICE") {
        let selected = rawAns?.valueOrSelected;
        if (!q.options.includes(selected)) {
          selected = q.options[0]; // Fallback to first declared option if hallucinated
        }

        const probs: Record<string, number> = {};
        for (const opt of q.options) {
          probs[opt] = opt === selected ? 0.8 : 0.2 / Math.max(1, q.options.length - 1);
        }

        const conf = typeof rawAns?.confidence === "number" ? Math.max(0, Math.min(1, rawAns.confidence)) : 0.85;

        validatedAnswers.push({
          questionId: q.id,
          type: "CHOICE",
          selected,
          probabilities: probs,
          confidence: conf,
          reasoning: rawAns?.reasoning || `LLM selected '${selected}'`,
          isDeterministic: false,
        });
      } else if (q.type === "SCORE") {
        const levelVal = typeof rawAns?.valueOrSelected === "number" ? rawAns.valueOrSelected : q.rubric[0].level;
        const matchedRubric = q.rubric.find((r) => r.level === levelVal) || q.rubric[0];
        const maxLevel = Math.max(...q.rubric.map((r) => r.level));
        const score = maxLevel > 0 ? matchedRubric.level / maxLevel : 0.0;

        const dist: Record<number, number> = {};
        for (const r of q.rubric) {
          dist[r.level] = r.level === matchedRubric.level ? 0.85 : 0.15 / (q.rubric.length - 1);
        }

        const conf = typeof rawAns?.confidence === "number" ? Math.max(0, Math.min(1, rawAns.confidence)) : 0.85;

        validatedAnswers.push({
          questionId: q.id,
          type: "SCORE",
          selectedLevel: matchedRubric.level,
          selectedLabel: matchedRubric.label,
          score,
          distribution: dist,
          confidence: conf,
          reasoning: rawAns?.reasoning || `LLM evaluated level ${matchedRubric.level}`,
          isDeterministic: false,
        });
      }
    }

    return validatedAnswers;
  }

  private generateFallbackBatch(
    request: DecisionBatchRequest,
    latencyMs: number,
    errorMsg: string
  ): DecisionBatchResult {
    const answers: DecisionAnswer[] = [];
    const answersById: Record<string, DecisionAnswer> = {};

    for (const q of request.questions) {
      if (q.type === "NOUL") {
        const ans: NoulAnswer = {
          questionId: q.id,
          type: "NOUL",
          value: false,
          probabilityTrue: 0.5,
          confidence: 0.2, // Low confidence triggers escalation
          reasoning: `LLM fallback: ${errorMsg}`,
          isDeterministic: false,
        };
        answers.push(ans);
        answersById[q.id] = ans;
      } else if (q.type === "CHOICE") {
        const probs: Record<string, number> = {};
        for (const opt of q.options) probs[opt] = 1.0 / q.options.length;
        const ans: ChoiceAnswer = {
          questionId: q.id,
          type: "CHOICE",
          selected: q.options[0],
          probabilities: probs,
          confidence: 0.2,
          reasoning: `LLM fallback: ${errorMsg}`,
          isDeterministic: false,
        };
        answers.push(ans);
        answersById[q.id] = ans;
      } else {
        const dist: Record<number, number> = {};
        for (const r of q.rubric) dist[r.level] = 1.0 / q.rubric.length;
        const ans: ScoreAnswer = {
          questionId: q.id,
          type: "SCORE",
          selectedLevel: q.rubric[0].level,
          selectedLabel: q.rubric[0].label,
          score: 0.0,
          distribution: dist,
          confidence: 0.2,
          reasoning: `LLM fallback: ${errorMsg}`,
          isDeterministic: false,
        };
        answers.push(ans);
        answersById[q.id] = ans;
      }
    }

    return {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers,
      answersById,
      adapterUsed: "LLM",
      totalLatencyMs: latencyMs,
      minConfidence: 0.2,
      shouldEscalate: true,
    };
  }
}
