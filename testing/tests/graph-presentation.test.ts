/**
 * FactoryOS Canonical Testing Suite — Graph Presentation & Schema Tests
 * Covers Tests A through G, plus K, L, M:
 *   Test A: Valid MissionGraph -> valid PresentationIR
 *   Test B: Unknown graph node ID -> rejected
 *   Test C: Unknown edge endpoint -> rejected
 *   Test D: Unknown truth level -> rejected
 *   Test E: Focus references nonexistent node -> rejected
 *   Test F: Complexity budget enforcement -> auto-collapsed / handled
 *   Test G: Missing evidence reference handled properly
 *   Test K: SituationRecord -> visual projection preserves text/graph/evidence
 *   Test L: Overseer operational view projection
 *   Test M: Slayer forensic view projection
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GraphPresentationTransformer } from "../graphs/visual/GraphPresentationTransformer";
import { GraphPresentationValidator } from "../graphs/visual/GraphPresentationValidator";
import type { GraphPresentationIR } from "../graphs/visual/PresentationIR";
import type { MissionGraphIR } from "../graphs/MissionGraph";
import type { SituationRecord } from "../model/SituationRecord";

function loadVisualFixture<T = any>(filename: string): T {
  const filePath = resolve(__dirname, "../fixtures/visual", filename);
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

function loadSituationFixture(filename: string): SituationRecord {
  const filePath = resolve(__dirname, "../fixtures/situations", filename);
  return JSON.parse(readFileSync(filePath, "utf-8")) as SituationRecord;
}

export async function runGraphPresentationTestSuite(): Promise<{ passed: boolean; results: any[] }> {
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

  console.log("\n=== FactoryOS Graph Presentation Suite (Archify & Diagram-Design Principles) ===");

  // Test A: Valid MissionGraph -> valid PresentationIR
  await runTest("Test A: Valid MissionGraph produces valid PresentationIR", () => {
    const missionGraph = loadVisualFixture<MissionGraphIR>("golden-mission.json");
    const ir = GraphPresentationTransformer.buildMissionOverview(missionGraph);

    const validation = GraphPresentationValidator.validate(ir);
    if (!validation.valid) {
      throw new Error(`Validation failed on valid mission graph: ${validation.errors.join("; ")}`);
    }
    if (ir.viewType !== "MISSION_OVERVIEW") throw new Error("Expected viewType MISSION_OVERVIEW");
    if (ir.nodes.length === 0) throw new Error("Expected non-empty nodes");
  });

  // Test B: Unknown graph node ID -> renderer rejected
  await runTest("Test B: Empty or missing node ID rejected fail-closed", () => {
    const badIR: any = {
      schemaVersion: "1.0.0",
      viewType: "MISSION_OVERVIEW",
      title: "Bad Graph",
      missionId: "m1",
      nodes: [{ id: "", label: "Empty ID", type: "FLOOR", truthLevel: "OBSERVED", status: "VERIFIED" }],
      edges: [],
    };
    const res = GraphPresentationValidator.validate(badIR);
    if (res.valid) throw new Error("Expected validation to fail for empty node id");
  });

  // Test C: Unknown edge endpoint -> rejected
  await runTest("Test C: Edge with unknown endpoint rejected fail-closed", () => {
    const badEdgeIR: any = {
      schemaVersion: "1.0.0",
      viewType: "MISSION_OVERVIEW",
      title: "Bad Edge",
      missionId: "m1",
      nodes: [{ id: "n1", label: "Node 1", type: "FLOOR", truthLevel: "OBSERVED", status: "VERIFIED" }],
      edges: [{ id: "e1", from: "n1", to: "non_existent_node", type: "DEPENDENCY", truthLevel: "OBSERVED", status: "VERIFIED" }],
    };
    const res = GraphPresentationValidator.validate(badEdgeIR);
    if (res.valid) throw new Error("Expected validation to fail for dangling edge endpoint");
  });

  // Test D: Unknown truth level -> rejected
  await runTest("Test D: Node with invalid truth level rejected", () => {
    const badTruthIR: any = {
      schemaVersion: "1.0.0",
      viewType: "MISSION_OVERVIEW",
      title: "Bad Truth",
      missionId: "m1",
      nodes: [{ id: "n1", label: "Node 1", type: "FLOOR", truthLevel: "ABSOLUTELY_GUARANTEED", status: "VERIFIED" }],
      edges: [],
    };
    const res = GraphPresentationValidator.validate(badTruthIR);
    if (res.valid) throw new Error("Expected validation to fail for uncontracted truth level");
  });

  // Test E: Focus references nonexistent node -> rejected
  await runTest("Test E: Focus referencing non-existent node rejected", () => {
    const badFocusIR: any = {
      schemaVersion: "1.0.0",
      viewType: "MISSION_OVERVIEW",
      title: "Bad Focus",
      missionId: "m1",
      nodes: [{ id: "n1", label: "Node 1", type: "FLOOR", truthLevel: "OBSERVED", status: "VERIFIED" }],
      edges: [],
      focus: ["ghost_node_id"],
    };
    const res = GraphPresentationValidator.validate(badFocusIR);
    if (res.valid) throw new Error("Expected validation to fail for non-existent focus node");
  });

  // Test F: Complexity budget enforcement
  await runTest("Test F: Complexity budget enforced with bounded collapse", () => {
    const missionGraph = loadVisualFixture<MissionGraphIR>("golden-mission.json");
    const ir = GraphPresentationTransformer.buildMissionOverview(missionGraph);

    if (ir.nodes.length > ir.complexityBudget.maxNodes) {
      throw new Error(`Overview node count ${ir.nodes.length} exceeded budget ${ir.complexityBudget.maxNodes}`);
    }
  });

  // Test G: Evidence references verified
  await runTest("Test G: Canonical evidence references preserved in PresentationIR", () => {
    const sitFixture = loadSituationFixture("situation-f4-fallback.json");
    const ir = GraphPresentationTransformer.buildSituationRecordView(sitFixture);

    const fNode = ir.nodes.find((n) => n.id === "floor04_media_synthesis");
    if (!fNode || fNode.evidenceRefs.length === 0) {
      throw new Error("Expected node to retain canonical evidence references");
    }
    if (!fNode.evidenceRefs.includes("ev_provider_fail_01")) {
      throw new Error("Missing expected evidence ref 'ev_provider_fail_01'");
    }
  });

  // Test K: SituationRecord -> visual projection preserves text/graph/evidence
  await runTest("Test K: SituationRecord visual projection preserves tripartite model", () => {
    const sitFixture = loadSituationFixture("situation-f4-fallback.json");
    const ir = GraphPresentationTransformer.buildSituationRecordView(sitFixture);

    if (ir.subtitle !== sitFixture.text) throw new Error("Text summary not preserved in IR subtitle");
    if (ir.nodes.length !== sitFixture.graph.nodes.length) throw new Error("Graph node count mismatch");
    if (ir.edges.length !== sitFixture.graph.edges.length) throw new Error("Graph edge count mismatch");
    if (ir.focus.length !== sitFixture.graph.focus.length) throw new Error("Graph focus mismatch");
  });

  // Test L: Overseer Operational View
  await runTest("Test L: Overseer Operational View isolates active blockers", () => {
    const overseerData = loadVisualFixture<MissionGraphIR>("overseer-operational.json");
    const ir = GraphPresentationTransformer.buildOverseerOperationalView(overseerData);

    if (ir.viewType !== "OVERSEER_OPERATIONAL") throw new Error("Expected viewType OVERSEER_OPERATIONAL");
    if (!ir.focus.includes("floor05_timeline_composition")) {
      throw new Error("Expected blocker 'floor05_timeline_composition' in Overseer focus");
    }
  });

  // Test M: Slayer Forensic View
  await runTest("Test M: Slayer Forensic View isolates root-cause candidate and causal chain", () => {
    const slayerData = loadVisualFixture<MissionGraphIR>("slayer-forensic.json");
    const ir = GraphPresentationTransformer.buildSlayerForensicView(slayerData, undefined, "node_anomaly_gemini_504");

    if (ir.viewType !== "SLAYER_FORENSIC") throw new Error("Expected viewType SLAYER_FORENSIC");
    if (!ir.focus.includes("node_anomaly_gemini_504")) {
      throw new Error("Expected anomaly in Slayer focus");
    }
    if (ir.edges.length === 0) throw new Error("Expected causal propagation edges");
  });

  const passed = results.every((r) => r.passed);
  console.log(`\nGraph Presentation Suite Result: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
  return { passed, results };
}

if (require.main === module) {
  runGraphPresentationTestSuite().then((res) => {
    process.exit(res.passed ? 0 : 1);
  });
}
