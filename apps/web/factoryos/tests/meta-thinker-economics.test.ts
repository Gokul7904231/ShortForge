import { describe, it, expect, beforeEach } from "vitest";
import { StrategicMetaThinker } from "../core/cognitive/meta/StrategicMetaThinker";
import { WorldStateEngine } from "../core/worldstate/WorldStateEngine";
import type { Case } from "../core/contracts/CaseContracts";

describe("Strategic Meta-Thinker", () => {
  let metaThinker: StrategicMetaThinker;
  let worldState: WorldStateEngine;

  beforeEach(() => {
    metaThinker = new StrategicMetaThinker();
    worldState = new WorldStateEngine();
  });

  it("01: Meta-Thinker identifies stuck investigation and excessive recursion", () => {
    const mockCase: Case = {
      caseId: "case_meta_01",
      title: "Stubborn render failure",
      description: "Stuck in loop",
      floorId: "floor03_asset_realization",
      category: "FLOOR_EXECUTION_ERROR",
      severity: "CRITICAL",
      priority: 1,
      status: "INVESTIGATING",
      detectorId: "slayer_rendering",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      symptoms: [],
      observedState: {},
      evidence: [],
      hypotheses: [],
      linkedCaseIds: [],
      assignedHealerIds: ["healer_diagnostic"],
      healerCountAllocated: 1,
      timeline: [],
    };

    const evalResult = metaThinker.evaluateStrategy(mockCase, worldState.getState(), {
      currentPlanSteps: ["Investigate", "Repair"],
      completedSteps: [],
      evidenceCount: 18,
      iterationCount: 7,
      elapsedTimeMs: 50000,
      activeAgents: ["healer_diagnostic"],
      isRepetitiveTelemetry: true,
    });

    expect(evalResult.isInvestigationStuck).toBe(true);
    expect(evalResult.isCollectingUselessEvidence).toBe(true);
    expect(evalResult.isRecursionExcessive).toBe(true);
    expect(evalResult.shouldReplan).toBe(true);
    expect(evalResult.shouldChangeAllocation).toBe(true);
    expect(evalResult.recommendedAdjustments.length).toBeGreaterThan(0);
  });


});
