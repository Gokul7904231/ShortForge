import { describe, it, expect, beforeEach } from "vitest";
import { StrategicMetaThinker } from "../core/cognitive/meta/StrategicMetaThinker";
import { AgentEconomicsEngine } from "../core/cognitive/economics/AgentEconomicsEngine";
import { WorldStateEngine } from "../core/worldstate/WorldStateEngine";
import type { Case } from "../core/contracts/CaseContracts";

describe("FactoryOS Frontier v2 — Strategic Meta-Thinker & Agent Economics Suite", () => {
  let metaThinker: StrategicMetaThinker;
  let economics: AgentEconomicsEngine;
  let worldState: WorldStateEngine;

  beforeEach(() => {
    metaThinker = new StrategicMetaThinker();
    economics = new AgentEconomicsEngine();
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

  it("02: Agent Economics routes tasks to the minimal required model tier", () => {
    // 1. Deterministic bypass
    const route0 = economics.routeTask("Check invariant: is Floor 01 online?", {
      isDeterministicRuleAvailable: true,
    });
    expect(route0.selectedTier).toBe("DETERMINISTIC");
    expect(route0.estimatedCost).toBe(0);

    // 2. Small fast model
    const route1 = economics.routeTask("Format summary text for UI", {
      severity: "LOW",
    });
    expect(route1.selectedTier).toBe("SMALL_FAST");
    expect(route1.estimatedCost).toBeLessThan(0.001);

    // 3. Large reasoner
    const route2 = economics.routeTask("Diagnose grounding contradiction on Floor 02", {
      severity: "HIGH",
    });
    expect(route2.selectedTier).toBe("LARGE_REASONER");

    // 4. Recursive RLM
    const route3 = economics.routeTask("Investigate ambiguous intermittent socket timeout across clusters", {
      isAmbiguous: true,
    });
    expect(route3.selectedTier).toBe("RECURSIVE_RLM");

    // 5. Multi-agent swarm
    const route4 = economics.routeTask("Full factory emergency: cascading deadlock across Floor 01, 02, and 03", {
      severity: "CRITICAL",
    });
    expect(route4.selectedTier).toBe("MULTI_AGENT_SWARM");
  });

  it("03: Tracks cumulative token usage, cost, and latency metrics", () => {
    economics.recordExecution("DETERMINISTIC", 0, 5, 0);
    economics.recordExecution("SMALL_FAST", 500, 120, 0.0005);
    economics.recordExecution("LARGE_REASONER", 2000, 800, 0.006);

    const metrics = economics.getMetrics();
    expect(metrics.totalInvocations).toBe(3);
    expect(metrics.deterministicBypassCount).toBe(1);
    expect(metrics.totalTokensConsumed).toBe(2500);
    expect(metrics.totalCostUsd).toBeGreaterThan(0);
    expect(metrics.averageLatencyMs).toBeGreaterThan(0);
  });
});
