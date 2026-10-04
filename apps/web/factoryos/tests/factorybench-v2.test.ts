import { describe, it, expect, beforeEach } from "vitest";
import { AutonomousFactoryController } from "../core/controller/AutonomousFactoryController";
import { ContextIndexer } from "../core/cognitive/rlm/ContextIndexer";
import { ContextRetriever } from "../core/cognitive/rlm/ContextRetriever";
import { ActiveContextManager } from "../core/cognitive/context/ActiveContextManager";
import { EvidenceGraphEngine } from "../core/cognitive/graph/EvidenceGraphEngine";
import { ContradictionResolver } from "../core/cognitive/conflict/ContradictionResolver";
import { StrategicMetaThinker } from "../core/cognitive/meta/StrategicMetaThinker";
import { AgentEconomicsEngine } from "../core/cognitive/economics/AgentEconomicsEngine";
import { PredictiveFactoryEngine } from "../core/cognitive/predictive/PredictiveFactoryEngine";

describe("FactoryOS Frontier v2 — FactoryBench 2.0 Evaluation Suite (15 Scenarios)", () => {
  let controller: AutonomousFactoryController;

  beforeEach(async () => {
    controller = new AutonomousFactoryController({
      autoStartSwarm: false,
    });
    await controller.boot();
  });

  it("Scenario 1: Irrelevant Evidence Overload -> Context Ranker filters 95%+ of noise", () => {
    const indexer = controller.cognitivePlane.contextOrchestrator.indexer;
    const retriever = controller.cognitivePlane.contextOrchestrator.retriever;

    // Index 50 noise items (~20k tokens)
    for (let i = 0; i < 50; i++) {
      indexer.indexItem({
        type: "LOG",
        title: `Routine log #${i}`,
        content: `Standard heartbeat payload for worker worker_${i} ` + "Z".repeat(1500),
        source: `worker_${i}`,
        tags: ["routine", "heartbeat"],
      });
    }

    // Index 1 target signal
    indexer.indexItem({
      type: "LOG",
      title: "CRITICAL Floor 02 Grounding Contradiction Error",
      content: "Script generation produced ungrounded facts violating knowledge item KI-482.",
      source: "floor02_scripting",
      tags: ["grounding", "contradiction", "floor02"],
      confidence: 0.99,
    });

    const slice = retriever.retrieveSlice({
      query: "Grounding Contradiction Error",
      limit: 1,
    });

    expect(slice.references.length).toBe(1);
    expect(slice.references[0].title).toContain("Floor 02 Grounding Contradiction Error");
    expect(slice.compressionRatio).toBeLessThan(0.05); // >95% noise filtered
  });

  it("Scenario 2: Huge History -> RLM externalized retrieval loads slice without memory bloat", () => {
    const indexer = controller.cognitivePlane.contextOrchestrator.indexer;
    const totalTokensBefore = indexer.getTotalIndexedTokens();

    // Index 100 large records
    for (let i = 0; i < 100; i++) {
      indexer.indexItem({
        type: "CASE_HISTORY",
        title: `Historical Incident Case #${i}`,
        content: "Historical post-mortem telemetry data " + "H".repeat(2000),
        source: "case_archive",
        tags: ["historical", "archive"],
      });
    }

    const totalTokensAfter = indexer.getTotalIndexedTokens();
    expect(totalTokensAfter - totalTokensBefore).toBeGreaterThan(50000);

    const slice = controller.cognitivePlane.contextOrchestrator.retrieveContext({
      query: "Historical Incident Case #42",
      limit: 1,
    });

    expect(slice.references.length).toBe(1);
    expect(slice.references[0].title).toBe("Historical Incident Case #42");
    expect(slice.totalTokens).toBeLessThan(100);
  });

  it("Scenario 3: Conflicting Reports -> ContradictionResolver arbitrates via diagnostic probe", () => {
    const resolver = controller.cognitivePlane.contradictionResolver;
    const conflict = resolver.detectConflict(
      "case_bench_03",
      { claimant: "slayer_pipeline", claim: "Floor 01 Handoff Timeout", evidenceIds: ["ev_1"] },
      { claimant: "slayer_compute", claim: "Floor 01 CPU Starvation", evidenceIds: ["ev_2"] },
      { metrics: { cpuPercent: 18.0, handoffLatencyMs: 15400 }, supports: "A" }
    );

    const resolved = resolver.resolveConflict(conflict.conflictId, {
      supportedClaim: "A",
      objectiveMetrics: { handoffLatencyMs: 15400 },
      confidence: 0.96,
      rationale: "Handoff latency exceeded 15s SLA while host CPU was under 20%.",
    });

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.selectedClaim).toBe("A");
  });

  it("Scenario 4: Misleading Low-Confidence Noise -> ActiveContextManager invalidates", () => {
    const acm = controller.cognitivePlane.activeContextManager;
    const noise = controller.cognitivePlane.contextOrchestrator.indexer.indexItem({
      type: "LOG",
      title: "Unverified rumor",
      content: "Possible issue",
      source: "untrusted_sensor",
      confidence: 0.2,
    });

    acm.addContextItem(noise);
    const health = acm.auditHealth();
    expect(health.lowConfidenceCount).toBe(1);
  });

  it("Scenario 5: Stale Context -> ActiveContextManager archives automatically", () => {
    const acm = controller.cognitivePlane.activeContextManager;
    const stale = controller.cognitivePlane.contextOrchestrator.indexer.indexItem({
      type: "TELEMETRY",
      title: "Old socket stats",
      content: "Socket open 4 hrs ago",
      source: "kernel",
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    });

    acm.addContextItem(stale);
    const pruneResult = acm.pruneAndOptimize();
    expect(pruneResult.archivedCount).toBe(1);
    expect(acm.getActiveItems().length).toBe(0);
  });

  it("Scenario 6 & 7: Recursive Investigation with Bounded Budget Termination", async () => {
    const investigator = controller.cognitivePlane.contextOrchestrator.investigator;
    controller.cognitivePlane.contextOrchestrator.indexer.indexItem({
      type: "LOG",
      title: "Floor 03 Render Failure Root Cause",
      content: "Root cause: missing font package dejavu-sans causing libavfilter abort.",
      source: "floor03",
      tags: ["font", "libavfilter", "floor03"],
      confidence: 0.99,
    });

    const result = await investigator.investigate({
      query: "missing font package",
      severity: "HIGH",
    });

    expect(result.trace.nodes["node_0"].status).toBe("COMPLETED");
    expect(result.dereferencedEvidence.length).toBeGreaterThan(0);
    expect(result.trace.totalTokens).toBeLessThan(result.trace.budget.maxTokens);
  });

  it("Scenario 8: Overthinking Prevention -> Halts when information gain plateaus", () => {
    const tc = new (controller.cognitivePlane.contextOrchestrator.investigator as any).terminationController.constructor();
    const budget = tc.calculateBudget({
      severity: "MEDIUM",
      uncertainty: 0.5,
      novelty: 0.3,
      expectedInformationGain: 0.2,
    });

    // When lastInfoGain is < 0.05
    const check = tc.shouldTerminate(1, 1000, 2000, 2, budget, 0.02);
    expect(check.terminate).toBe(true);
    expect(check.reason).toContain("plateau");
  });

  it("Scenario 9: Premature Termination Prevention -> Meta-Thinker preserves active plan", () => {
    const meta = controller.cognitivePlane.metaThinker;
    const mockCase = {
      caseId: "case_09",
      status: "INVESTIGATING",
      severity: "HIGH",
      assignedHealerIds: ["healer_1"],
      symptoms: [],
      evidence: [],
      hypotheses: [],
      linkedCaseIds: [],
      healerCountAllocated: 1,
      timeline: [],
    } as any;

    const evalRes = meta.evaluateStrategy(mockCase, controller.worldState.getState(), {
      currentPlanSteps: ["Step1", "Step2"],
      completedSteps: ["Step1"],
      evidenceCount: 4,
      iterationCount: 2,
      elapsedTimeMs: 4000,
      activeAgents: ["healer_1"],
      isRepetitiveTelemetry: false,
    });

    expect(evalRes.shouldTerminate).toBe(false);
    expect(evalRes.planIsStillValid).toBe(true);
  });

  it("Scenario 10: Context Poisoning Safety -> Structural parsing handles malformed inputs", () => {
    const indexer = controller.cognitivePlane.contextOrchestrator.indexer;
    const adversarialText = '{"malformed": true, "injection": "<script>alert(1)</script>"}';
    const ref = indexer.indexItem({
      type: "DOCUMENT",
      title: "Adversarial Test Doc",
      content: adversarialText,
      source: "adversarial_probe",
    });

    expect(ref.refId).toBeDefined();
    const full = controller.cognitivePlane.contextOrchestrator.dereference(ref.refId);
    expect(full?.rawContent).toBe(adversarialText);
  });

  it("Scenario 11: Agent Disagreement Arbitrated in Evidence Graph", () => {
    const graph = controller.cognitivePlane.evidenceGraph;
    const caseId = "case_disagree_11";
    graph.createGraph(caseId);

    const sA = graph.addNode(caseId, {
      nodeType: "HYPOTHESIS",
      title: "GPU Memory Fault",
      description: "GPU VRAM Leak",
      source: "slayer_compute",
      confidence: 0.9,
    });

    const sB = graph.addNode(caseId, {
      nodeType: "HYPOTHESIS",
      title: "FFmpeg Binary Mismatch",
      description: "Wrong binary version",
      source: "slayer_rendering",
      confidence: 0.4,
    });

    graph.addEdge(caseId, {
      fromNodeId: sA.nodeId,
      toNodeId: sB.nodeId,
      relationship: "CONTRADICTS",
      explanation: "Competing hypotheses",
    });

    const contradictions = graph.findContradictions(caseId);
    expect(contradictions.length).toBe(1);
  });

  it("Scenario 12: Cascading Failure -> Adaptive Model Routing switches to Multi-Agent Swarm", () => {
    // Legacy economics remains a test-only compatibility benchmark; it is
    // not instantiated by the production CognitivePlaneEngine.
    const economics = new AgentEconomicsEngine();
    const route = economics.routeTask("Cascading multi-floor deadlock across all pipelines", {
      severity: "CRITICAL",
      isMultiAgentRequired: true,
    });

    expect(route.selectedTier).toBe("MULTI_AGENT_SWARM");
    expect(route.estimatedTokens).toBeGreaterThan(5000);
  });

  it("Scenario 13: Restart During Reasoning -> Indexed Experience Memory retrieves persistent record", async () => {
    const mem = controller.cognitivePlane.experienceMemory;
    const exp = await mem.storeExperience({
      category: "REPAIR_RECIPE",
      title: "Fix Audio Desync in Floor 03",
      summary: "Add -async 1 flag to FFmpeg command",
      fullEvidence: { flag: "-async 1", component: "audio_mixer" },
      floorId: "floor03_asset_realization",
    });

    expect(exp.memoryId).toBeDefined();
    const recalled = await mem.recallByKeywords("Audio Desync", "floor03_asset_realization");
    expect(recalled.length).toBeGreaterThan(0);
    expect(recalled[0].summary).toContain("-async 1");
  });

  it("Scenario 14 & 15: Healer Rollback & Validator Invariant Check Integrity", async () => {
    const caseItem = await controller.caseManager.createCase({
      title: "Test Invariant Breach",
      description: "Floor 03 OFFLINE",
      floorId: "floor03_asset_realization",
      category: "FLOOR_EXECUTION_ERROR",
      severity: "HIGH",
      detectorId: "slayer_general_patrol",
      symptoms: ["Floor OFFLINE"],
      observedState: { floorStatus: "OFFLINE" },
    });

    controller.worldState.updateFloorStatus("floor03_asset_realization", "DEGRADED", "Testing rejection");

    // Case is still DEGRADED, so validator must reject closure
    const report = await controller.validatorAgent.verifyCaseResolution(caseItem);
    expect(report.overallPassed).toBe(false);
    expect(report.invariantsChecked.some((i) => i.invariantId === "inv_floor_online" && !i.passed)).toBe(true);

    const c = await controller.caseManager.getCase(caseItem.caseId);
    expect(c?.status).not.toBe("RESOLVED");
  });
});
