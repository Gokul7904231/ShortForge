import { describe, expect, it } from "vitest";
import {
  AER_DECISION_CORE_AUTHORITY,
  assertDynamicQuestionContract,
} from "../core/intelligence/decision/AERDecisionCoreContract";
import { assertTrainingRecordEligible } from "../core/intelligence/decision/AERDecisionTrainingContract";
import { AERCoreShadowCoordinator } from "../core/intelligence/decision/AERCoreShadowCoordinator";
import { validateAERCoreBatch } from "../core/intelligence/decision/AERDecisionValidator";

describe("AER Decision Core training boundary", () => {
  it("keeps AER-Core non-authoritative", () => {
    expect(AER_DECISION_CORE_AUTHORITY.productionAuthority).toBe(false);
    expect(AER_DECISION_CORE_AUTHORITY.canAuthorizeExecution).toBe(false);
    expect(AER_DECISION_CORE_AUTHORITY.canGrantCapability).toBe(false);
    expect(AER_DECISION_CORE_AUTHORITY.canMintLease).toBe(false);
    expect(AER_DECISION_CORE_AUTHORITY.canChangeFencing).toBe(false);
    expect(AER_DECISION_CORE_AUTHORITY.canPublish).toBe(false);
    expect(AER_DECISION_CORE_AUTHORITY.canCertifyF07).toBe(false);
  });

  it("rejects empty or duplicate dynamic question sets", () => {
    expect(() => assertDynamicQuestionContract([])).toThrow();
    expect(() =>
      assertDynamicQuestionContract([
        { id: "q1", type: "NOUL", question: "A?" },
        { id: "q1", type: "NOUL", question: "B?" },
      ]),
    ).toThrow();
  });

  it("rejects synthetic training truth", () => {
    const record = {
      exampleId: "e1",
      datasetVersion: "aer-core-dataset-v1",
      sourceBatchId: "b1",
      input: {
        questions: [{ id: "q1", type: "NOUL", question: "A?" }],
      },
      goldAnswers: [
        {
          questionId: "q1",
          type: "NOUL",
          value: true,
          probabilityTrue: 1,
          confidence: 1,
        },
      ],
      evidenceRefs: ["evidence-1"],
      outcomeRefs: [],
      policyRefs: [],
      verificationStatus: "VERIFIED",
      labelSource: "VERIFIED_OUTCOME",
      humanReviewed: true,
      synthetic: true,
      fallbackApplied: false,
      trainingEligible: true,
      provenance: {},
      createdAt: new Date().toISOString(),
    } as const;

    expect(() => assertTrainingRecordEligible(record)).toThrow();
  });

  it("records AER-Core disagreement without mutating the baseline", () => {
    const coordinator = new AERCoreShadowCoordinator();
    const primary = {
      batchId: "b1",
      evaluatedAt: new Date().toISOString(),
      answers: [
        {
          questionId: "q1",
          type: "CHOICE",
          selected: "a",
          probabilities: { a: 0.9, b: 0.1 },
          confidence: 0.9,
        },
      ],
      answersById: {
        q1: {
          questionId: "q1",
          type: "CHOICE",
          selected: "a",
          probabilities: { a: 0.9, b: 0.1 },
          confidence: 0.9,
        },
      },
      adapterUsed: "DETERMINISTIC",
      totalLatencyMs: 2,
      minConfidence: 0.9,
      shouldEscalate: false,
      status: "VALID",
    } as const;

    const aerCore = {
      ...primary,
      answers: [
        {
          ...primary.answers[0],
          selected: "b",
          probabilities: { a: 0.2, b: 0.8 },
          confidence: 0.8,
        },
      ],
      answersById: {
        q1: {
          ...primary.answers[0],
          selected: "b",
          probabilities: { a: 0.2, b: 0.8 },
          confidence: 0.8,
        },
      },
      adapterUsed: "AER_CORE",
      totalLatencyMs: 4,
      minConfidence: 0.8,
      adapterMetadata: {
        adapterType: "AER_CORE",
        implementationVersion: "aer-core-v1",
        isProductionAuthority: false,
        isTrainingEligible: false,
        authorityClass: "MODEL_ADVISORY",
        modelRef: "test",
      },
    } as const;

    const record = coordinator.compare(primary, aerCore, ["PRIMARY"]);
    expect(record.agreementRate).toBe(0);
    expect(record.highConfidenceDisagreements).toBe(1);
    expect(primary.answersById.q1.selected).toBe("a");
  });
  it("rejects invalid model distributions without inventing a fallback", () => {
    const errors = validateAERCoreBatch(
      [
        {
          id: "q1",
          type: "CHOICE",
          question: "Which worker?",
          options: ["a", "b"],
        },
      ],
      [
        {
          questionId: "q1",
          type: "CHOICE",
          selected: "a",
          probabilities: { a: 1.4, b: -0.4 },
          confidence: 0.9,
        },
      ],
    );
    expect(errors).toContain("q1:INVALID_DISTRIBUTION");
  });

});
