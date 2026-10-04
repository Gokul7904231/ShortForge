/**
 * ShortForge / FactoryOS — Decision Engine
 *
 * Coordinates the authoritative bounded decision path while running optional
 * JEV, GLiDE, CLM, and AER-Core observers in non-blocking shadow mode.
 *
 * AER-Core is NOT part of the authoritative decision path in this version.
 */

import {
  type DecisionBatchRequest,
  type DecisionBatchResult,
  type DecisionAnswer,
  type DecisionQuestion,
} from "./DecisionContracts";
import { DeterministicDecisionAdapter } from "./DeterministicDecisionAdapter";
import { TypeSafeJevAdapter, type ShadowDiffRecord } from "./TypeSafeJevAdapter";
import { LLMDecisionAdapter } from "./LLMDecisionAdapter";
import { CLMDecisionAdapter } from "./CLMDecisionAdapter";
import {
  GlideDecisionAdapter,
  type GlideDecisionAdapterConfig,
} from "./GlideDecisionAdapter";
import { AERDecisionAdapter } from "./AERDecisionAdapter";
import type { AERDecisionCoreProvider } from "./AERDecisionCoreContract";
import { AERCoreShadowCoordinator, type AERCoreShadowRecord } from "./AERCoreShadowCoordinator";
import { AERCoreShadowLedger } from "./AERCoreShadowLedger";
import { DecisionLedger } from "./DecisionLedger";

export interface DecisionEngineConfig {
  enableShadowJev?: boolean;
  enableShadowClm?: boolean;
  enableGlideFastPath?: boolean;
  enableShadowGlide?: boolean;
  /** AER-Core can only be attached as a shadow observer in this release. */
  enableShadowAerCore?: boolean;
  aerCoreProvider?: AERDecisionCoreProvider;
  glide?: Partial<GlideDecisionAdapterConfig>;
  enableDeterministicFirst?: boolean;
  escalationThreshold?: number;
}

export class DecisionEngine {
  private readonly deterministicAdapter: DeterministicDecisionAdapter;
  private readonly jevShadowAdapter: TypeSafeJevAdapter;
  private readonly llmAdapter: LLMDecisionAdapter;
  private readonly clmShadowAdapter: CLMDecisionAdapter;
  private readonly glideShadowAdapter: GlideDecisionAdapter;
  private readonly aerCoreShadowAdapter?: AERDecisionAdapter;
  private readonly aerCoreShadowCoordinator = new AERCoreShadowCoordinator();
  private readonly aerCoreShadowLedger = new AERCoreShadowLedger();
  private readonly ledger: DecisionLedger;
  private readonly config: {
    enableShadowJev: boolean;
    enableShadowClm: boolean;
    enableGlideFastPath: boolean;
    enableShadowGlide: boolean;
    enableShadowAerCore: boolean;
    aerCoreProvider?: AERDecisionCoreProvider;
    glide: Partial<GlideDecisionAdapterConfig>;
    enableDeterministicFirst: boolean;
    escalationThreshold: number;
  };

  constructor(config: DecisionEngineConfig = {}) {
    this.deterministicAdapter = new DeterministicDecisionAdapter();
    this.jevShadowAdapter = new TypeSafeJevAdapter();
    this.llmAdapter = new LLMDecisionAdapter();
    this.clmShadowAdapter = new CLMDecisionAdapter();
    this.glideShadowAdapter = new GlideDecisionAdapter(config.glide ?? {});
    this.aerCoreShadowAdapter = config.aerCoreProvider
      ? new AERDecisionAdapter({ provider: config.aerCoreProvider })
      : undefined;
    this.ledger = DecisionLedger.getInstance();

    this.config = {
      enableShadowJev: config.enableShadowJev ?? true,
      enableShadowClm: config.enableShadowClm ?? false,
      enableGlideFastPath: config.enableGlideFastPath ?? false,
      enableShadowGlide: config.enableShadowGlide ?? false,
      enableShadowAerCore: config.enableShadowAerCore ?? false,
      aerCoreProvider: config.aerCoreProvider,
      glide: config.glide ?? {},
      enableDeterministicFirst: config.enableDeterministicFirst ?? true,
      escalationThreshold: config.escalationThreshold ?? 0.7,
    };
  }

