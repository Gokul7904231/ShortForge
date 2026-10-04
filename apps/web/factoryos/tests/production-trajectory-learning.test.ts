import { describe, expect, it } from "vitest";
import { ProductionTrajectoryEvaluator, observationFromLoopReceipt } from "../core/observability/ProductionTrajectory";
import { TrajectoryLearningBridge } from "../core/cognitive/TrajectoryLearningBridge";
import { CognitiveOutcomeLearner } from "../core/cognitive/CognitiveOutcomeLearner";
import { IndexedExperienceMemory } from "../core/cognitive/memory/IndexedExperienceMemory";
import type { FloorClosedLoopReceipt } from "../core/governance/FloorClosedLoop";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { ProductionTrajectoryCollector } from "../core/observability/ProductionTrajectoryCollector";

function receipt(floorId: string, verified = true, iterations = 1): FloorClosedLoopReceipt {
  return {
    floorId,
    loopType:
      floorId === "floor06_rendering"
        ? "DETERMINISTIC_OPERATIONAL"
        : floorId === "floor07_compliance"
          ? "VERIFICATION_REMEDIATION"
          : floorId === "floor00_analyst"
            ? "BOUNDED_FEEDBACK"
            : "COGNITIVE_EXECUTION",
    loopId: "loop_" + floorId,
    termination: verified ? "COMPLETED" : "EXHAUSTED",
    iterations,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    verified,
    evidenceRefs: ["evidence:" + floorId],
    proofSource:
      floorId === "floor06_rendering" || floorId === "floor07_compliance"
        ? "PHYSICAL_VERIFIER"
        : "RUNTIME",
  };
}

