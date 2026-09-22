/**
 * ShortForge / FactoryOS — Decision Engine
 *
 * Coordinates typed decision evaluation across Deterministic, LLM, and Shadow Jev adapters.
 * Enforces Ponytail economy (deterministic first), shadow learning, and durable ledgering.
 */

import {
  DecisionBatchRequest,
  DecisionBatchResult,
  DecisionAnswer,
  IDecisionAdapter,
} from "./DecisionContracts";
import { DeterministicDecisionAdapter } from "./DeterministicDecisionAdapter";
import { TypeSafeJevAdapter } from "./TypeSafeJevAdapter";
import { LLMDecisionAdapter } from "./LLMDecisionAdapter";
import { DecisionLedger } from "./DecisionLedger";

export interface DecisionEngineConfig {
  enableShadowJev?: boolean;
  enableDeterministicFirst?: boolean;
  escalationThreshold?: number; // Default 0.70
}

export class DecisionEngine {
  private deterministicAdapter: DeterministicDecisionAdapter;
  private jevShadowAdapter: TypeSafeJevAdapter;
  private llmAdapter: LLMDecisionAdapter;
  private ledger: DecisionLedger;
  private config: Required<DecisionEngineConfig>;

  constructor(config: DecisionEngineConfig = {}) {
    this.deterministicAdapter = new DeterministicDecisionAdapter();
    this.jevShadowAdapter = new TypeSafeJevAdapter();
    this.llmAdapter = new LLMDecisionAdapter();
    this.ledger = DecisionLedger.getInstance();

    this.config = {
      enableShadowJev: config.enableShadowJev ?? true,
      enableDeterministicFirst: config.enableDeterministicFirst ?? true,
      escalationThreshold: config.escalationThreshold ?? 0.7,
    };
  }

  public async evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult> {
    const t0 = Date.now();
    let finalAnswersById: Record<string, DecisionAnswer> = {};
    let adapterUsed: "DETERMINISTIC" | "LLM" | "HYBRID" = "DETERMINISTIC";

    // 1. Deterministic Evaluation First (Ponytail Economy: 0 tokens)
    let unresolvedQuestions = request.questions;

    if (this.config.enableDeterministicFirst) {
      const detResult = await this.deterministicAdapter.evaluateBatch(request);

      const resolvedAnswers: DecisionAnswer[] = [];
      const stillUnresolved = [];

      for (const q of request.questions) {
        const ans = detResult.answersById[q.id];
        if (ans && ans.confidence >= 1.0) {
          resolvedAnswers.push(ans);
          finalAnswersById[q.id] = ans;
        } else {
          stillUnresolved.push(q);
        }
      }

      unresolvedQuestions = stillUnresolved;

      if (unresolvedQuestions.length === 0) {
        adapterUsed = "DETERMINISTIC";
      } else if (resolvedAnswers.length > 0) {
        adapterUsed = "HYBRID";
      }
    }

    // 2. LLM Evaluation for remaining unresolved questions
    if (unresolvedQuestions.length > 0) {
      const llmSubRequest: DecisionBatchRequest = {
        ...request,
        questions: unresolvedQuestions,
      };

      const llmResult = await this.llmAdapter.evaluateBatch(llmSubRequest);
      for (const q of unresolvedQuestions) {
        const ans = llmResult.answersById[q.id];
        if (ans) {
          finalAnswersById[q.id] = ans;
        }
      }

      if (adapterUsed !== "HYBRID") {
        adapterUsed = "LLM";
      }
    }

    const assembledAnswers: DecisionAnswer[] = request.questions.map(
      (q) => finalAnswersById[q.id]
    );

    const confidences = assembledAnswers.map((a) => a?.confidence ?? 0.0);
    const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 0.0;
    const shouldEscalate = minConfidence < this.config.escalationThreshold;

    const finalResult: DecisionBatchResult = {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers: assembledAnswers,
      answersById: finalAnswersById,
      adapterUsed,
      totalLatencyMs: Date.now() - t0,
      minConfidence,
      shouldEscalate,
    };

    // 3. Shadow Jev Evaluation in parallel (Safe learning loop)
    let shadowDiffs: any[] | undefined;
    if (this.config.enableShadowJev) {
      try {
        const jevResult = await this.jevShadowAdapter.evaluateBatch(request);
        const comp = this.jevShadowAdapter.recordShadowComparison(
          request.batchId,
          finalResult,
          jevResult
        );
        shadowDiffs = comp.diffs;
      } catch (err) {
        // Shadow mode must never fail production execution
        console.warn("[DecisionEngine] Shadow Jev evaluation failed non-fatally:", err);
      }
    }

    // 4. Record to Durable Decision Ledger
    this.ledger.recordTransaction(finalResult, {
      taskId: request.taskId,
      missionId: request.missionId,
      shadowDiffs,
    });

    return finalResult;
  }

  public getLedger(): DecisionLedger {
    return this.ledger;
  }

  public getJevShadowAdapter(): TypeSafeJevAdapter {
    return this.jevShadowAdapter;
  }
}
