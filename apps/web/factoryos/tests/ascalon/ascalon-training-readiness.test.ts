/**
 * Project Ascalon — Authoritative Training Readiness Test Suite
 *
 * Verifies that the ShortForge / FactoryOS codebase satisfies all non-negotiable
 * training readiness criteria, schema validation gates, and safety boundaries.
 */

import { describe, it, expect } from "vitest";
import { HierarchyConsistencyValidator, CANONICAL_FLOORS } from "../../core/contracts/HierarchyConsistencyValidator";
import { LLMDecisionAdapter } from "../../core/intelligence/decision/LLMDecisionAdapter";
import { HeuristicTypedDecisionShadowAdapter } from "../../core/intelligence/decision/TypeSafeJevAdapter";
import { DecisionLedger } from "../../core/intelligence/decision/DecisionLedger";
import { WorldStateEngine } from "../../core/worldstate/WorldStateEngine";
import { IndexedExperienceMemory } from "../../core/cognitive/memory/IndexedExperienceMemory";
import { AscalonTrajectoryValidator } from "../../../../../training/ascalon/validators/AscalonTrajectoryValidator";
import { AscalonTrajectoryExporter } from "../../../../../training/ascalon/exporters/AscalonTrajectoryExporter";
import { AscalonReplayEngine } from "../../../../../training/ascalon/generation/trajectory_generator/AscalonReplayEngine";
import { DeterministicTeacher } from "../../../../../training/ascalon/generation/deterministic_teacher/DeterministicTeacher";
import { GoldenTrajectoryBuilder } from "../../../../../training/ascalon/generation/trajectory_generator/GoldenTrajectoryBuilder";

describe("Project Ascalon: Factory Hierarchy & Floor Topology Tests", () => {
  it("1. validates exactly one canonical meaning per floor ID with 8 canonical floors", () => {
    const report = HierarchyConsistencyValidator.validateAll();
    expect(report.valid).toBe(true);
    expect(report.floorCount).toBe(8);
    expect(report.errors).toHaveLength(0);
  });

  it("2. enforces that Floor 03 is strictly Asset Realization and Floor 04 is Media Synthesis", () => {
    const f03 = HierarchyConsistencyValidator.validateFloor("floor03_asset_realization");
    const f04 = HierarchyConsistencyValidator.validateFloor("floor04_media_synthesis");

    expect(f03.number).toBe(3);
    expect(f03.category).toBe("MEDIA");
    expect(f03.canonicalName).toContain("Asset Realization");

    expect(f04.number).toBe(4);
    expect(f04.category).toBe("VOICE");
    expect(f04.canonicalName).toContain("Voice & Audio Synthesis");
  });

  it("3. strictly distinguishes Sovereign Agents from Pipeline Floors", () => {
    expect(HierarchyConsistencyValidator.isSovereignAgent("OVERSEER")).toBe(true);
    expect(HierarchyConsistencyValidator.isSovereignAgent("GUARDIAN")).toBe(true);
    expect(HierarchyConsistencyValidator.isSovereignAgent("SLAYER")).toBe(true);
    expect(HierarchyConsistencyValidator.isSovereignAgent("HEALER")).toBe(true);

    // Assert floors are rejected as agents and vice versa
    expect(() => HierarchyConsistencyValidator.assertNotFloor("OVERSEER")).not.toThrow();
    expect(() => HierarchyConsistencyValidator.assertNotFloor("floor03_asset_realization")).toThrow();

    expect(() => HierarchyConsistencyValidator.assertNotAgent("floor07_compliance")).not.toThrow();
    expect(() => HierarchyConsistencyValidator.assertNotAgent("GUARDIAN")).toThrow();
  });

  it("4. verifies pipeline DAG has no self-referential cycles", () => {
    for (const floorId of Object.keys(CANONICAL_FLOORS)) {
      const floor = CANONICAL_FLOORS[floorId as keyof typeof CANONICAL_FLOORS];
      expect(floor.predecessors).not.toContain(floor.floorId);
      expect(floor.successors).not.toContain(floor.floorId);
    }
  });
});

