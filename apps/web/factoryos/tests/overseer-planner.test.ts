import { describe, it, expect, beforeEach } from "vitest";
import { OverseerThinkingController } from "../core/overseer/OverseerThinkingController";
import { DecisionLedger } from "../core/overseer/DecisionLedger";
import { TaskDAGPlanner, TaskDAGExecutor } from "../core/overseer/TaskDAGPlanner";
import { WorldStateEngine } from "../core/worldstate/WorldStateEngine";
import { LeaseManager } from "../core/leases/LeaseManager";
import type { TaskNode } from "../core/contracts/OverseerThinkingContracts";

describe("FactoryOS v1 — Overseer Thinking, Planning & Decision Suite", () => {
  let thinkingController: OverseerThinkingController;
  let decisionLedger: DecisionLedger;
  let dagPlanner: TaskDAGPlanner;
  let dagExecutor: TaskDAGExecutor;
  let worldState: WorldStateEngine;

  beforeEach(() => {
    thinkingController = new OverseerThinkingController();
    decisionLedger = new DecisionLedger();
    dagPlanner = new TaskDAGPlanner();
    dagExecutor = new TaskDAGExecutor();
    worldState = new WorldStateEngine();
  });

  it("01: Thinking controller dynamically selects mode (Reflex, Deliberate, Deep)", () => {
    const s = worldState.getState();

    const reflex = thinkingController.assessCommand("What is the current floor status?", s);
    expect(reflex.mode).toBe("REFLEX");
    expect(reflex.maxPlanningDepth).toBe(1);

    const deliberate = thinkingController.assessCommand("Produce a new 60s financial quiz video", s);
    expect(deliberate.mode).toBe("DELIBERATE");
    expect(deliberate.maxPlanningDepth).toBe(3);

    const deep = thinkingController.assessCommand("Operate the factory autonomously in deep mode", s);
    expect(deep.mode).toBe("DEEP");
    expect(deep.maxPlanningDepth).toBe(5);
  });

  it("02: Decision ledger persists options, selected choice, and trajectory learning data", async () => {
    const dec = await decisionLedger.record({
      goalId: "goal_001",
      stateSnapshot: { factoryStatus: "OPERATIONAL" },
      thinkingMode: "DELIBERATE",
      availableOptions: ["OPTION_A", "OPTION_B"],
      selectedOption: "OPTION_A",
      reasoningSummary: "Option A has lowest blast radius",
      predictedOutcome: "100% pass",
      agentsUsed: ["overseer"],
      toolsUsed: ["tool.calc"],
      executionTimeMs: 120,
    });

    expect(dec.decisionId).toMatch(/^dec_/);
    expect(dec.selectedOption).toBe("OPTION_A");

    await decisionLedger.updateActualOutcome(dec.decisionId, "Passed with 0 errors", 0.0, ["Rule confirmed"]);
    const recent = await decisionLedger.getRecentDecisions();
    expect(recent[0].actualOutcome).toBe("Passed with 0 errors");
  });

  it("03: TaskDAGPlanner creates and executes parallel multi-node DAG with dependencies", async () => {
    const nodes: TaskNode[] = [
      {
        taskId: "task_1",
        name: "Generate Script",
        description: "Floor 02 script generation",
        requiredAgentType: "TOOL",
        dependencies: [],
        payload: { prompt: "AI news" },
        status: "PENDING",
        attemptCount: 0,
        maxAttempts: 2,
      },
      {
        taskId: "task_2",
        name: "Generate Audio Narration",
        description: "Floor 03 audio generation",
        requiredAgentType: "TOOL",
        dependencies: ["task_1"],
        payload: { voice: "en-US-GuyNeural" },
        status: "PENDING",
        attemptCount: 0,
        maxAttempts: 2,
      },
      {
        taskId: "task_3",
        name: "Render Video",
        description: "Final FFmpeg video render",
        requiredAgentType: "TOOL",
        dependencies: ["task_2"],
        payload: { resolution: "1080x1920" },
        status: "PENDING",
        attemptCount: 0,
        maxAttempts: 2,
      },
    ];

    const dag = dagPlanner.createDAG("goal_e2e", nodes);
    expect(dag.rootTaskIds).toEqual(["task_1"]);

    const executedDAG = await dagExecutor.executeDAG(dag, {
      TOOL: async (node) => ({ output: `Done ${node.name}` }),
    });

    expect(executedDAG.status).toBe("COMPLETED");
    expect(executedDAG.nodes["task_1"].status).toBe("SUCCEEDED");
    expect(executedDAG.nodes["task_2"].status).toBe("SUCCEEDED");
    expect(executedDAG.nodes["task_3"].status).toBe("SUCCEEDED");
  });
});


  it("04: TaskDAGExecutor never executes a task when its lease claim is rejected", async () => {
    const leaseManager = new LeaseManager(undefined, 60000);
    await leaseManager.acquire("task_locked", "other-worker", 60000, 1);

    const guardedExecutor = new TaskDAGExecutor(undefined, undefined, leaseManager);
    const dag = dagPlanner.createDAG("goal_locked", [{
      taskId: "task_locked",
      name: "Locked task",
      description: "Must not execute without a lease",
      requiredAgentType: "TOOL",
      dependencies: [],
      payload: {},
      status: "PENDING",
      attemptCount: 0,
      maxAttempts: 1,
    }]);

    let executed = false;
    const result = await guardedExecutor.executeDAG(dag, {
      TOOL: async () => {
        executed = true;
        return { output: "must not happen" };
      },
    });

    expect(executed).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.nodes.task_locked.status).toBe("FAILED");
    expect(result.nodes.task_locked.error).toContain("TASK_LEASE_UNAVAILABLE");
  });