  public async evaluateBatch(request: DecisionBatchRequest): Promise<DecisionBatchResult> {
    const t0 = Date.now();
    let finalAnswersById: Record<string, DecisionAnswer> = {};
    let adapterUsed: "DETERMINISTIC" | "GLIDE" | "LLM" | "HYBRID" = "DETERMINISTIC";
    let usedGlideFastPath = false;

    let unresolvedQuestions = request.questions;

    if (this.config.enableDeterministicFirst) {
      const detResult = await this.deterministicAdapter.evaluateBatch(request);
      const resolvedAnswers: DecisionAnswer[] = [];
      const stillUnresolved: DecisionQuestion[] = [];

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
      if (unresolvedQuestions.length === 0) adapterUsed = "DETERMINISTIC";
      else if (resolvedAnswers.length > 0) adapterUsed = "HYBRID";
    }

    if (unresolvedQuestions.length > 0 && this.config.enableGlideFastPath) {
      const glideSubRequest: DecisionBatchRequest = {
        ...request,
        questions: unresolvedQuestions,
      };

      try {
        const glideResult = await this.glideShadowAdapter.evaluateBatch(glideSubRequest);
        usedGlideFastPath = glideResult.status === "VALID";
        const acceptedQuestions: DecisionQuestion[] = [];

        for (const q of unresolvedQuestions) {
          const ans = glideResult.answersById[q.id];
          if (ans && ans.status === "VALID" && !glideResult.shouldEscalate) {
            finalAnswersById[q.id] = ans;
          } else {
            acceptedQuestions.push(q);
          }
        }

        unresolvedQuestions = acceptedQuestions;
        if (unresolvedQuestions.length === 0) {
          adapterUsed = adapterUsed === "HYBRID" ? "HYBRID" : "GLIDE";
        } else if (adapterUsed !== "HYBRID" && Object.keys(finalAnswersById).length > 0) {
          adapterUsed = "HYBRID";
        }
      } catch (err) {
        console.warn("[DecisionEngine] GLiDE fast path failed; escalating:", err);
      }
    }

    if (unresolvedQuestions.length > 0) {
      const llmSubRequest: DecisionBatchRequest = {
        ...request,
        questions: unresolvedQuestions,
      };
      const llmResult = await this.llmAdapter.evaluateBatch(llmSubRequest);
      for (const q of unresolvedQuestions) {
        const ans = llmResult.answersById[q.id];
        if (ans) finalAnswersById[q.id] = ans;
      }
      if (adapterUsed !== "HYBRID") adapterUsed = "LLM";
    }

    const assembledAnswers: DecisionAnswer[] = request.questions.map(
      (q) => finalAnswersById[q.id],
    );
    const confidences = assembledAnswers.map((a) => a?.confidence ?? 0.0);
    const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 0.0;
    const shouldEscalate = minConfidence < this.config.escalationThreshold;
    const hasUnresolved = assembledAnswers.some(
      (a) => a?.status === "INVALID" || a?.status === "UNRESOLVED",
    );

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
        implementationVersion: "2.1.0",
        isProductionAuthority: true,
        // Training eligibility is established by verified training capture,
        // not by the runtime adapter result.
        isTrainingEligible: false,
      },
    };

    // Authoritative result is recorded before shadow execution.
    this.ledger.recordTransaction(finalResult, {
      taskId: request.taskId,
      missionId: request.missionId,
    });

    // Shadow observers are intentionally non-blocking for the primary path.
    void this.runShadowEvaluations(request, finalResult);

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

  public getGlideShadowAdapter(): GlideDecisionAdapter {
    return this.glideShadowAdapter;
  }

  public getAerCoreShadowLedger(): AERCoreShadowLedger {
    return this.aerCoreShadowLedger;
  }

  public getAerCoreShadowRecords(): readonly AERCoreShadowRecord[] {
    return this.aerCoreShadowLedger.getRecords();
  }

  private async runShadowEvaluations(
    request: DecisionBatchRequest,
    finalResult: DecisionBatchResult,
  ): Promise<void> {
    const jevPromise = this.config.enableShadowJev
      ? this.jevShadowAdapter.evaluateBatch(request)
      : Promise.resolve(null);
    const clmPromise = this.config.enableShadowClm
      ? this.clmShadowAdapter.evaluateBatch(request)
      : Promise.resolve(null);
    const glidePromise = this.config.enableShadowGlide
      ? this.glideShadowAdapter.evaluateBatch(request)
      : Promise.resolve(null);
    const aerPromise =
      this.config.enableShadowAerCore && this.aerCoreShadowAdapter
        ? this.aerCoreShadowAdapter.evaluateBatch(request)
        : Promise.resolve(null);

    const [jevSettled, clmSettled, glideSettled, aerSettled] =
      await Promise.allSettled([
        jevPromise,
        clmPromise,
        glidePromise,
        aerPromise,
      ]);

    const shadowDiffs: ShadowDiffRecord[] = [];

    if (jevSettled.status === "fulfilled" && jevSettled.value) {
      try {
        const comparison = this.jevShadowAdapter.recordShadowComparison(
          request.batchId,
          finalResult,
          jevSettled.value,
        );
        shadowDiffs.push(...comparison.diffs);
      } catch (err) {
        console.warn("[DecisionEngine] JEV comparison failed non-fatally:", err);
      }
    } else if (jevSettled.status === "rejected") {
      console.warn("[DecisionEngine] JEV shadow failed non-fatally:", jevSettled.reason);
    }

    if (clmSettled.status === "fulfilled" && clmSettled.value) {
      try {
        shadowDiffs.push(...this.buildShadowDiffs(finalResult, clmSettled.value));
      } catch (err) {
        console.warn("[DecisionEngine] CLM comparison failed non-fatally:", err);
      }
    } else if (clmSettled.status === "rejected") {
      console.warn("[DecisionEngine] CLM shadow failed non-fatally:", clmSettled.reason);
    }

    if (glideSettled.status === "fulfilled" && glideSettled.value) {
      try {
        shadowDiffs.push(...this.buildShadowDiffs(finalResult, glideSettled.value));
      } catch (err) {
        console.warn("[DecisionEngine] GLiDE comparison failed non-fatally:", err);
      }
    } else if (glideSettled.status === "rejected") {
      console.warn("[DecisionEngine] GLiDE shadow failed non-fatally:", glideSettled.reason);
    }

    if (shadowDiffs.length > 0) {
      this.ledger.recordShadowDiffs(shadowDiffs);
    }

    if (aerSettled.status === "fulfilled" && aerSettled.value) {
      const aerResult = aerSettled.value;
      const available = [
        { name: "PRIMARY" as const, result: finalResult },
        ...(jevSettled.status === "fulfilled" && jevSettled.value
          ? [{ name: "JEV_SHADOW" as const, result: jevSettled.value }]
          : []),
        ...(glideSettled.status === "fulfilled" && glideSettled.value
          ? [{ name: "GLIDE_SHADOW" as const, result: glideSettled.value }]
          : []),
      ];

      for (const baseline of available) {
        this.aerCoreShadowLedger.record(
          this.aerCoreShadowCoordinator.compare(
            baseline.result,
            aerResult,
            [baseline.name],
          ),
        );
      }
    } else if (aerSettled.status === "rejected") {
      console.warn("[DecisionEngine] AER-Core shadow failed non-fatally:", aerSettled.reason);
    }
  }

  private buildShadowDiffs(
    primary: DecisionBatchResult,
    shadow: DecisionBatchResult,
  ): ShadowDiffRecord[] {
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
      } else if (
        primaryAnswer.type === "CHOICE" &&
        shadowAnswer.type === "CHOICE"
      ) {
        primarySelected = primaryAnswer.selected;
        shadowSelected = shadowAnswer.selected;
      } else if (
        primaryAnswer.type === "SCORE" &&
        shadowAnswer.type === "SCORE"
      ) {
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
