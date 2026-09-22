/**
 * ShortForge / FactoryOS — TypeSafeJevAdapter (Shadow-Mode Decision Intelligence)
 *
 * Implements Jev / System-One typed decision intelligence.
 * Runs in shadow mode to establish baseline agreement metrics before live deployment.
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
  readonly jevSelected: unknown;
  readonly agreed: boolean;
  readonly primaryConfidence: number;
  readonly jevConfidence: number;
  readonly recordedAt: string;
}

export class TypeSafeJevAdapter implements IDecisionAdapter {
  readonly adapterName = "JEV_SHADOW";
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
    const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 1.0;

    return {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers,
      answersById,
      adapterUsed: "JEV_SHADOW",
      totalLatencyMs: Date.now() - t0,
      minConfidence,
      shouldEscalate: minConfidence < 0.7,
    };
  }

  public recordShadowComparison(
    batchId: string,
    primaryResult: DecisionBatchResult,
    jevResult: DecisionBatchResult
  ): { agreementRate: number; diffs: ShadowDiffRecord[] } {
    let matches = 0;
    const currentDiffs: ShadowDiffRecord[] = [];

    for (const qId of Object.keys(primaryResult.answersById)) {
      const pAns = primaryResult.answersById[qId];
      const jAns = jevResult.answersById[qId];

      if (!jAns) continue;

      let pVal: unknown;
      let jVal: unknown;

      if (pAns.type === "NOUL" && jAns.type === "NOUL") {
        pVal = pAns.value;
        jVal = jAns.value;
      } else if (pAns.type === "CHOICE" && jAns.type === "CHOICE") {
        pVal = pAns.selected;
        jVal = jAns.selected;
      } else if (pAns.type === "SCORE" && jAns.type === "SCORE") {
        pVal = pAns.selectedLevel;
        jVal = jAns.selectedLevel;
      }

      const agreed = pVal === jVal;
      if (agreed) matches++;

      const record: ShadowDiffRecord = {
        batchId,
        questionId: qId,
        primarySelected: pVal,
        jevSelected: jVal,
        agreed,
        primaryConfidence: pAns.confidence,
        jevConfidence: jAns.confidence,
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
    // Jev System-One heuristic pattern matching
    const qLower = q.question.toLowerCase();
    let probabilityTrue = 0.5;
    let confidence = 0.85;
    let reasoning = "Jev system-one heuristic baseline";

    if (qLower.includes("ambiguous") || qLower.includes("clarification")) {
      const prompt = String(ctx.prompt || ctx.query || "");
      probabilityTrue = prompt.length < 15 ? 0.9 : 0.1;
      reasoning = `Prompt length ${prompt.length} evaluated for ambiguity`;
    } else if (qLower.includes("generation") || qLower.includes("synthetic")) {
      probabilityTrue = ctx.skipGeneration ? 0.0 : 0.95;
      reasoning = "Evaluated generation requirement against workflow context";
    } else if (qLower.includes("escalat")) {
      const risk = Number(ctx.riskScore || 0);
      probabilityTrue = risk > 0.8 ? 0.9 : 0.05;
      reasoning = `Risk metric ${risk} evaluated for escalation`;
    }

    const threshold = q.threshold ?? 0.5;
    const value = probabilityTrue >= threshold;

    return {
      questionId: q.id,
      type: "NOUL",
      value,
      probabilityTrue,
      confidence,
      reasoning,
      isDeterministic: false,
    };
  }

  private evaluateChoice<T extends string>(q: ChoiceQuestion<T>, ctx: Record<string, unknown>): ChoiceAnswer<T> {
    const qLower = q.question.toLowerCase();
    let selected: T = q.options[0];
    const probs: Record<string, number> = {};

    // Mode routing heuristics
    if (qLower.includes("mode") || q.id === "responseMode") {
      const taskComplexity = String(ctx.taskComplexity || "NORMAL");
      if (taskComplexity === "HIGH" && q.options.includes("DEEP" as T)) {
        selected = "DEEP" as T;
      } else if (taskComplexity === "LOW" && q.options.includes("REFLEX" as T)) {
        selected = "REFLEX" as T;
      } else if (q.options.includes("DELIBERATE" as T)) {
        selected = "DELIBERATE" as T;
      }
    } else if (q.id === "intent") {
      const query = String(ctx.query || ctx.prompt || "").toLowerCase();
      if (query.includes("fail") || query.includes("error") || query.includes("broken")) {
        if (q.options.includes("INVESTIGATE_FAILURE" as T)) selected = "INVESTIGATE_FAILURE" as T;
      } else if (query.includes("status") || query.includes("health")) {
        if (q.options.includes("STATUS_INQUIRY" as T)) selected = "STATUS_INQUIRY" as T;
      } else if (q.options.includes("PRODUCE_SHORT" as T)) {
        selected = "PRODUCE_SHORT" as T;
      }
    }

    for (const opt of q.options) {
      probs[opt] = opt === selected ? 0.8 : (0.2 / Math.max(1, q.options.length - 1));
    }

    return {
      questionId: q.id,
      type: "CHOICE",
      selected,
      probabilities: probs as Record<T, number>,
      confidence: 0.88,
      reasoning: `Jev selected '${selected}' based on context signals`,
      isDeterministic: false,
    };
  }

  private evaluateScore(q: ScoreQuestion, ctx: Record<string, unknown>): ScoreAnswer {
    // Rubric mapping
    let selectedLevel = q.rubric[0].level;
    let selectedLabel = q.rubric[0].label;
    const dist: Record<number, number> = {};

    if (q.id === "riskScore") {
      const isProduction = Boolean(ctx.isProduction);
      const isLiveUpload = Boolean(ctx.isLiveUpload);

      const targetLevel = isLiveUpload ? 3 : isProduction ? 2 : 1;
      const match = q.rubric.find((r) => r.level === targetLevel) || q.rubric[0];
      selectedLevel = match.level;
      selectedLabel = match.label;
    }

    const maxLevel = Math.max(...q.rubric.map((r) => r.level));
    const score = maxLevel > 0 ? selectedLevel / maxLevel : 0.0;

    for (const r of q.rubric) {
      dist[r.level] = r.level === selectedLevel ? 0.85 : 0.15 / (q.rubric.length - 1);
    }

    return {
      questionId: q.id,
      type: "SCORE",
      selectedLevel,
      selectedLabel,
      score,
      distribution: dist,
      confidence: 0.9,
      reasoning: `Jev evaluated rubric level ${selectedLevel} (${selectedLabel})`,
      isDeterministic: false,
    };
  }
}