describe("Production trajectory proof + Ascalon learning eligibility", () => {
  it("rejects partial trajectories as training data instead of silently promoting them", () => {
    const observations = [
      "floor00_analyst",
      "floor01_strategy",
      "floor02_scripting",
      "floor03_asset_realization",
      "floor04_media_synthesis",
      "floor05_timeline_composition",
      "floor06_rendering",
    ].map((floorId) => observationFromLoopReceipt(receipt(floorId)));

    const trajectory = ProductionTrajectoryEvaluator.evaluate({
      missionId: "mission-partial-proof",
      startedAt: new Date().toISOString(),
      floorObservations: observations,
    });

    expect(trajectory.verificationStatus).toBe("PARTIAL");
    expect(trajectory.verifiedFloorCount).toBe(7);
    expect(trajectory.trainingEligible).toBe(false);
    expect(trajectory.floors.find((floor) => floor.floorId === "floor07_compliance")?.proofLevel).toBe("NONE");
  });

  it("promotes only a fully verified eight-floor trajectory into Ascalon learning memory", async () => {
    const observations = [
      "floor00_analyst",
      "floor01_strategy",
      "floor02_scripting",
      "floor03_asset_realization",
      "floor04_media_synthesis",
      "floor05_timeline_composition",
      "floor06_rendering",
      "floor07_compliance",
    ].map((floorId) => observationFromLoopReceipt(receipt(floorId, true, floorId === "floor06_rendering" ? 2 : 1)));

    const trajectory = ProductionTrajectoryEvaluator.evaluate({
      missionId: "mission-full-proof",
      runId: "run-full-proof",
      startedAt: new Date(Date.now() - 1000).toISOString(),
      floorObservations: observations,
    });

    expect(trajectory.verificationStatus).toBe("VERIFIED");
    expect(trajectory.finalOutcome).toBe("SUCCESS");
    expect(trajectory.trainingEligible).toBe(true);
    expect(trajectory.recoveredIterations).toBe(1);
    expect(trajectory.evidenceRefs).toHaveLength(8);

    const memory = new IndexedExperienceMemory();
    const learner = new CognitiveOutcomeLearner(memory);
    const bridge = new TrajectoryLearningBridge(learner);
    const result = await bridge.recordVerifiedTrajectory(trajectory, true);

    expect(result.signal.verificationStatus).toBe("VERIFIED");
    expect(result.signal.trainingEligible).toBe(true);
    expect(result.signal.trajectoryId).toBe(trajectory.trajectoryId);
    expect(result.memory.verificationStatus).toBe("VERIFIED");
    expect(result.memory.experienceType).toBe("REAL_OPERATIONAL");
    expect(result.memory.trainingEligibility).toBe("ELIGIBLE");
    expect(result.memory.outcomeStatus).toBe("SUCCESS");
    expect(result.memory.authority).toBe("AUTHORITATIVE");
  });

  it("denies Ascalon learning when authority evidence is violated", async () => {
    const observations = [
      "floor00_analyst",
      "floor01_strategy",
      "floor02_scripting",
      "floor03_asset_realization",
      "floor04_media_synthesis",
      "floor05_timeline_composition",
      "floor06_rendering",
      "floor07_compliance",
    ].map((floorId) => observationFromLoopReceipt(receipt(floorId)));

    const trajectory = ProductionTrajectoryEvaluator.evaluate({
      missionId: "mission-authority-breach",
      startedAt: new Date().toISOString(),
      floorObservations: observations,
      authorityViolations: ["worker_attempted_release_without_guardian"],
    });

    expect(trajectory.verificationStatus).toBe("FAILED");
    expect(trajectory.trainingEligible).toBe(false);

    const learner = new CognitiveOutcomeLearner(new IndexedExperienceMemory());
    const bridge = new TrajectoryLearningBridge(learner);
    await expect(bridge.recordVerifiedTrajectory(trajectory, true)).rejects.toThrow("ASCALON_LEARNING_DENIED");
  });
  it("projects live TASK_COMPLETED events without promoting handoff-only evidence", async () => {
    const bus = new DurableEventBus();
    const collector = new ProductionTrajectoryCollector(bus);
    collector.start();

    const missionId = "mission-live-event-proof";
    const floorIds = [
      "floor00_analyst",
      "floor01_strategy",
      "floor02_scripting",
      "floor03_asset_realization",
      "floor04_media_synthesis",
      "floor05_timeline_composition",
    ];

    for (const floorId of floorIds) {
      await bus.publish("TASK_COMPLETED", {
        missionId,
        floorId,
        status: "OK",
        output: { handoff_status: "VALIDATED", floor_id: floorId },
      });
    }

    await bus.publish("TASK_COMPLETED", {
      missionId,
      floorId: "floor06_rendering",
      loopReceipt: receipt("floor06_rendering", true, 2),
    });

    const trajectory = await collector.finalize(missionId, new Date().toISOString());

    expect(trajectory.verifiedFloorCount).toBe(1);
    expect(trajectory.verificationStatus).toBe("PARTIAL");
    expect(trajectory.trainingEligible).toBe(false);
    expect(
      trajectory.floors.find((floor) => floor.floorId === "floor01_strategy")?.proofLevel,
    ).toBe("HANDOFF_CONTRACT");

    collector.dispose();
  });

  it("emits an Ascalon learning signal only after a fully verified live event trajectory", async () => {
    const bus = new DurableEventBus();
    const memory = new IndexedExperienceMemory();
    const learner = new CognitiveOutcomeLearner(memory, new AgentEconomicsEngine());
    const bridge = new TrajectoryLearningBridge(learner);
    const collector = new ProductionTrajectoryCollector(bus, bridge);
    collector.start();

    const signalEvents: any[] = [];
    bus.subscribe("ASCALON_LEARNING_SIGNAL_RECORDED", async (event) => {
      signalEvents.push(event);
    });

    const missionId = "mission-live-learning";
    collector.setPrediction(missionId, true);

    const floorIds = [
      "floor00_analyst",
      "floor01_strategy",
      "floor02_scripting",
      "floor03_asset_realization",
      "floor04_media_synthesis",
      "floor05_timeline_composition",
    ];

    for (const floorId of floorIds) {
      await bus.publish("TASK_COMPLETED", {
        missionId,
        floorId,
        loopReceipt: receipt(floorId),
      });
    }

    await bus.publish("TASK_COMPLETED", {
      missionId,
      floorId: "floor06_rendering",
      loopReceipt: receipt("floor06_rendering", true, 2),
    });
    await bus.publish("TASK_COMPLETED", {
      missionId,
      floorId: "floor07_compliance",
      loopReceipt: receipt("floor07_compliance"),
    });

    const trajectory = await collector.finalize(missionId);

    expect(trajectory.trainingEligible).toBe(true);
    expect(signalEvents).toHaveLength(1);
    expect(signalEvents[0].payload.trajectoryId).toBe(trajectory.trajectoryId);
    expect(signalEvents[0].payload.trainingEligible).toBe(true);

    collector.dispose();
  });

});
