/**
 * FactoryOS Canonical Testing Suite — Graph Diff & Visual Delta Tests
 * Covers Test J and Bounded Visual Repair:
 *   Test J: Graph diff accurately generates Before / Delta / After visualization
 *   Bounded Repair: Verifies max 2-round repair halts safely on unresolvable issues
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { GraphDiff } from "../graphs/GraphDiff";
import { GraphPresentationTransformer } from "../graphs/visual/GraphPresentationTransformer";
import { DeterministicGraphRenderer } from "../graphs/visual/DeterministicGraphRenderer";
import { BoundedVisualRepair } from "../graphs/visual/BoundedVisualRepair";
import type { MissionGraphIR } from "../graphs/MissionGraph";

function loadVisualFixture<T = any>(filename: string): T {
  const filePath = resolve(__dirname, "../fixtures/visual", filename);
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

export async function runGraphDiffVisualTestSuite(): Promise<{ passed: boolean; results: any[] }> {
  const results: Array<{ name: string; passed: boolean; error?: string }> = [];

  const runTest = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  [PASS] ${name}`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      results.push({ name, passed: false, error: errMsg });
      console.error(`  [FAIL] ${name}: ${errMsg}`);
    }
  };

  console.log("\n=== FactoryOS Graph Diff & Visual Delta Suite ===");

  // Test J: Graph diff Before / Delta / After
  await runTest("Test J: Graph diff accurately produces Before / Delta / After visualization", async () => {
    const fixture = loadVisualFixture<{ baseline: MissionGraphIR; candidate: MissionGraphIR }>("graph-delta.json");

    // 1. Compute deterministic delta via GraphDiff
    const delta = GraphDiff.compare(fixture.baseline, fixture.candidate);
    if (!delta.hasDivergence) {
      throw new Error("Expected graph divergence between baseline and candidate");
    }
    if (delta.addedNodes.length === 0 || delta.removedNodes.length === 0) {
      throw new Error("Expected both added and removed nodes in delta");
    }

    // 2. Build Delta Presentation IR
    const deltaIR = GraphPresentationTransformer.buildDeltaComparisonView(delta, fixture.baseline, fixture.candidate);
    if (deltaIR.viewType !== "DELTA_COMPARISON") {
      throw new Error("Expected viewType DELTA_COMPARISON");
    }

    // Verify delta badges
    const addedNode = deltaIR.nodes.find((n) => n.id === "local_pcm_wav_fallback");
    if (!addedNode || !addedNode.label.includes("+ ADDED")) {
      throw new Error("Added node local_pcm_wav_fallback missing '+ ADDED' label badge");
    }

    const removedNode = deltaIR.nodes.find((n) => n.id === "deprecated_legacy_cache");
    if (!removedNode || !removedNode.label.includes("- REMOVED")) {
      throw new Error("Removed node deprecated_legacy_cache missing '- REMOVED' label badge");
    }

    // 3. Render Delta Visual Artifact
    const receipt = await DeterministicGraphRenderer.renderArtifact(deltaIR, "data/evidence/visualizations");
    if (receipt.status !== "DELIVERED") {
      throw new Error(`Delta rendering delivery failed: ${receipt.diagnostics.join("; ")}`);
    }
    if (!receipt.artifactPath || !existsSync(receipt.artifactPath)) {
      throw new Error("Delta SVG artifact missing");
    }
  });

  // Bounded Repair Test: Auto-repairs dangling edges within budget
  await runTest("Bounded Repair: Resolves dangling edges in 1 round", () => {
    const fixture = loadVisualFixture<MissionGraphIR>("golden-mission.json");
    const validIR = GraphPresentationTransformer.buildMissionOverview(fixture);

    // Add dangling edge
    const brokenIR = {
      ...validIR,
      edges: [
        ...validIR.edges,
        {
          id: "dangling_edge_101",
          from: "floor00_analyst",
          to: "non_existent_target_node",
          type: "DEPENDENCY",
          truthLevel: "OBSERVED" as const,
          status: "FAILED",
          visualHints: { style: "solid" as const, color: "#ef4444", marker: "arrow" as const },
        },
      ],
    };

    const repairResult = BoundedVisualRepair.repair(brokenIR as any);
    if (!repairResult.halted) throw new Error("Expected repair engine to halt");
    if (repairResult.remainingErrors.length > 0) {
      throw new Error(`Expected zero remaining errors, got: ${repairResult.remainingErrors.join("; ")}`);
    }
    if (repairResult.round !== 1) {
      throw new Error(`Expected repair in 1 round, took ${repairResult.round}`);
    }
  });

  // Bounded Repair Test: Halts at 2 rounds if unresolvable
  await runTest("Bounded Repair: Halts strictly at max 2 rounds on unresolvable errors", () => {
    const unresolvableIR: any = {
      schemaVersion: "", // Missing schema version
      viewType: "UNKNOWN_VIEW", // Invalid view type
      title: "", // Missing title
      missionId: "", // Missing missionId
      nodes: [],
      edges: [],
    };

    const repairResult = BoundedVisualRepair.repair(unresolvableIR);
    if (!repairResult.halted) throw new Error("Expected repair to halt");
    if (repairResult.round > 2) throw new Error(`Exceeded max repair rounds: ${repairResult.round}`);
    if (repairResult.remainingErrors.length === 0) {
      throw new Error("Unresolvable IR unexpectedly reported zero errors");
    }
  });

  const passed = results.every((r) => r.passed);
  console.log(`\nGraph Diff & Visual Delta Suite Result: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
  return { passed, results };
}

if (require.main === module) {
  runGraphDiffVisualTestSuite().then((res) => {
    process.exit(res.passed ? 0 : 1);
  });
}
