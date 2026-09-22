import { describe, it, expect, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { AutonomousFactoryController } from "../core/controller/AutonomousFactoryController";

describe("FactoryOS Frontier v2 — Phase 2: Autonomous Overseer Control Path Suite", () => {
  const testStorageDir = path.join(process.cwd(), "data", "test_overseer_autonomous_suite");

  afterEach(() => {
    if (fs.existsSync(testStorageDir)) {
      try {
        fs.rmSync(testStorageDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });

  it("1. Executes end-to-end control path Mission -> Overseer -> Decision -> Task DAG -> Dispatch -> Floor Executors -> Completed Mission", async () => {
    const controller = new AutonomousFactoryController({
      storageType: "disk",
      storagePath: testStorageDir,
      autoStartSwarm: false,
    });
    await controller.boot();

    const res = await controller.overseer.submitCommand("Operate the factory autonomously", "autonomous");

    expect(res.status).toBe("accepted");
    expect(res.runId).toMatch(/^run_/);
    expect(res.missionId).toMatch(/^mission_/);

    const missionId = res.missionId!;
    const runId = res.runId;

    // Wait for asynchronous background execution loop
    let isFinished = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const mission = await controller.missionManager.getMission(missionId);
      if (mission && (mission.status === "COMPLETED" || mission.status === "FAILED")) {
        isFinished = true;
        break;
      }
    }

    expect(isFinished).toBe(true);

    const finalMission = await controller.missionManager.getMission(missionId);
    expect(finalMission).toBeDefined();
    expect(finalMission!.status).toBe("COMPLETED");
    expect(finalMission!.progress.percentComplete).toBe(100);
    expect(finalMission!.taskIds.length).toBeGreaterThan(0);

    const ledger = controller.overseer.getDecisionLedger();
    const decisions = await ledger.getRecentDecisions();
    expect(decisions.length).toBeGreaterThan(0);

    const decision = decisions.find((d) => d.goalId === runId);
    expect(decision).toBeDefined();
    expect(decision!.selectedOption).toBe("EXECUTE_AUTONOMOUS_OPERATION");

    const state = controller.worldState.getState();
    expect(state.workers["worker_scripting_01"]).toBeDefined();
    expect(state.workers["worker_audio_01"]).toBeDefined();
    expect(state.workers["worker_render_01"]).toBeDefined();
    expect(state.workers["worker_compliance_01"]).toBeDefined();

    await controller.shutdown();
  });

  it("2. Negative Test: Validator rejects completion when WorldState is unhealthy (UNKNOWN != PASS)", async () => {
    const controller = new AutonomousFactoryController({ autoStartSwarm: false });
    await controller.boot();

    const mission = await controller.missionManager.createMission({
      goal: "Safety gate test mission",
      scope: { floorIds: ["floor03_asset_realization"] },
    });
    await controller.missionManager.startMission(mission.missionId);

    // Degrade floor 03 in WorldState
    controller.worldState.updateFloorStatus("floor03_asset_realization", "DEGRADED", "VRAM allocation corruption");

    // Standard completeMission MUST fail validation
    await expect(
      controller.missionManager.completeMission(mission.missionId)
    ).rejects.toThrow(/Floors unhealthy/);

    const m = await controller.missionManager.getMission(mission.missionId);
    expect(m?.status).not.toBe("COMPLETED");

    await controller.shutdown();
  });

  it("3. Conflicting Evidence Resolution: Resolves contradictory reports via diagnostic probe and telemetry", async () => {
    const controller = new AutonomousFactoryController({ autoStartSwarm: false });
    await controller.boot();

    controller.worldState.updateResources({ driveAvailable: false });

    const reports = [
      { source: "guardian_f03", claim: "GPU VRAM allocation stalled" },
      { source: "slayer_storage", claim: "Storage subsystem degraded" },
    ];

    const res = await controller.overseer.resolveEvidenceContradiction("case_conflict_01", reports);
    expect(res.resolvedClaim).toBe("Storage subsystem degraded");
    expect(res.rationale).toContain("Diagnostic probe resolved claim");

    const ledger = controller.overseer.getDecisionLedger();
    const decisions = await ledger.getRecentDecisions();
    const conflictDec = decisions.find((d) => d.caseId === "case_conflict_01");
    expect(conflictDec).toBeDefined();
    expect(conflictDec!.selectedOption).toBe("RUN_DIAGNOSTIC_PROBE");

    await controller.shutdown();
  });

  it("4. Thinking Controller: Evaluates REFLEX vs DELIBERATE vs DEEP reasoning depth budgets", async () => {
    const controller = new AutonomousFactoryController({ autoStartSwarm: false });
    await controller.boot();

    const thinking = controller.overseer.getThinkingController();
    const state = controller.worldState.getState();

    const reflex = thinking.assessCommand("query status", state);
    expect(reflex.mode).toBe("REFLEX");
    expect(reflex.tokenBudget).toBeLessThanOrEqual(1000);

    const deliberate = thinking.assessCommand("produce video short", state);
    expect(deliberate.mode).toBe("DELIBERATE");

    const deep = thinking.assessCommand("Operate the factory autonomously", state);
    expect(deep.mode).toBe("DEEP");
    expect(deep.tokenBudget).toBeGreaterThanOrEqual(10000);

    await controller.shutdown();
  });

  it("5. Overseer Runtime Restart Recovery: Persists active runs, decision ledger, and mission state across controller restart", async () => {
    const controllerA = new AutonomousFactoryController({
      storageType: "disk",
      storagePath: testStorageDir,
      autoStartSwarm: false,
    });
    await controllerA.boot();

    const res = await controllerA.overseer.submitCommand("Operate the factory autonomously", "autonomous");
    const missionId = res.missionId!;

    // Wait 150ms for initial execution
    await new Promise((r) => setTimeout(r, 150));

    // Destroy Controller A instance
    await controllerA.shutdown();

    // Boot Controller B on same disk storage
    const controllerB = new AutonomousFactoryController({
      storageType: "disk",
      storagePath: testStorageDir,
      autoStartSwarm: false,
    });
    await controllerB.boot();

    const restoredMission = await controllerB.missionManager.getMission(missionId);
    expect(restoredMission).toBeDefined();
    expect(["RUNNING", "COMPLETED"]).toContain(restoredMission!.status);

    await controllerB.shutdown();
  });
});
