/**
 * ShortForge / FactoryOS — Deterministic Decision Adapter
 *
 * Resolves questions using rule predicates and known state facts.
 * High priority in Ponytail economy: 0 tokens, 1.0 confidence, <1ms latency.
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

export class DeterministicDecisionAdapter implements IDecisionAdapter {
  readonly adapterName = "DETERMINISTIC";

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
      adapterUsed: "DETERMINISTIC",
      totalLatencyMs: Date.now() - t0,
      minConfidence,
      shouldEscalate: minConfidence < 0.7,
    };
  }

  private evaluateNoul(q: NoulQuestion, ctx: Record<string, unknown>): NoulAnswer {
    // 1. Direct boolean property in context matching question id
    if (typeof ctx[q.id] === "boolean") {
      const val = ctx[q.id] as boolean;
      return {
        questionId: q.id,
        type: "NOUL",
        value: val,
        probabilityTrue: val ? 1.0 : 0.0,
        confidence: 1.0,
        reasoning: `Direct ground-truth property '${q.id}' in context`,
        isDeterministic: true,
      };
    }

    // 2. Rule evaluation: YouTube Shorts duration limit (<= 60 seconds)
    if (q.id === "isEligibleForShorts" && typeof ctx.durationSeconds === "number") {
      const eligible = ctx.durationSeconds <= 60.0;
      return {
        questionId: q.id,
        type: "NOUL",
        value: eligible,
        probabilityTrue: eligible ? 1.0 : 0.0,
        confidence: 1.0,
        reasoning: `Rule check: durationSeconds (${ctx.durationSeconds}) <= 60.0`,
        isDeterministic: true,
      };
    }

    // 3. Rule evaluation: generationRequired
    if (q.id === "generationRequired" && typeof ctx.command === "string") {
      const cmd = (ctx.command as string).toLowerCase();
      const val = cmd.includes("short") || cmd.includes("video") || cmd.includes("generate");
      return {
        questionId: q.id,
        type: "NOUL",
        value: val,
        probabilityTrue: val ? 1.0 : 0.0,
        confidence: 1.0,
        reasoning: `Rule check: generation requirement for '${cmd}' = ${val}`,
        isDeterministic: true,
      };
    }

    // 4. Fallback: Unknown deterministic state
    return {
      questionId: q.id,
      type: "NOUL",
      value: false,
      probabilityTrue: 0.5,
      confidence: 0.0, // Low confidence signals escalation or fallback to LLM
      reasoning: "No deterministic rule or state matched",
      isDeterministic: false,
    };
  }

  private evaluateChoice<T extends string>(q: ChoiceQuestion<T>, ctx: Record<string, unknown>): ChoiceAnswer<T> {
    // 1. Direct string match in context matching question id
    if (typeof ctx[q.id] === "string" && q.options.includes(ctx[q.id] as T)) {
      const selected = ctx[q.id] as T;
      const probabilities: Record<string, number> = {};
      for (const opt of q.options) {
        probabilities[opt] = opt === selected ? 1.0 : 0.0;
      }
      return {
        questionId: q.id,
        type: "CHOICE",
        selected,
        probabilities: probabilities as Record<T, number>,
        confidence: 1.0,
        reasoning: `Direct ground-truth option '${selected}' in context`,
        isDeterministic: true,
      };
    }

    // 2. Rule evaluation: command intent
    if (q.id === "intent" && typeof ctx.command === "string") {
      const cmd = (ctx.command as string).toLowerCase();
      let selectedOpt: T | undefined;
      if (cmd.includes("operate the factory") || cmd.includes("autonomous") || cmd.includes("continuous")) {
        if (q.options.includes("EXECUTE_AUTONOMOUS_OPERATION" as T)) selectedOpt = "EXECUTE_AUTONOMOUS_OPERATION" as T;
      } else if (cmd.includes("triage") || cmd.includes("case")) {
        if (q.options.includes("TRIAGE_OPEN_CASES" as T)) selectedOpt = "TRIAGE_OPEN_CASES" as T;
      } else if (cmd.includes("slayer") || cmd.includes("patrol")) {
        if (q.options.includes("DISPATCH_SLAYERS" as T)) selectedOpt = "DISPATCH_SLAYERS" as T;
      }

      if (selectedOpt) {
        const probabilities: Record<string, number> = {};
        for (const opt of q.options) {
          probabilities[opt] = opt === selectedOpt ? 1.0 : 0.0;
        }
        return {
          questionId: q.id,
          type: "CHOICE",
          selected: selectedOpt,
          probabilities: probabilities as Record<T, number>,
          confidence: 1.0,
          reasoning: `Deterministic intent match for '${cmd}' -> ${selectedOpt}`,
          isDeterministic: true,
        };
      }
    }

    // 3. Default to first option with 0 confidence if unresolved
    const fallbackOption = q.options[0];
    const probs: Record<string, number> = {};
    for (const opt of q.options) {
      probs[opt] = 1.0 / q.options.length;
    }

    return {
      questionId: q.id,
      type: "CHOICE",
      selected: fallbackOption,
      probabilities: probs as Record<T, number>,
      confidence: 0.0,
      reasoning: "No deterministic choice rule matched",
      isDeterministic: false,
    };
  }

  private evaluateScore(q: ScoreQuestion, ctx: Record<string, unknown>): ScoreAnswer {
    // 1. Direct score value in context
    if (typeof ctx[q.id] === "number") {
      const val = Math.max(0.0, Math.min(1.0, ctx[q.id] as number));
      const levelIndex = Math.min(q.rubric.length - 1, Math.floor(val * q.rubric.length));
      const level = q.rubric[levelIndex];

      const distribution: Record<number, number> = {};
      for (const r of q.rubric) {
        distribution[r.level] = r.level === level.level ? 1.0 : 0.0;
      }

      return {
        questionId: q.id,
        type: "SCORE",
        selectedLevel: level.level,
        selectedLabel: level.label,
        score: val,
        distribution,
        confidence: 1.0,
        reasoning: `Direct ground-truth metric '${q.id}' = ${val}`,
        isDeterministic: true,
      };
    }

    const defaultLevel = q.rubric[0];
    const dist: Record<number, number> = {};
    for (const r of q.rubric) {
      dist[r.level] = 1.0 / q.rubric.length;
    }

    return {
      questionId: q.id,
      type: "SCORE",
      selectedLevel: defaultLevel.level,
      selectedLabel: defaultLevel.label,
      score: 0.0,
      distribution: dist,
      confidence: 0.0,
      reasoning: "No deterministic score rule matched",
      isDeterministic: false,
    };
  }
}
