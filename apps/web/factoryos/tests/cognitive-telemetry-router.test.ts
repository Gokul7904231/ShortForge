import { describe, it, expect, beforeEach } from "vitest";
import { CognitiveTelemetryTracker } from "../core/cognitive/telemetry/CognitiveTelemetryTracker";
import { CapabilityRouter } from "../core/cognitive/routing/CapabilityRouter";

describe("FactoryOS Frontier v2 — Cognitive Telemetry & Capability Router Suite", () => {
  let tracker: CognitiveTelemetryTracker;
  let router: CapabilityRouter;

  beforeEach(() => {
    tracker = new CognitiveTelemetryTracker();
    router = new CapabilityRouter();
  });

  it("01: Cognitive Telemetry records reasoning provenance, tools considered, and cost metrics", () => {
    const trace = tracker.recordTrace({
      missionId: "mission_tel_01",
      runId: "run_tel_01",
      decisionId: "dec_tel_01",
      contextRetrieved: [{ refId: "ref_1", title: "Render Telemetry", tokenCount: 150 }],
      contextRejected: [{ refId: "ref_2", reason: "Stale telemetry (>2hr old)" }],
      toolsConsidered: ["tool_internal_telemetry", "tool_agent_reach"],
      toolSelected: "tool_internal_telemetry",
      reasoningMode: "DELIBERATE",
      confidence: 0.94,
      prediction: "Telemetry query will reveal socket timeout",
      actualResult: "Socket timeout confirmed",
      verificationPassed: true,
      latencyMs: 120,
      tokensConsumed: 450,
      costUsd: 0.0009,
      recursionDepth: 1,
      replanCount: 0,
    });

    expect(trace.recordId).toMatch(/^cogtel_/);
    expect(trace.toolsConsidered.length).toBe(2);

    const aggregates = tracker.getAggregateMetrics();
    expect(aggregates.totalTraces).toBe(1);
    expect(aggregates.totalTokens).toBe(450);
    expect(aggregates.totalCostUsd).toBe(0.0009);
    expect(aggregates.verificationSuccessRate).toBe(1.0);
  });

  it("02: Capability Router filters by permission and selects lowest risk, highest reliability tool", () => {
    const result = router.routeCapability({
      taskDescription: "Inspect host telemetry metrics",
      targetCategory: "TELEMETRY",
      maxRiskTolerance: 0.2,
      callerPermissions: ["telemetry:read"],
    });

    expect(result.selectedTool.toolId).toBe("tool_internal_telemetry");
    expect(result.selectedTool.riskScore).toBe(0.0);
    expect(result.selectedTool.reliabilityScore).toBe(0.99);
  });

  it("03: Capability Router rejects tool execution when caller lacks required permissions", () => {
    expect(() => {
      router.routeCapability({
        taskDescription: "Perform floor transactional repair",
        targetCategory: "FLOOR_ACTION",
        callerPermissions: ["read_only_guest"], // Missing floor:mutate
      });
    }).toThrow(/No permitted capability tool found/);
  });
});
