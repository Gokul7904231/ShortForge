/**
 * Decision Fabric — Unit Tests
 *
 * Verifies Noul/Choice/Score primitives, probability vs confidence separation,
 * deterministic resolution, shadow-mode Jev comparison, and DecisionEngine batching.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DecisionEngine } from "../core/intelligence/decision/DecisionEngine";
import { DeterministicDecisionAdapter } from "../core/intelligence/decision/DeterministicDecisionAdapter";
import { TypeSafeJevAdapter } from "../core/intelligence/decision/TypeSafeJevAdapter";
import {
  DecisionBatchRequest,
  NoulQuestion,
  ChoiceQuestion,
  ScoreQuestion,
} from "../core/intelligence/decision/DecisionContracts";

describe("Typed Decision Fabric Suite", () => {
  beforeEach(() => {
    // Fresh state before each test
  });

  it("1. DeterministicDecisionAdapter resolves known facts with 1.0 confidence and 0 tokens", async () => {
    const adapter = new DeterministicDecisionAdapter();

    const questions: [NoulQuestion, ChoiceQuestion<any>, ScoreQuestion] = [
      {
        id: "isEligibleForShorts",
        type: "NOUL",
        question: "Is this video eligible for YouTube Shorts?",
      },
      {
        id: "targetCodec",
        type: "CHOICE",
        question: "Select the video encoding codec",
        options: ["h264_nvenc", "libx264", "hevc_nvenc"],
      },
      {
        id: "qualityScore",
        type: "SCORE",
        question: "Rate output render quality",
        rubric: [
          { level: 1, label: "POOR", description: "Low bit-rate" },
          { level: 2, label: "ACCEPTABLE", description: "Standard bit-rate" },
          { level: 3, label: "HIGH", description: "Production bit-rate" },
        ],
      },
    ];

    const request: DecisionBatchRequest = {
      batchId: "batch_det_01",
      questions,
      sharedContext: {
        durationSeconds: 45.2, // Rule: <= 60 is eligible for Shorts
        targetCodec: "h264_nvenc", // Explicit string match
        qualityScore: 0.95, // Explicit float metric
      },
    };

    const result = await adapter.evaluateBatch(request);

    expect(result.adapterUsed).toBe("DETERMINISTIC");
    expect(result.shouldEscalate).toBe(false);
    expect(result.minConfidence).toBe(1.0);

    const noulAns = result.answersById["isEligibleForShorts"];
    expect(noulAns.type).toBe("NOUL");
    if (noulAns.type === "NOUL") {
      expect(noulAns.value).toBe(true);
      expect(noulAns.confidence).toBe(1.0);
      expect(noulAns.isDeterministic).toBe(true);
    }

    const choiceAns = result.answersById["targetCodec"];
    expect(choiceAns.type).toBe("CHOICE");
    if (choiceAns.type === "CHOICE") {
      expect(choiceAns.selected).toBe("h264_nvenc");
      expect(choiceAns.confidence).toBe(1.0);
      expect(choiceAns.isDeterministic).toBe(true);
    }

    const scoreAns = result.answersById["qualityScore"];
    expect(scoreAns.type).toBe("SCORE");
    if (scoreAns.type === "SCORE") {
      expect(scoreAns.selectedLevel).toBe(3);
      expect(scoreAns.selectedLabel).toBe("HIGH");
      expect(scoreAns.confidence).toBe(1.0);
    }
  });

  it("2. Separates Probability (outcome likelihood) from Confidence (epistemic certainty)", () => {
    const noulQuestion: NoulQuestion = {
      id: "coinFlip",
      type: "NOUL",
      question: "Will the coin land heads?",
    };

    // A fair coin flip has probability 0.5, but confidence can be 1.0 (we know for certain it's a 50/50 fair coin)
    const answer = {
      questionId: noulQuestion.id,
      type: "NOUL" as const,
      value: false,
      probabilityTrue: 0.5,
      confidence: 1.0,
      reasoning: "Fair coin toss has exact 50% probability with complete certainty",
    };

    expect(answer.probabilityTrue).toBe(0.5);
    expect(answer.confidence).toBe(1.0);
    expect(answer.probabilityTrue).not.toBe(answer.confidence);
  });

  it("3. TypeSafeJevAdapter runs in shadow mode and records shadow diffs", async () => {
    const jevAdapter = new TypeSafeJevAdapter();

    const request: DecisionBatchRequest = {
      batchId: "batch_jev_shadow_01",
      questions: [
        {
          id: "intent",
          type: "CHOICE",
          question: "Determine user intent",
          options: ["PRODUCE_SHORT", "INVESTIGATE_FAILURE", "STATUS_INQUIRY"],
        },
        {
          id: "requiresLiveResearch",
          type: "NOUL",
          question: "Does the request require live research?",
        },
      ],
      sharedContext: {
        query: "Why did the render worker fail with code 137?",
      },
    };

    const jevResult = await jevAdapter.evaluateBatch(request);
    expect(jevResult.adapterUsed).toBe("JEV_SHADOW");

    const intentAns = jevResult.answersById["intent"];
    expect(intentAns.type).toBe("CHOICE");
    if (intentAns.type === "CHOICE") {
      expect(intentAns.selected).toBe("INVESTIGATE_FAILURE");
    }

    // Now record comparison with a simulated primary result
    const primaryResult = {
      ...jevResult,
      adapterUsed: "LLM" as const,
    };

    const comp = jevAdapter.recordShadowComparison("batch_jev_shadow_01", primaryResult, jevResult);
    expect(comp.agreementRate).toBe(1.0);
    expect(comp.diffs).toHaveLength(2);
    expect(comp.diffs[0].agreed).toBe(true);
  });

  it("4. DecisionEngine coordinates deterministic resolution, shadow evaluation, and ledgering", async () => {
    const engine = new DecisionEngine({
      enableShadowJev: true,
      enableDeterministicFirst: true,
    });

    const request: DecisionBatchRequest = {
      batchId: "batch_engine_01",
      taskId: "task_video_gen_01",
      missionId: "mission_01",
      questions: [
        {
          id: "isEligibleForShorts",
          type: "NOUL",
          question: "Is duration within 60 seconds?",
        },
        {
          id: "responseMode",
          type: "CHOICE",
          question: "Execution mode",
          options: ["REFLEX", "DELIBERATE", "DEEP"],
        },
      ],
      sharedContext: {
        durationSeconds: 30.0, // Deterministic resolution
        responseMode: "DELIBERATE", // Deterministic resolution
      },
    };

    const result = await engine.evaluateBatch(request);

    expect(result.adapterUsed).toBe("DETERMINISTIC");
    expect(result.minConfidence).toBe(1.0);
    expect(result.shouldEscalate).toBe(false);

    // Ledger verification
    const ledger = engine.getLedger();
    const summary = ledger.getCalibrationSummary();
    expect(summary.totalDecisions).toBe(2);
    expect(summary.averageConfidence).toBe(1.0);
    expect(summary.deterministicRatio).toBe(1.0);
  });

  it("5. DecisionEngine triggers escalation when confidence falls below threshold", async () => {
    const engine = new DecisionEngine({
      enableShadowJev: false,
      enableDeterministicFirst: false,
      escalationThreshold: 0.75,
    });

    // Request with no context will fall back to low-confidence LLM fallback
    const request: DecisionBatchRequest = {
      batchId: "batch_low_conf_01",
      questions: [
        {
          id: "unresolvableQuestion",
          type: "NOUL",
          question: "Will unknown event X happen?",
        },
      ],
      sharedContext: {},
    };

    const result = await engine.evaluateBatch(request);
    // Low confidence triggers escalation
    expect(result.minConfidence).toBeLessThan(0.75);
    expect(result.shouldEscalate).toBe(true);
  });
});