describe("Project Ascalon: Typed Decision Validation & Anti-Hallucination Tests", () => {
  const adapter = new LLMDecisionAdapter();

  it("5. rejects malformed JSON and returns structured INVALID result without crashing", () => {
    const questions = [
      { id: "q1", type: "NOUL" as const, question: "Is render worker ready?" },
    ];
    const answers = adapter.parseAndValidate("invalid-non-json-string", questions);

    expect(answers).toHaveLength(1);
    expect(answers[0].status).toBe("INVALID");
    expect(answers[0].validationErrorCode).toBe("INVALID_JSON");
    expect(answers[0].confidence).toBe(0.0);
  });

  it("6. rejects CHOICE when model hallucinates an option not in declared options", () => {
    const questions = [
      {
        id: "q_choice",
        type: "CHOICE" as const,
        question: "Select render worker",
        options: ["worker_a", "worker_b"],
      },
    ];

    const modelResponse = JSON.stringify({
      answers: [
        {
          questionId: "q_choice",
          type: "CHOICE",
          valueOrSelected: "worker_hallucinated", // Not in options
          probabilitiesOrScore: { worker_a: 0.5, worker_b: 0.5 },
          confidence: 0.9,
        },
      ],
    });

    const answers = adapter.parseAndValidate(modelResponse, questions);
    expect(answers[0].status).toBe("INVALID");
    expect(answers[0].validationErrorCode).toBe("INVALID_ENUM");
    expect(answers[0].confidence).toBe(0.0);
  });

  it("7. rejects CHOICE with non-normalizing probability distribution", () => {
    const questions = [
      {
        id: "q_choice_dist",
        type: "CHOICE" as const,
        question: "Select compute provider",
        options: ["kaggle", "runpod", "local"],
      },
    ];

    const modelResponse = JSON.stringify({
      answers: [
        {
          questionId: "q_choice_dist",
          type: "CHOICE",
          valueOrSelected: "kaggle",
          // Distribution sums to 1.5 instead of 1.0
          probabilitiesOrScore: { kaggle: 0.9, runpod: 0.4, local: 0.2 },
          confidence: 0.9,
        },
      ],
    });

    const answers = adapter.parseAndValidate(modelResponse, questions);
    expect(answers[0].status).toBe("INVALID");
    expect(answers[0].validationErrorCode).toBe("INVALID_DISTRIBUTION");
  });

  it("8. rejects SCORE with level not matching declared rubric", () => {
    const questions = [
      {
        id: "q_score",
        type: "SCORE" as const,
        question: "Assess hook quality",
        rubric: [
          { level: 1, label: "POOR", description: "Weak hook" },
          { level: 5, label: "EXCELLENT", description: "High engagement hook" },
        ],
      },
    ];

    const modelResponse = JSON.stringify({
      answers: [
        {
          questionId: "q_score",
          type: "SCORE",
          valueOrSelected: 99, // Impossible rubric level
          confidence: 0.8,
        },
      ],
    });

    const answers = adapter.parseAndValidate(modelResponse, questions);
    expect(answers[0].status).toBe("INVALID");
    expect(answers[0].validationErrorCode).toBe("INVALID_RUBRIC_LEVEL");
  });

  it("9. rejects out-of-range confidence values", () => {
    const questions = [
      { id: "q_conf", type: "NOUL" as const, question: "Is video ready?" },
    ];

    const modelResponse = JSON.stringify({
      answers: [
        {
          questionId: "q_conf",
          type: "NOUL",
          valueOrSelected: true,
          probabilitiesOrScore: 0.9,
          confidence: 1.85, // Impossible confidence > 1.0
        },
      ],
    });

    const answers = adapter.parseAndValidate(modelResponse, questions);
    expect(answers[0].status).toBe("INVALID");
    expect(answers[0].validationErrorCode).toBe("INVALID_CONFIDENCE");
  });
});

describe("Project Ascalon: Heuristic Shadow & Provenance Tests", () => {
  it("10. verifies HeuristicTypedDecisionShadowAdapter is marked strictly non-production and training ineligible", async () => {
    const shadowAdapter = new HeuristicTypedDecisionShadowAdapter();
    const result = await shadowAdapter.evaluateBatch({
      batchId: "test_shadow_batch",
      questions: [{ id: "q1", type: "NOUL", question: "Is factory operational?" }],
    });

    expect(result.adapterUsed).toBe("HEURISTIC_SHADOW");
    expect(result.adapterMetadata?.isProductionAuthority).toBe(false);
    expect(result.adapterMetadata?.isTrainingEligible).toBe(false);
    expect(result.answers[0].uncertainty?.calibrationStatus).toBe("UNCALIBRATED");
  });

  it("11. verifies DecisionLedger tags label sources and segregates training eligible records", () => {
    const ledger = new DecisionLedger();
    ledger.recordTransaction(
      {
        batchId: "batch_verified",
        evaluatedAt: new Date().toISOString(),
        answers: [],
        answersById: {},
        adapterUsed: "DETERMINISTIC",
        totalLatencyMs: 10,
        minConfidence: 1.0,
        shouldEscalate: false,
        status: "VALID",
      },
      { verificationResult: "VERIFIED" }
    );

    ledger.recordTransaction(
      {
        batchId: "batch_heuristic",
        evaluatedAt: new Date().toISOString(),
        answers: [],
        answersById: {},
        adapterUsed: "HEURISTIC_SHADOW",
        totalLatencyMs: 5,
        minConfidence: 0.5,
        shouldEscalate: true,
        status: "VALID",
      }
    );

    const all = ledger.getTransactions();
    const eligible = ledger.getTrainingEligibleTransactions();

    expect(all).toHaveLength(2);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].batchId).toBe("batch_verified");
  });
});

