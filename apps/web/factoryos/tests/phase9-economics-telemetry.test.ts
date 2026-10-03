import { describe, it, expect } from "vitest";
import { AgentEconomicsEngine } from "../core/cognitive/economics/AgentEconomicsEngine";

describe("FactoryOS Frontier v2 — Phase 9: Cognitive Economics Telemetry Suite", () => {
  it("1. Real Telemetry Metering: Accurately records token usage, cost, and deterministic bypasses", () => {
    const economics = new AgentEconomicsEngine();

    // Deterministic bypass (Tier 0)
    const route0 = economics.routeTask("Routine single-worker restart", { isDeterministicRuleAvailable: true });
    expect(route0.selectedTier).toBe("DETERMINISTIC");
    economics.recordExecution("DETERMINISTIC", 0, 5, 0);

    // Large Reasoner (Tier 2)
    const route2 = economics.routeTask("Critical multi-floor state desync", { severity: "HIGH" });
    expect(route2.selectedTier).toBe("LARGE_REASONER");
    economics.recordExecution("LARGE_REASONER", 1500, 450, 0.0045);

    const metrics = economics.getMetrics();
    expect(metrics.totalInvocations).toBe(2);
    expect(metrics.deterministicBypassCount).toBe(1);
    expect(metrics.totalTokensConsumed).toBe(1500);
    expect(metrics.totalCostUsd).toBeGreaterThan(0);
  });
});
