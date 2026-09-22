/**
 * FactoryOS v1 / Frontier v3 — Visualization V2 Interaction Test Suite
 * Authoritative regression tests A through T covering InteractionIR, Node/Edge Resolvers,
 * Explain Edge, Evidence Chaining, Cycle Planning, Redaction, Accessibility, and Invariants.
 */

import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { NodeInspectionResolver } from "../graphs/visual/NodeInspectionResolver";
import { EdgeExplanationResolver } from "../graphs/visual/EdgeExplanationResolver";
import { ArtifactInspectionResolver } from "../graphs/visual/ArtifactInspectionResolver";
import { BrowserEvidenceResolver } from "../graphs/visual/BrowserEvidenceResolver";
import { SituationInspectionResolver } from "../graphs/visual/SituationInspectionResolver";
import { GraphNavigationState } from "../graphs/visual/GraphNavigationState";
import { CyclePresentationPlanner } from "../graphs/visual/CyclePresentationPlanner";
import { VisualizationInteractionResolver } from "../graphs/visual/VisualizationInteractionResolver";
import { DeterministicGraphRenderer } from "../graphs/visual/DeterministicGraphRenderer";
import { LastGoodVisualStore } from "../graphs/visual/GraphPresentationValidator";
import { BrowserRedactor } from "../runtime/BrowserRedactor";
import { ChromeDevToolsClient } from "../runtime/ChromeDevToolsClient";
import type { MissionGraphIR } from "../graphs/MissionGraph";
import type { EvidenceGraphIR } from "../graphs/EvidenceGraph";
import type { SituationRecord } from "../model/SituationRecord";
import type { BrowserEvidenceRecord } from "../contracts/browser.contract";
import type { GraphDelta } from "../graphs/GraphDiff";
import type { GraphPresentationIR } from "../graphs/visual/PresentationIR";

