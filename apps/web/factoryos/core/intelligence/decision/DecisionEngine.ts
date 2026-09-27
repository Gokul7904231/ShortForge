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
import { CLMDecisionAdapter } from "./CLMDecisionAdapter";
import { ShadowDiffRecord } from "./TypeSafeJevAdapter";
import { DecisionLedger } from "./DecisionLedger";

export interface DecisionEngineConfig {
  enableShadowJev?: boolean;
  /** Opt-in only: requires a reachable CLM service and never changes the primary path. */
  enableShadowClm?: boolean;
  enableDeterministicFirst?: boolean;
  escalationThreshold?: number; // Default 0.70
}

export class DecisionEngine {
  private deterministicAdapter: DeterministicDecisionAdapter;
  private jevShadowAdapter: TypeSafeJevAdapter;
  private llmAdapter: LLMDecisionAdapter;
  private clmShadowAdapter: CLMDecisionAdapter;
  private ledger: DecisionLedger;
  private config: Required<DecisionEngineConfig>;

  constructor(config: DecisionEngineConfig = {}) {
    this.deterministicAdapter = new DeterministicDecisionAdapter();
    this.jevShadowAdapter = new TypeSafeJevAdapter();
    this.llmAdapter = new LLMDecisionAdapter();
    this.clmShadowAdapter = new CLMDecisionAdapter();
    this.ledger = DecisionLedger.getInstance();

    this.config = {
      enableShadowJev: config.enableShadowJev ?? true,
      enableShadowClm: config.enableShadowClm ?? false,
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

    const hasUnresolved = assembledAnswers.some((a) => a?.status === "INVALID" || a?.status === "UNRESOLVED");

    const finalResult: DecisionBatchResult = {
      batchId: request.batchId,
      evaluatedAt: new Date().toISOString(),
      answers: assembledAnswers,
      answersById: finalAnswersById,
      adapterUsed,
      totalLatencyMs: Date.now() - t0,
      minConfidence,
      shouldEscalate,
      status: hasUnresolved ? "UNRESOLVED" : "VALID",
      adapterMetadata: {
        adapterType: adapterUsed,
        implementationVersion: "2.0.0",
        isProductionAuthority: true,
        isTrainingEligible: !hasUnresolved,
      },
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

    // 4. Optional CLM shadow comparison. It is disabled by default because it is an external
    // service dependency and is not yet qualified as a production authority.
    if (this.config.enableShadowClm) {
      try {
        const clmResult = await this.clmShadowAdapter.evaluateBatch(request);
        const clmDiffs = this.buildShadowDiffs(finalResult, clmResult);
        shadowDiffs = [...(shadowDiffs ?? []), ...clmDiffs];
      } catch (err) {
        console.warn("[DecisionEngine] CLM shadow evaluation failed non-fatally:", err);
      }
    }

    // 5. Record to Durable Decision Ledger
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

  public getClmShadowAdapter(): CLMDecisionAdapter {
    return this.clmShadowAdapter;
  }

  private buildShadowDiffs(primary: DecisionBatchResult, shadow: DecisionBatchResult): ShadowDiffRecord[] {
    const diffs: ShadowDiffRecord[] = [];
    for (const questionId of Object.keys(primary.answersById)) {
      const primaryAnswer = primary.answersById[questionId];
      const shadowAnswer = shadow.answersById[questionId];
      if (!shadowAnswer) continue;

      let primarySelected: unknown;
      let shadowSelected: unknown;
      if (primaryAnswer.type === "NOUL" && shadowAnswer.type === "NOUL") {
        primarySelected = primaryAnswer.value;
        shadowSelected = shadowAnswer.value;
      } else if (primaryAnswer.type === "CHOICE" && shadowAnswer.type === "CHOICE") {
        primarySelected = primaryAnswer.selected;
        shadowSelected = shadowAnswer.selected;
      } else if (primaryAnswer.type === "SCORE" && shadowAnswer.type === "SCORE") {
        primarySelected = primaryAnswer.selectedLevel;
        shadowSelected = shadowAnswer.selectedLevel;
      } else {
        continue;
      }

      diffs.push({
        batchId: primary.batchId,
        questionId,
        primarySelected,
        heuristicSelected: shadowSelected,
        agreed: primarySelected === shadowSelected,
        primaryConfidence: primaryAnswer.confidence,
        heuristicConfidence: shadowAnswer.confidence,
        recordedAt: new Date().toISOString(),
      });
    }
    return diffs;
  }
}
