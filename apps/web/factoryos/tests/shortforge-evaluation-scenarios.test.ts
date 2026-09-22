/**
 * FactoryOS — 6 ShortForge Evaluation Scenarios & Failure Degradation Tests
 * Mandated in Prompt Section 19 & 20.
 */

import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import fs from "fs";
import { IntelligenceGateway } from "../core/intelligence/IntelligenceGateway";
import { RuntimeStateProvider } from "../core/intelligence/runtime/RuntimeStateProvider";

describe("FactoryOS — 6 ShortForge Evaluation Scenarios & Failure Tests", () => {
  let gateway: IntelligenceGateway;
  let customRuntime: RuntimeStateProvider;

  beforeEach(() => {
    customRuntime = new RuntimeStateProvider({
      factoryStatus: "HEALTHY",
      currentBlockers: ["basic_fastapi_pool_01: GPU memory saturated on Job #9812"],
    });

    gateway = new IntelligenceGateway({
      customRuntime,
    });
  });

  // ─── Scenario 1: Where is the rendering pipeline implemented? ────────────────
  it("Scenario 1: answers 'Where is the rendering pipeline implemented?' with structural evidence", async () => {
    const query = "Where is the rendering pipeline implemented?";
    const plan = gateway.retrievalPlanner.plan(query);
    expect(plan.intent).toBe("CODE_LOCATION");
    expect(plan.targetSources).toContain("STRUCTURAL");

    const result = await gateway.retrievalPlanner.retrieve(query);
    expect(result.items.length).toBeGreaterThan(0);

    // Context Capsule validation
    const capsule = await gateway.compileContextForQuery({
      taskId: "scenario-1",
      query,
    });
    expect(capsule.relevantEntities.length).toBeGreaterThan(0);
    expect(capsule.provenance.some((p) => p.includes("STRUCTURAL"))).toBe(true);
  });

  // ─── Scenario 2: Why did we choose provider X? ──────────────────────────────
  it("Scenario 2: answers 'Why did we choose warm basic render pool over Kaggle?' with ADR knowledge & provenance", async () => {
    const query = "Why did we choose warm basic render pool over Kaggle?";
    const plan = gateway.retrievalPlanner.plan(query);
    expect(plan.intent).toBe("DECISION_RATIONALE");
    expect(plan.targetSources).toContain("KNOWLEDGE");

    const result = await gateway.retrievalPlanner.retrieve(query);
    expect(result.items.length).toBeGreaterThan(0);

    const decisionItem = result.items.find((it) => it.sourceId.includes("ADR-002") || it.snippet.includes("FastAPI"));
    expect(decisionItem).toBeDefined();
    expect(decisionItem?.authority).toBe("AUTHORITATIVE");
    expect(decisionItem?.verification).toBe("verified");
  });

  // ─── Scenario 3: What changed in the rendering architecture? ────────────────
  it("Scenario 3: answers 'What changed in the rendering architecture?' with temporal change history", async () => {
    // Record a known architectural change event
    await gateway.historyProvider.recordEvent({
      entity: "rendering-pipeline",
      changeType: "MODIFIED",
      summary: "Added whisper pre-warming and 180s timeout guard to prevent callback hangs",
      source: "RUNTIME_EVENT",
    });

    const query = "What changed in the rendering architecture?";
    const plan = gateway.retrievalPlanner.plan(query);
    expect(plan.intent).toBe("TEMPORAL_CHANGE");
    expect(plan.targetSources).toContain("HISTORY");

    const result = await gateway.retrievalPlanner.retrieve("rendering-pipeline");
    expect(result.items.some((it) => it.sourceType === "HISTORY")).toBe(true);
  });

  // ─── Scenario 4: What is currently blocking the worker? ─────────────────────
  it("Scenario 4: answers 'What is currently blocking the render worker?' with live runtime state, not stale docs", async () => {
    const query = "What is currently blocking the worker?";
    const plan = gateway.retrievalPlanner.plan(query);
    expect(plan.intent).toBe("RUNTIME_STATUS");
    expect(plan.targetSources).toContain("RUNTIME");

    const result = await gateway.retrievalPlanner.retrieve(query);
    const runtimeItem = result.items.find((it) => it.sourceType === "RUNTIME");
    expect(runtimeItem).toBeDefined();
    expect(runtimeItem?.snippet).toContain("GPU memory saturated on Job #9812");
    expect(runtimeItem?.authority).toBe("LIVE");
  });

  // ─── Scenario 5: What should the next developer know before modifying renderer?
  it("Scenario 5: compiles multi-source context (architecture + decision + lesson + AST) for developer onboarding", async () => {
    const query = "What should the next developer know before modifying the renderer?";
    const plan = gateway.retrievalPlanner.plan(query);
    expect(plan.intent).toBe("MULTI_SOURCE_SYNTHESIS");
    expect(plan.targetSources).toContain("KNOWLEDGE");
    expect(plan.targetSources).toContain("STRUCTURAL");

    const capsule = await gateway.compileContextForQuery({
      taskId: "dev-onboarding-scenario-5",
      query,
      tokenBudget: 3000,
    });

    expect(capsule.budget.estimatedTokens).toBeLessThanOrEqual(3000);
    expect(capsule.decisions.length).toBeGreaterThan(0);
    expect(capsule.provenance.length).toBeGreaterThan(0);
  });

  // ─── Scenario 6: Give me only the evidence relevant to changing render router
  it("Scenario 6: bounds evidence capsule under strict token budget (no entire repo dump)", async () => {
    const capsule = await gateway.compileContextForQuery({
      taskId: "bounded-context-scenario-6",
      query: "Give me only the evidence relevant to changing the render router",
      tokenBudget: 1200,
    });

    expect(capsule.budget.maxTokens).toBe(1200);
    expect(capsule.budget.estimatedTokens).toBeLessThanOrEqual(1200);
    expect(capsule.evidence.length).toBeGreaterThan(0);
  });

  // ─── Failure Tests (Section 20) ─────────────────────────────────────────────
  it("Failure Tests: degrades safely when structural graph is missing", async () => {
    const degradedGateway = new IntelligenceGateway({
      graphPath: "non-existent-graph.json",
    });

    const report = degradedGateway.memoryDoctor();
    expect(report.structural.available).toBe(false);
    expect(report.knowledge.available).toBe(true);

    // Knowledge queries still succeed
    const res = await degradedGateway.retrievalPlanner.retrieve("Why did we choose warm basic render pool?");
    expect(res.items.length).toBeGreaterThan(0);
  });

  it("Failure Tests: deterministic secret redaction prevents credential leakage", async () => {
    const rawLeakQuery = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and AIzaSyD3x92jK103984029384029384";
    const capsule = await gateway.compileContextForQuery({
      taskId: "leak-test",
      query: rawLeakQuery,
    });

    // Neither the evidence nor the capsule text may leak the credentials
    const serialized = JSON.stringify(capsule);
    expect(serialized).not.toContain("AIzaSyD3x92jK103984029384029384");
    expect(serialized).toContain("[REDACTED_SECRET]");
  });
});