export async function runGraphInteractionTestSuite(): Promise<{ passed: boolean; testCount: number }> {
  console.log(`\n======================================================`);
  console.log(` FACTORYOS VISUALIZATION V2 INTERACTION SUITE (A - T)`);
  console.log(`======================================================\n`);

  let testCount = 0;

  // Shared baseline MissionGraph & EvidenceGraph fixtures
  const baselineMissionGraph: MissionGraphIR = {
    schemaVersion: "1.0.0",
    missionId: "golden-short-001",
    runId: "run_golden_v2_001",
    createdAt: new Date().toISOString(),
    nodes: [
      {
        id: "floor03_asset_realization",
        type: "FLOOR",
        label: "Floor 03: Asset Realization",
        floorId: "floor03",
        status: "VERIFIED",
        truthLevel: "VERIFIED",
      },
      {
        id: "floor04_media_synthesis",
        type: "FLOOR",
        label: "Floor 04: Media Synthesis",
        floorId: "floor04",
        status: "VERIFIED",
        truthLevel: "VERIFIED",
        metadata: {
          artifactId: "art_audio_01",
          artifactPath: "data/artifacts/audio/voice.wav",
        },
      },
      {
        id: "floor05_timeline_composition",
        type: "FLOOR",
        label: "Floor 05: Timeline Composition",
        floorId: "floor05",
        status: "OBSERVED",
        truthLevel: "OBSERVED",
      },
      {
        id: "floor06_rendering",
        type: "FLOOR",
        label: "Floor 06: Video Rendering",
        floorId: "floor06",
        status: "PLANNED",
        truthLevel: "ASSERTED",
      },
      {
        id: "floor07_compliance",
        type: "FLOOR",
        label: "Floor 07: Compliance Verification",
        floorId: "floor07",
        status: "PLANNED",
        truthLevel: "ASSERTED",
      },
    ],
    edges: [
      {
        id: "edge_f3_f4",
        from: "floor03_asset_realization",
        to: "floor04_media_synthesis",
        type: "EXECUTION_SEQUENCE",
        status: "VERIFIED",
        truthLevel: "VERIFIED",
      },
      {
        id: "edge_f4_f5_voice_handoff",
        from: "floor04_media_synthesis",
        to: "floor05_timeline_composition",
        type: "ARTIFACT_PRODUCED",
        status: "OBSERVED",
        truthLevel: "OBSERVED",
      },
      {
        id: "edge_f5_f6_planned",
        from: "floor05_timeline_composition",
        to: "floor06_rendering",
        type: "PLANNED_DEPENDENCY",
        status: "PLANNED",
        truthLevel: "ASSERTED",
      },
      {
        id: "edge_f6_f7_planned",
        from: "floor06_rendering",
        to: "floor07_compliance",
        type: "PLANNED_DEPENDENCY",
        status: "PLANNED",
        truthLevel: "ASSERTED",
      },
    ],
  };

  const baselineEvidenceGraph: EvidenceGraphIR = {
    schemaVersion: "1.0.0",
    missionId: "golden-short-001",
    runId: "run_golden_v2_001",
    createdAt: new Date().toISOString(),
    evidenceNodes: [
      {
        id: "ev_file_art_audio_01",
        category: "PHYSICAL_FILE_ON_DISK",
        truthLevel: "PHYSICAL",
        subjectId: "art_audio_01",
        physicalPath: "data/artifacts/audio/voice.wav",
        timestamp: new Date().toISOString(),
        description: "Physical WAV audio existence verified on filesystem",
      },
      {
        id: "ev_sha256_art_audio_01",
        category: "SHA256_BYTE_DIGEST",
        truthLevel: "VERIFIED",
        subjectId: "art_audio_01",
        digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        timestamp: new Date().toISOString(),
        description: "Deterministic SHA-256 byte digest for voice.wav",
      },
      {
        id: "ev_probe_audio_01",
        category: "FFPROBE_STREAM_METRIC",
        truthLevel: "VERIFIED",
        subjectId: "floor04_media_synthesis",
        timestamp: new Date().toISOString(),
        description: "Authoritative ffprobe probe passed: 4.5s audio stream",
      },
    ],
    evidenceEdges: [
      {
        id: "evedge_1",
        evidenceNodeId: "ev_file_art_audio_01",
        targetGraphNodeId: "floor04_media_synthesis",
        relationship: "PROVES_ARTIFACT_INTEGRITY",
      },
      {
        id: "evedge_2",
        evidenceNodeId: "ev_sha256_art_audio_01",
        targetGraphNodeId: "floor04_media_synthesis",
        relationship: "PROVES_ARTIFACT_INTEGRITY",
      },
      {
        id: "evedge_3",
        evidenceNodeId: "ev_probe_audio_01",
        targetGraphNodeId: "floor04_media_synthesis",
        relationship: "PROVES_STATE_TRANSITION",
      },
    ],
  };

  const sampleArtifactRecord = {
    id: "art_audio_01",
    path: "data/artifacts/audio/voice.wav",
    producer: "floor04_media_synthesis",
    consumers: ["floor05_timeline_composition"],
    byteLength: 144284,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    mimeType: "audio/wav",
    durationSeconds: 4.5,
    durationTruth: "AUTHORITATIVE_FFPROBE",
    verificationStatus: "VERIFIED" as const,
    probeResults: { file_exists: true, sha256_match: true, ffprobe_valid: true },
  };

  // -------------------------------------------------------------
  // TEST A: Valid node resolves to canonical subject
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST A] Valid node resolves to canonical subject...`);
    const res = NodeInspectionResolver.resolve("floor04_media_synthesis", {
      missionGraph: baselineMissionGraph,
      evidenceGraph: baselineEvidenceGraph,
    });
    assert.strictEqual(res.resolved, true, "Valid node must resolve");
    assert.strictEqual(res.canonicalId, "floor04_media_synthesis");
    assert.strictEqual(res.status, "VERIFIED");
    assert.strictEqual(res.truthLevel, "VERIFIED");
    assert.ok(res.evidenceRefs.includes("ev_file_art_audio_01"), "Must resolve linked evidence");
    assert.ok(res.consumers.includes("floor05_timeline_composition"), "Must identify consumers");
    console.log(`  -> PASSED: Valid node correctly resolved canonical subject.\n`);
  }

  // -------------------------------------------------------------
  // TEST B: Unknown node fails closed
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST B] Unknown node fails closed...`);
    const res = NodeInspectionResolver.resolve("non_existent_node_999", {
      missionGraph: baselineMissionGraph,
      evidenceGraph: baselineEvidenceGraph,
    });
    assert.strictEqual(res.resolved, false, "Unknown node must fail closed");
    assert.strictEqual(res.truthLevel, "UNKNOWN", "Unknown node must have truthLevel UNKNOWN");
    assert.strictEqual(res.evidenceRefs.length, 0, "Unknown node must have zero evidence refs");
    console.log(`  -> PASSED: Unknown node failed closed.\n`);
  }

  // -------------------------------------------------------------
  // TEST C: Valid edge explanation resolves
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST C] Valid edge explanation resolves...`);
    const res = EdgeExplanationResolver.resolve("edge_f4_f5_voice_handoff", {
      missionGraph: baselineMissionGraph,
      evidenceGraph: baselineEvidenceGraph,
      physicalArtifacts: [
        {
          id: "art_audio_01",
          path: "data/artifacts/audio/voice.wav",
          byteLength: 144284,
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          existsPhysically: true,
        },
      ],
    });
    assert.strictEqual(res.resolved, true, "Edge explanation must resolve");
    assert.strictEqual(res.fromNodeId, "floor04_media_synthesis");
    assert.strictEqual(res.toNodeId, "floor05_timeline_composition");
    assert.strictEqual(res.relationshipType, "ARTIFACT_PRODUCED");
    assert.ok(res.artifactTransferred, "Transferred artifact must be resolved");
    assert.strictEqual(res.artifactTransferred?.byteLength, 144284);
    assert.ok(res.evidenceRefs.length > 0, "Must link canonical evidence");
    console.log(`  -> PASSED: Edge explanation resolved authoritative execution grounding.\n`);
  }

  // -------------------------------------------------------------
  // TEST D: Unknown edge fails closed
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST D] Unknown edge fails closed...`);
    const res = EdgeExplanationResolver.resolve("edge_does_not_exist_404", {
      missionGraph: baselineMissionGraph,
      evidenceGraph: baselineEvidenceGraph,
    });
    assert.strictEqual(res.resolved, false, "Unknown edge must fail closed");
    assert.strictEqual(res.truthLevel, "UNKNOWN");
    assert.strictEqual(res.executionSequence.length, 0);
    assert.strictEqual(res.evidenceRefs.length, 0);
    console.log(`  -> PASSED: Unknown edge failed closed.\n`);
  }

  // -------------------------------------------------------------
  // TEST E: Artifact inspection resolves physical artifact
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST E] Artifact inspection resolves physical artifact...`);
    const res = ArtifactInspectionResolver.resolve("art_audio_01", [sampleArtifactRecord]);
    assert.strictEqual(res.resolved, true, "Artifact must resolve");
    assert.strictEqual(res.artifactId, "art_audio_01");
    assert.strictEqual(res.byteLength, 144284);
    assert.strictEqual(res.verificationStatus, "VERIFIED");
    assert.strictEqual(res.durationSeconds, 4.5);
    assert.strictEqual(res.durationTruth, "AUTHORITATIVE_FFPROBE");
    console.log(`  -> PASSED: Artifact inspection resolved physical records.\n`);
  }

  // -------------------------------------------------------------
  // TEST F: Browser evidence inspection resolves canonical evidence
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST F] Browser evidence inspection resolves canonical evidence...`);
    const sampleBrowserRecord: BrowserEvidenceRecord = {
      id: "br_ev_sample_01",
      missionId: "golden-short-001",
      runId: "run_golden_v2_001",
      kind: "NETWORK",
      truthLevel: "OBSERVED",
      timestamp: new Date().toISOString(),
      page: "http://localhost:3000/overseer",
      url: "http://localhost:3000/api/chat",
      source: {
        browserType: "chrome-devtools-protocol",
        clientVersion: "1.0.0",
        endpoint: "http://127.0.0.1:9222",
      },
      metadata: {
        category: "NETWORK",
        url: "http://localhost:3000/api/chat",
        statusCode: 200,
        headers: { "content-type": "application/json" },
      },
    };
    const res = BrowserEvidenceResolver.resolve("br_ev_sample_01", [sampleBrowserRecord]);
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.kind, "NETWORK");
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.truthLevel, "OBSERVED");
    console.log(`  -> PASSED: Canonical browser evidence inspection resolved.\n`);
  }

  // -------------------------------------------------------------
  // TEST G: SituationRecord projection retains TEXT + GRAPH + EVIDENCE
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST G] SituationRecord projection retains TEXT + GRAPH + EVIDENCE...`);
    const sampleSituation: SituationRecord = {
      id: "sit_rec_handoff_01",
      missionId: "golden-short-001",
      sender: { agentId: "agent_f4", role: "MEDIA_SYNTHESIZER", floorId: "floor04" },
      recipients: ["agent_f5"],
      type: "HANDOFF",
      priority: "NORMAL",
      text: "Synthesis completed for scene 1 voice track.",
      graph: {
        nodes: [
          { id: "floor04_media_synthesis", type: "FLOOR", label: "Floor 04", truthLevel: "VERIFIED" },
          { id: "floor05_timeline_composition", type: "FLOOR", label: "Floor 05", truthLevel: "OBSERVED" },
        ],
        edges: [
          {
            id: "edge_f4_f5",
            from: "floor04_media_synthesis",
            to: "floor05_timeline_composition",
            type: "ARTIFACT_PRODUCED",
            truthLevel: "VERIFIED",
          },
        ],
      },
      evidence: [
        {
          evidenceId: "ev_file_art_audio_01",
          type: "PHYSICAL_FILE",
          truthLevel: "PHYSICAL",
          uriOrPath: "data/artifacts/audio/voice.wav",
          description: "WAV audio output",
        },
      ],
      createdAt: new Date().toISOString(),
    };

    const res = SituationInspectionResolver.resolve("sit_rec_handoff_01", [sampleSituation], baselineEvidenceGraph);
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.text, "Synthesis completed for scene 1 voice track.", "Text must be preserved verbatim");
    assert.strictEqual(res.graphNodesCount, 2, "Graph nodes preserved");
    assert.strictEqual(res.graphEdgesCount, 1, "Graph edges preserved");
    assert.strictEqual(res.evidenceRefs.length, 1, "Evidence preserved");
    console.log(`  -> PASSED: SituationRecord tripartite contract retained without loss.\n`);
  }

  // -------------------------------------------------------------
  // TEST H: Planned edge is not represented as verified
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST H] Planned edge is not represented as verified...`);
    const res = EdgeExplanationResolver.resolve("edge_f5_f6_planned", {
      missionGraph: baselineMissionGraph,
      evidenceGraph: baselineEvidenceGraph,
    });
    assert.strictEqual(res.resolved, true);
    assert.notStrictEqual(res.truthLevel, "VERIFIED", "Planned edge cannot be VERIFIED");
    assert.strictEqual(res.plannedRelationship, "PLANNED_DEPENDENCY");
    assert.strictEqual(res.observedRelationship, undefined, "Planned edge has no observed relationship");
    console.log(`  -> PASSED: Planned edge strictly held to unverified truth status.\n`);
  }

  // -------------------------------------------------------------
  // TEST I: Observed edge is not upgraded to verified without evidence
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST I] Observed edge is not upgraded to verified without evidence...`);
    const res = EdgeExplanationResolver.resolve("edge_f4_f5_voice_handoff", {
      missionGraph: baselineMissionGraph,
      evidenceGraph: undefined, // Zero verification evidence passed
    });
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.truthLevel, "OBSERVED", "Edge must remain OBSERVED without verification probe");
    assert.strictEqual(res.verification?.verified, undefined, "Must not fabricate verification verdict");
    console.log(`  -> PASSED: Observed edge was not falsely upgraded.\n`);
  }

  // -------------------------------------------------------------
  // TEST J: Physical artifact proof remains physical
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST J] Physical artifact proof remains physical...`);
    const testArtifactPath = "data/evidence/test_physical_audio.wav";
    fs.mkdirSync(path.dirname(testArtifactPath), { recursive: true });
    fs.writeFileSync(testArtifactPath, Buffer.from("RIFF....WAVEfmt ....data....testbytes12345678"), "utf-8");

    const res = ArtifactInspectionResolver.resolve("art_audio_01", [
      {
        id: "art_audio_01",
        path: testArtifactPath,
        producer: "floor04",
        consumers: ["floor05"],
      },
    ]);
    assert.strictEqual(res.physicalExistenceProven, true, "Physical existence must be proven from disk");
    assert.strictEqual(typeof res.byteLength, "number");
    assert.strictEqual(res.byteLength > 0, true);
    assert.strictEqual(res.sha256.length, 64, "Must compute physical SHA-256 hash from disk");
    console.log(`  -> PASSED: Physical artifact proof preserved as physical bytes.\n`);
  }

  // -------------------------------------------------------------
  // TEST K: Graph navigation preserves canonical identity
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST K] Graph navigation preserves canonical identity...`);
    const nav = new GraphNavigationState({ viewType: "MISSION_OVERVIEW" });
    nav.push({
      viewType: "EVIDENCE_DRILLDOWN",
      subjectId: "floor04_media_synthesis",
      selectionReason: "Inspecting floor 4 evidence",
    });
    nav.push({
      viewType: "SLAYER_FORENSIC",
      subjectId: "art_audio_01",
      selectionReason: "Investigating artifact checksum",
    });

    assert.strictEqual(nav.depth(), 3);
    assert.strictEqual(nav.current().subjectId, "art_audio_01");
    assert.strictEqual(nav.current().viewType, "SLAYER_FORENSIC");

    nav.pop();
    assert.strictEqual(nav.current().subjectId, "floor04_media_synthesis");
    assert.strictEqual(nav.current().viewType, "EVIDENCE_DRILLDOWN");

    nav.pop();
    assert.strictEqual(nav.current().viewType, "MISSION_OVERVIEW");
    console.log(`  -> PASSED: Semantic navigation stack preserved canonical identities.\n`);
  }

  // -------------------------------------------------------------
  // TEST L: Focus subgraph respects complexity budget
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST L] Focus subgraph respects complexity budget...`);
    const budgetLimit = 3;
    const focusIR = VisualizationInteractionResolver.buildFocusSubgraph(
      "floor04_media_synthesis",
      {
        missionGraph: baselineMissionGraph,
        evidenceGraph: baselineEvidenceGraph,
      },
      budgetLimit
    );
    assert.ok(focusIR, "Focus subgraph must be generated");
    assert.ok(focusIR!.nodes.length <= budgetLimit, `Must not exceed complexity budget limit of ${budgetLimit}`);
    assert.strictEqual(focusIR!.complexityBudget.budgetExceeded, false);
    console.log(`  -> PASSED: Focus subgraph strictly observed complexity budget (${focusIR!.nodes.length} <= ${budgetLimit}).\n`);
  }

  // -------------------------------------------------------------
  // TEST M: Cycle detected and represented explicitly
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST M] Cycle detected and represented explicitly...`);
    const cyclicMissionGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_cycle_test",
      runId: "run_cycle_01",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "F5", type: "FLOOR", label: "Floor 05 Timeline", truthLevel: "OBSERVED", status: "OBSERVED" },
        { id: "F6", type: "FLOOR", label: "Floor 06 Render", truthLevel: "OBSERVED", status: "FAILED" },
        { id: "RECOVERY", type: "RECOVERY", label: "Recovery Engine", truthLevel: "VERIFIED", status: "VERIFIED" },
      ],
      edges: [
        { id: "e1", from: "F5", to: "F6", type: "EXECUTION_SEQUENCE", status: "OBSERVED", truthLevel: "OBSERVED" },
        { id: "e2", from: "F6", to: "RECOVERY", type: "EXECUTION_SEQUENCE", status: "FAILED", truthLevel: "OBSERVED" },
        { id: "e3", from: "RECOVERY", to: "F5", type: "EXECUTION_SEQUENCE", status: "VERIFIED", truthLevel: "VERIFIED" },
      ],
    };

    const cycles = CyclePresentationPlanner.detectCycles(cyclicMissionGraph);
    assert.strictEqual(cycles.length, 1, "Must detect exactly 1 strongly connected cycle");
    assert.strictEqual(cycles[0].memberNodeIds.length, 3);
    assert.ok(cycles[0].memberNodeIds.includes("F5"));
    assert.ok(cycles[0].memberNodeIds.includes("F6"));
    assert.ok(cycles[0].memberNodeIds.includes("RECOVERY"));
    console.log(`  -> PASSED: Cycle detected and mapped explicitly without destroying topology.\n`);
  }

  // -------------------------------------------------------------
  // TEST N: Causal relationship is not inferred from reachability alone
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST N] Causal relationship is not inferred from reachability alone...`);
    // Floor 07 is reachable from Floor 03 via graph path, but F7 has zero direct evidence
    const res = NodeInspectionResolver.resolve("floor07_compliance", {
      missionGraph: baselineMissionGraph,
      evidenceGraph: baselineEvidenceGraph,
    });
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.truthLevel, "ASSERTED", "Truth level cannot be upgraded by reachability");
    assert.strictEqual(res.status, "PLANNED", "Status cannot be inferred from upstream success");
    assert.strictEqual(res.evidenceRefs.length, 0, "No causal evidence fabricated");
    console.log(`  -> PASSED: Raw reachability was not treated as causal proof.\n`);
  }

  // -------------------------------------------------------------
  // TEST O: Delta MODIFIED node resolves BEFORE / DELTA / AFTER
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST O] Delta MODIFIED node resolves BEFORE / DELTA / AFTER...`);
    const deltaSample: GraphDelta = {
      baselineRunId: "run_baseline",
      candidateRunId: "run_candidate",
      addedNodes: [],
      removedNodes: [],
      modifiedNodes: [
        {
          id: "floor04_media_synthesis",
          before: { status: "FAILED", truthLevel: "ASSERTED" },
          after: { status: "VERIFIED", truthLevel: "VERIFIED" },
        },
      ],
      addedEdges: [],
      removedEdges: [],
      hasDivergence: true,
    };

    const deltaRes = VisualizationInteractionResolver.resolveDelta("floor04_media_synthesis", deltaSample);
    assert.strictEqual(deltaRes.resolved, true);
    assert.strictEqual(deltaRes.deltaType, "MODIFIED");
    assert.strictEqual(deltaRes.before?.status, "FAILED");
    assert.strictEqual(deltaRes.after?.status, "VERIFIED");
    assert.strictEqual(deltaRes.delta?.statusChange, "FAILED → VERIFIED");
    console.log(`  -> PASSED: Delta inspection resolved BEFORE, DELTA, and AFTER.\n`);
  }

  // -------------------------------------------------------------
  // TEST P: Unknown evidence state remains UNKNOWN
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST P] Unknown evidence state remains UNKNOWN...`);
    const res = BrowserEvidenceResolver.resolve("missing_browser_ev_id", []);
    assert.strictEqual(res.resolved, false);
    assert.strictEqual(res.truthLevel, "UNKNOWN");
    assert.strictEqual(res.sourcePage, "UNKNOWN");
    console.log(`  -> PASSED: Missing evidence state stayed UNKNOWN.\n`);
  }

  // -------------------------------------------------------------
  // TEST Q: Secrets are redacted
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST Q] Secrets are redacted in browser evidence & navigation...`);
    const sensitiveUrl = "http://localhost:3000/api/chat?token=secret_jwt_xyz123&apiKey=ak_live_secret";
    const redactedUrl = BrowserRedactor.redactUrl(sensitiveUrl);
    assert.ok(!redactedUrl.includes("secret_jwt_xyz123"), "JWT token must be redacted");
    assert.ok(!redactedUrl.includes("ak_live_secret"), "API key must be redacted");

    const sensitiveText = "Error during request: Bearer secret_bearer_token_777";
    const redactedText = BrowserRedactor.redactText(sensitiveText);
    assert.ok(!redactedText.includes("secret_bearer_token_777"), "Bearer token must be redacted");
    console.log(`  -> PASSED: Secret tokens, cookies, and keys redacted.\n`);
  }

  // -------------------------------------------------------------
  // TEST R: Keyboard interaction produces correct semantic action
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST R] Keyboard interaction produces correct semantic action...`);
    const testIR: GraphPresentationIR = {
      schemaVersion: "2.0.0",
      viewType: "MISSION_OVERVIEW",
      title: "Interactive Test",
      subtitle: "Keyboard Accessibility Verification",
      missionId: "golden-short-001",
      nodes: [
        {
          id: "floor04_media_synthesis",
          label: "Floor 04",
          type: "FLOOR",
          status: "VERIFIED",
          truthLevel: "VERIFIED",
          evidenceRefs: [],
          visualHints: { isFocal: false, emphasis: "PRIMARY", icon: "📦", shape: "RECT" },
        },
      ],
      edges: [],
      groups: [],
      focus: [],
      emphasis: [],
      collapsedGroups: [],
      annotations: [],
      complexityBudget: { maxNodes: 20, currentNodes: 1, budgetExceeded: false, action: "NONE" },
      generatedAt: new Date().toISOString(),
    };

    const html = DeterministicGraphRenderer.renderInteractiveHTML(testIR);
    assert.ok(html.includes('e.key === "Enter" || e.key === " "'), "Must support Enter/Space for inspection");
    assert.ok(html.includes('e.key === "Escape"'), "Must support Escape to clear selection");
    assert.ok(html.includes('tabindex="0"'), "Interactive nodes must be focusable with Tab");
    console.log(`  -> PASSED: Accessible keyboard handlers present in deterministic output.\n`);
  }

  // -------------------------------------------------------------
  // TEST S: Last-good visualization remains intact after failed candidate
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST S] Last-good visualization remains intact after failed render candidate...`);
    const testDir = "data/evidence/visualizations/test_s_tmp";
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const validIR: GraphPresentationIR = {
      schemaVersion: "2.0.0",
      viewType: "MISSION_OVERVIEW",
      title: "Valid Baseline",
      subtitle: "Last Good Test",
      missionId: "mis_last_good",
      nodes: [
        {
          id: "n1",
          label: "Node 1",
          type: "FLOOR",
          status: "VERIFIED",
          truthLevel: "VERIFIED",
          evidenceRefs: [],
          visualHints: { isFocal: false, emphasis: "PRIMARY", icon: "📦", shape: "RECT" },
        },
      ],
      edges: [],
      groups: [],
      focus: [],
      emphasis: [],
      collapsedGroups: [],
      annotations: [],
      complexityBudget: { maxNodes: 10, currentNodes: 1, budgetExceeded: false, action: "NONE" },
      generatedAt: new Date().toISOString(),
    };

    const receiptGood = await DeterministicGraphRenderer.renderArtifact(validIR, testDir);
    assert.strictEqual(receiptGood.status, "DELIVERED");

    // Attempt invalid candidate with dangling edge (should fail validation)
    const invalidIR: GraphPresentationIR = {
      ...validIR,
      edges: [
        {
          id: "dangling_edge",
          from: "n1",
          to: "non_existent_target",
          type: "PLANNED_DEPENDENCY",
          truthLevel: "ASSERTED",
          status: "PLANNED",
          visualHints: { style: "dashed", color: "#888", marker: "arrow" },
        },
      ],
    };

    const receiptBad = await DeterministicGraphRenderer.renderArtifact(invalidIR, testDir);
    assert.strictEqual(receiptBad.status, "FAILED", "Candidate with dangling edge must fail validation");

    const lastGood = LastGoodVisualStore.getLastGood("MISSION_OVERVIEW", "mis_last_good");
    assert.ok(lastGood, "Last good visual store must be preserved");
    assert.strictEqual(lastGood?.presentationHash, receiptGood.presentationHash);
    console.log(`  -> PASSED: Last-known-good visual was committed and preserved.\n`);
  }

  // -------------------------------------------------------------
  // TEST T: Chrome unavailable reports BLOCKED and produces zero fake evidence
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[TEST T] Chrome unavailable reports BLOCKED with zero fake evidence...`);
    // Connect client to unavailable closed port
    const offlineClient = new ChromeDevToolsClient("http://127.0.0.1:9229");
    const avail = await offlineClient.checkAvailability();
    assert.strictEqual(avail.isAvailable, false, "Offline client must return isAvailable=false");

    const inspection = BrowserEvidenceResolver.resolve("br_offline_probe", [], {
      executionMode: "BLOCKED_BROWSER",
      status: "BLOCKED",
    });

    assert.strictEqual(inspection.executionMode, "BLOCKED_BROWSER");
    assert.strictEqual(inspection.resolved, false);
    assert.strictEqual(inspection.truthLevel, "UNKNOWN");
    console.log(`  -> PASSED: Chrome unavailable reported BLOCKED with zero fake evidence.\n`);
  }

  console.log(`======================================================`);
  console.log(` FACTORYOS VISUALIZATION V2 SUITE COMPLETED: ${testCount}/${testCount} PASSED`);
  console.log(`======================================================\n`);

  return { passed: true, testCount };
}

if (require.main === module) {
  runGraphInteractionTestSuite()
    .then(({ passed, testCount }) => {
      process.exit(passed ? 0 : 1);
    })
    .catch((err) => {
      console.error("FATAL: Test suite failed with error:", err);
      process.exit(1);
    });
}
