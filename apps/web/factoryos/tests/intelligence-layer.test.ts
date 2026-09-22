/**
 * FactoryOS — Intelligence Layer Integration Tests
 * Verifies RetrievalPlanner, ContextCompiler, MemoryWriter, and IntelligenceGateway.
 */

import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import fs from "fs";
import { RetrievalPlanner } from "../core/intelligence/retrieval/RetrievalPlanner";
import { ContextCompiler } from "../core/intelligence/context/ContextCompiler";
import { MemoryWriter } from "../core/intelligence/writer/MemoryWriter";
import { KnowledgeStore } from "../core/intelligence/knowledge/KnowledgeStore";
import { HistoryProvider } from "../core/intelligence/history/HistoryProvider";
import { RuntimeStateProvider } from "../core/intelligence/runtime/RuntimeStateProvider";
import { GraphifyStructuralAdapter } from "../core/intelligence/structural/GraphifyStructuralAdapter";
import { IntelligenceGateway } from "../core/intelligence/IntelligenceGateway";
import { IntelligenceCli } from "../core/intelligence/cli/IntelligenceCli";

describe("FactoryOS — Intelligence Layer (Retrieval, Compiler, Writer)", () => {
  const testVaultDir = path.resolve(process.cwd(), "temp/test-intel-vault");
  let knowledgeStore: KnowledgeStore;
  let historyProvider: HistoryProvider;
  let runtimeState: RuntimeStateProvider;
  let structuralAdapter: GraphifyStructuralAdapter;
  let retrievalPlanner: RetrievalPlanner;
  let contextCompiler: ContextCompiler;
  let memoryWriter: MemoryWriter;

  beforeEach(async () => {
    if (fs.existsSync(testVaultDir)) {
      fs.rmSync(testVaultDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testVaultDir, { recursive: true });

    knowledgeStore = new KnowledgeStore(testVaultDir);
    historyProvider = new HistoryProvider(knowledgeStore);
    runtimeState = new RuntimeStateProvider({
      factoryStatus: "HEALTHY",
      currentBlockers: [],
    });

    structuralAdapter = new GraphifyStructuralAdapter({
      nodes: [
        {
          id: "services_rendering_basic_api",
          label: "BasicRenderAPI",
          file_type: "code",
          source_file: "services/rendering-engine/basic_render_api.py",
        },
      ],
      links: [],
    });

    retrievalPlanner = new RetrievalPlanner({
      structuralGraph: structuralAdapter,
      knowledgeStore,
      historyProvider,
      runtimeState,
    });

    contextCompiler = new ContextCompiler();
    memoryWriter = new MemoryWriter(knowledgeStore);

    // Seed knowledge document
    await knowledgeStore.create({
      frontmatter: {
        id: "adr-lightning",
        type: "decision",
        title: "Lightning Render Decision",
        status: "active",
        created_at: "2026-09-20T10:00:00Z",
        updated_at: "2026-09-20T10:00:00Z",
        tags: ["rendering"],
      },
      content: "We selected warm Basic FastAPI workers over Kaggle for low latency.",
      subDir: "decisions",
    });
  });

  it("RetrievalPlanner deterministically routes queries by query intent", async () => {
    // 1. Where is -> CODE_LOCATION -> STRUCTURAL
    const p1 = retrievalPlanner.plan("Where is the BasicRenderAPI implemented?");
    expect(p1.intent).toBe("CODE_LOCATION");
    expect(p1.targetSources).toEqual(["STRUCTURAL"]);

    // 2. Why did we choose -> DECISION_RATIONALE -> KNOWLEDGE
    const p2 = retrievalPlanner.plan("Why did we choose Lightning over Kaggle?");
    expect(p2.intent).toBe("DECISION_RATIONALE");
    expect(p2.targetSources).toEqual(["KNOWLEDGE"]);

    // 3. What is blocking -> RUNTIME_STATUS -> RUNTIME
    const p3 = retrievalPlanner.plan("What is currently blocking the render worker?");
    expect(p3.intent).toBe("RUNTIME_STATUS");
    expect(p3.targetSources).toEqual(["RUNTIME"]);

    // 4. What changed -> TEMPORAL_CHANGE -> HISTORY
    const p4 = retrievalPlanner.plan("What changed in the renderer history?");
    expect(p4.intent).toBe("TEMPORAL_CHANGE");
    expect(p4.targetSources).toEqual(["HISTORY"]);
  });

  it("ContextCompiler enforces token budget and redacts secrets", () => {
    const rawItems = [
      {
        id: "ev1",
        sourceType: "KNOWLEDGE" as const,
        sourceId: "adr-1",
        titleOrPath: "decisions/adr-1.md",
        relevance: 0.9,
        authority: "AUTHORITATIVE" as const,
        freshness: new Date().toISOString(),
        epistemicStatus: "sourced" as const,
        verification: "verified" as const,
        snippet: "Configuration using Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and password = 'secret123' for auth.",
      },
    ];

    const capsule = contextCompiler.compile({
      taskId: "test-task",
      query: "Check config auth",
      evidenceItems: rawItems,
      budgetPolicy: { maxTokens: 500 },
    });

    expect(capsule.budget.estimatedTokens).toBeLessThanOrEqual(500);
    // Secret must be redacted
    expect(capsule.evidence[0].snippet).not.toContain("secret123");
    expect(capsule.evidence[0].snippet).toContain("[REDACTED_SECRET]");
  });

  it("MemoryWriter enforces policy: accepts verified decisions, rejects noise", async () => {
    // 1. Rejects debug noise
    const debugProposal = {
      title: "Debug trace log",
      type: "fact" as const,
      content: "[DEBUG] stdout: exit code 0 traceback (most recent call last) temporary log",
      provenance: {
        source_type: "RUNTIME_EVENT" as const,
        source_id: "evt-1",
        captured_at: new Date().toISOString(),
      },
    };
    expect(memoryWriter.evaluatePolicy(debugProposal).accepted).toBe(false);

    // 2. Accepts architecture decision
    const decisionProposal = {
      title: "Universal Render Adapter Pattern",
      type: "decision" as const,
      content: "FactoryOS uses universal render adapter pattern to isolate GPU render nodes.",
      provenance: {
        source_type: "USER_DECISION" as const,
        source_id: "user-dec-01",
        captured_at: new Date().toISOString(),
      },
      isVerified: true,
    };
    expect(memoryWriter.evaluatePolicy(decisionProposal).accepted).toBe(true);

    const doc = await memoryWriter.proposeAndCommit(decisionProposal);
    expect(doc.frontmatter.id).toBe("universal-render-adapter-pattern");
    expect(knowledgeStore.get("universal-render-adapter-pattern")).not.toBeNull();
  });

  it("IntelligenceCli executes memory doctor and context preview", async () => {
    const gateway = new IntelligenceGateway({
      vaultPath: testVaultDir,
    });
    const cli = new IntelligenceCli(gateway);

    const doctorOut = await cli.runCommand(["memory", "doctor"]);
    expect(doctorOut).toContain("=== FACTORY MEMORY DOCTOR ===");
    expect(doctorOut).toContain("Overall Status:");

    const graphStatusOut = await cli.runCommand(["graph", "status"]);
    expect(graphStatusOut).toContain("=== FACTORY GRAPH STATUS ===");
    expect(graphStatusOut).toContain("Nodes:");

    const graphDoctorOut = await cli.runCommand(["graph", "doctor"]);
    expect(graphDoctorOut).toContain("=== FACTORY GRAPH DOCTOR ===");

    const graphRefreshOut = await cli.runCommand(["graph", "refresh"]);
    expect(graphRefreshOut).toContain("=== FACTORY GRAPH REFRESH ===");
    expect(graphRefreshOut).toContain("Snapshot ID:");

    const knowValidateOut = await cli.runCommand(["knowledge", "validate"]);
    expect(knowValidateOut).toContain("=== FACTORY KNOWLEDGE VALIDATE ===");
    expect(knowValidateOut).toContain("OKF v0.2 Spec Conformance:");

    const previewOut = await cli.runCommand(["context", "preview", "Why did we choose Lightning?"]);
    expect(previewOut).toContain("=== CONTEXT CAPSULE PREVIEW ===");
    expect(previewOut).toContain("Budget:");
  });
});