describe("Project Ascalon: WorldState & Memory Training Safety", () => {
  it("12. verifies WorldStateEngine snapshot generates deterministic provenance IDs without Math.random", () => {
    const engine = new WorldStateEngine();
    engine.recordProvenance("overseer", "UPDATE_FLOOR", "Online check", "corr_123");
    const log = engine.getProvenanceLog(1);

    expect(log).toHaveLength(1);
    expect(log[0].provenanceId).toMatch(/^prov_[a-f0-9]{12}$/);
    expect(log[0].actor).toBe("overseer");

    const snapshot = engine.getSnapshot("corr_123");
    expect(snapshot.worldStateId).toBeDefined();
    expect(snapshot.schemaVersion).toBe("1.0.0");
    expect(snapshot.sequenceNumber).toBeGreaterThanOrEqual(1);
  });

  it("13. verifies IndexedExperienceMemory defaults unverified/simulated memories to INELIGIBLE", async () => {
    const memory = new IndexedExperienceMemory();
    const entry = await memory.storeExperience({
      category: "ANOMALY_RESOLUTION",
      title: "Simulated worker recovery",
      summary: "Restarted stalled worker in test",
      fullEvidence: { sim: true },
      experienceType: "SIMULATION",
      verificationStatus: "UNVERIFIED",
    });

    expect(entry.trainingEligibility).toBe("INELIGIBLE");
    expect(entry.confidence).toBe(0.5); // Default uncalibrated baseline
  });
});

describe("Project Ascalon: Trajectory Validation & Exporter Tests", () => {
  const golden = GoldenTrajectoryBuilder.generateGoldenDataset();

  it("14. validates all golden trajectories against AscalonTrajectoryValidator", () => {
    for (const traj of golden) {
      const report = AscalonTrajectoryValidator.validate(traj);
      expect(report.valid).toBe(true);
      expect(report.issues).toHaveLength(0);
    }
  });

  it("15. catches secret leakage in trajectories", () => {
    const compromisedTraj = {
      ...golden[0],
      trajectoryId: "traj_leaked",
      observation: {
        ...golden[0].observation,
        secretKey: "AIzaSyD-fakeGoogleApiKey12345678901234",
      },
    };

    const report = AscalonTrajectoryValidator.validate(compromisedTraj);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "SECRET_LEAKAGE")).toBe(true);
  });

  it("16. catches simulation data mislabeled as real VERIFIED_OUTCOME", () => {
    const contaminatedTraj = {
      ...golden[0],
      environment: { environmentType: "SIMULATION" },
      provenance: {
        labelSource: "VERIFIED_OUTCOME", // Contradiction: simulation labeled as verified real outcome
        trainingEligible: true,
        simulation: true,
      },
    };

    const report = AscalonTrajectoryValidator.validate(contaminatedTraj);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "SIMULATION_CONTAMINATION")).toBe(true);
  });

  it("17. catches unverified claims of success (Claim <= Evidence violation)", () => {
    const falseSuccessTraj = {
      ...golden[0],
      outcome: {
        status: "SUCCESS",
        verified: false, // Claiming success without verification!
      },
    };

    const report = AscalonTrajectoryValidator.validate(falseSuccessTraj);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "UNVERIFIED_SUCCESS_CLAIM")).toBe(true);
  });

  it("18. catches hallucinated tool calls", () => {
    const hallucinatedTraj = {
      ...golden[0],
      execution: {
        tool: "cap_invented_magic_render",
        arguments: {},
      },
    };

    const report = AscalonTrajectoryValidator.validate(hallucinatedTraj);
    expect(report.valid).toBe(false);
    expect(report.issues.some((i) => i.code === "HALLUCINATED_TOOL")).toBe(true);
  });

  it("19. verifies deterministic replay equivalence using AscalonReplayEngine", () => {
    for (const traj of golden) {
      const replay = AscalonReplayEngine.replayTrajectory(traj);
      expect(replay.replayEquivalent).toBe(true);
      expect(replay.originalDecision).toBe(replay.replayedDecision);
    }
  });

  it("20. verifies dataset export splits without cross-family leakage", () => {
    const result = AscalonTrajectoryExporter.exportDataset(golden);
    expect(result.splitManifest.totalExported).toBe(golden.length);
    expect(result.rejected).toHaveLength(0);
    expect(result.train.length).toBeGreaterThan(0);
  });
});
