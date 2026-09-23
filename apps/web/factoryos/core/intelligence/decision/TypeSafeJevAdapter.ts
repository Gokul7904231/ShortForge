/**
 * ShortForge / FactoryOS — Heuristic Typed Decision Shadow Adapter
 *
 * CRITICAL ARCHITECTURAL NOTICE (PROJECT ASCALON):
 * ============================================================================
 * THIS IS A SHADOW HEURISTIC BASELINE.
 * THIS IS NOT THE JEV SYSTEM ONE MODEL.
 * ============================================================================
 *
 * This adapter provides a lightweight, local heuristic baseline for shadow comparison
 * and offline experimentation. It has NO production authority and its outputs are
 * STRICTLY INELIGIBLE for golden training trajectories (isTrainingEligible: false).
 */

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

export interface ShadowDiffRecord {
  readonly batchId: string;
  readonly questionId: string;
  readonly primarySelected: unknown;
  readonly heuristicSelected: unknown;
  readonly agreed: boolean;
  readonly primaryConfidence: number;
  readonly heuristicConfidence: number;
  readonly recordedAt: string;
}

export class HeuristicTypedDecisionShadowAdapter implements IDecisionAdapter {
  readonly adapterName = "HEURISTIC_SHADOW";
  private shadowDiffHistory: ShadowDiffRecord[] = [];

  public async evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult> {
    const t0 = Date.now();
    const answers: DecisionAnswer[] = [];
    const answersById: Record<string, DecisionAnswer> = {};

    for (const q of request.questions) {
      const mergedContext = {
        ...(request.sharedContext || {}),
        ...(q.contextSlice || {}),
      };

      if (q.type === "NOUL") {
        const ans = this.evaluateNoul(q, mergedContext);
        answers.push(ans);
        answersById[q.id] = ans;
      } else if (q.type === "CHOICE") {
        const ans = this.evaluateChoice(q, mergedContext);
        answers.push(ans);
        answersById[q.id] = ans;
      } else if (q.type === "SCORE") {
        const ans = this.evaluateScore(q, mergedContext);
        answers.push(ans);
        answersById[q.id] = ans;
      }
    }

    const confidences = answers.map((a) => a.confidence);
    const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 0.5;

    return {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers,
      answersById,
      adapterUsed: "HEURISTIC_SHADOW",
      totalLatencyMs: Date.now() - t0,
      minConfidence,
      shouldEscalate: minConfidence < 0.7,
      status: "VALID",
      adapterMetadata: {
        adapterType: "HEURISTIC_SHADOW",
        implementationVersion: "1.0.0",
        isProductionAuthority: false,
        isTrainingEligible: false,
      },
    };
  }

  public recordShadowComparison(
    batchId: string,
    primaryResult: DecisionBatchResult,
    heuristicResult: DecisionBatchResult
  ): { agreementRate: number; diffs: ShadowDiffRecord[] } {
    let matches = 0;
    const currentDiffs: ShadowDiffRecord[] = [];

    for (const qId of Object.keys(primaryResult.answersById)) {
      const pAns = primaryResult.answersById[qId];
      const hAns = heuristicResult.answersById[qId];

      if (!hAns) continue;

      let pVal: unknown;
      let hVal: unknown;

      if (pAns.type === "NOUL" && hAns.type === "NOUL") {
        pVal = pAns.value;
        hVal = hAns.value;
      } else if (pAns.type === "CHOICE" && hAns.type === "CHOICE") {
        pVal = pAns.selected;
        hVal = hAns.selected;
      } else if (pAns.type === "SCORE" && hAns.type === "SCORE") {
        pVal = pAns.selectedLevel;
        hVal = hAns.selectedLevel;
      }

      const agreed = pVal === hVal;
      if (agreed) matches++;

      const record: ShadowDiffRecord = {
        batchId,
        questionId: qId,
        primarySelected: pVal,
        heuristicSelected: hVal,
        agreed,
        primaryConfidence: pAns.confidence,
        heuristicConfidence: hAns.confidence,
        recordedAt: new Date().toISOString(),
      };

      currentDiffs.push(record);
      this.shadowDiffHistory.push(record);
    }

    const total = Object.keys(primaryResult.answersById).length;
    const agreementRate = total > 0 ? matches / total : 1.0;

    return { agreementRate, diffs: currentDiffs };
  }

  public getShadowHistory(): readonly ShadowDiffRecord[] {
    return this.shadowDiffHistory;
  }

  public clearHistory(): void {
    this.shadowDiffHistory = [];
  }

  private evaluateNoul(q: NoulQuestion, ctx: Record<string, unknown>): NoulAnswer {
    const qLower = q.question.toLowerCase();
    let probabilityTrue = 0.5;

    // Lightweight heuristic keyword detection
    if (qLower.includes("healthy") || qLower.includes("online") || qLower.includes("operational")) {
      probabilityTrue = 0.85;
    } else if (qLower.includes("degraded") || qLower.includes("failure") || qLower.includes("error")) {
      probabilityTrue = 0.15;
    }

    const threshold = q.threshold ?? 0.5;
    const value = probabilityTrue >= threshold;

    return {
      questionId: q.id,
      type: "NOUL",
      value,
      probabilityTrue,
      confidence: 0.65, // Explicitly labeled heuristic confidence
      reasoning: "Heuristic baseline keyword evaluation (SHADOW ONLY)",
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: probabilityTrue,
        epistemicConfidence: 0.65,
        calibrationStatus: "UNCALIBRATED",
        uncertaintyReason: "Heuristic baseline simulation, uncalibrated",
      },
    };
  }

  private evaluateChoice(q: ChoiceQuestion<any>, ctx: Record<string, unknown>): ChoiceAnswer {
    const selected = q.options[0]; // Baseline heuristic: default to option 0
    const probs: Record<string, number> = {};

    for (const opt of q.options) {
      probs[opt] = 1.0 / q.options.length;
    }

    return {
      questionId: q.id,
      type: "CHOICE",
      selected,
      probabilities: probs,
      confidence: 0.5,
      reasoning: `Heuristic baseline uniform distribution over ${q.options.length} options (SHADOW ONLY)`,
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: probs[selected],
        epistemicConfidence: 0.5,
        calibrationStatus: "UNCALIBRATED",
        uncertaintyReason: "Heuristic baseline simulation, uncalibrated",
      },
    };
  }

  private evaluateScore(q: ScoreQuestion, ctx: Record<string, unknown>): ScoreAnswer {
    const selectedRubric = q.rubric[0];
    const dist: Record<number, number> = {};
    for (const r of q.rubric) {
      dist[r.level] = 1.0 / q.rubric.length;
    }

    return {
      questionId: q.id,
      type: "SCORE",
      selectedLevel: selectedRubric.level,
      selectedLabel: selectedRubric.label,
      score: 0.0,
      distribution: dist,
      confidence: 0.5,
      reasoning: `Heuristic baseline rubric evaluation (SHADOW ONLY)`,
      isDeterministic: false,
      status: "VALID",
      uncertainty: {
        modelProbability: dist[selectedRubric.level],
        epistemicConfidence: 0.5,
        calibrationStatus: "UNCALIBRATED",
        uncertaintyReason: "Heuristic baseline simulation, uncalibrated",
      },
    };
  }
}

/** Backwards-compatible alias for existing consumers */
export const TypeSafeJevAdapter = HeuristicTypedDecisionShadowAdapter;
export type TypeSafeJevAdapter = HeuristicTypedDecisionShadowAdapter;
