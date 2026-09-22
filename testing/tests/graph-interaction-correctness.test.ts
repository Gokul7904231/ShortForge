/**
 * FactoryOS v1 / Frontier v3 — Visualization V2 Correctness Hardening Test Suite
 * Authoritative verification of correctness invariants across:
 * - A1-A6: Artifact physical truth
 * - B1-B5: Edge evidence grounding
 * - C1-C4: Verification semantics
 * - D1-D4: Execution sequence truth
 * - E1:    Deterministic interaction identity
 * - F1-F4: Fail-closed navigation (OPEN_GRAPH_VIEW)
 * - G1-G4: Focus truth propagation
 * - H1-H3: Evidence graph relationship integrity (no orphan islands)
 * - I1-I4: SituationRecord evidence identity
 * - J1-J4: Cycle semantics & non-inference of causality
 */

import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { NodeInspectionResolver } from "../graphs/visual/NodeInspectionResolver";
import { EdgeExplanationResolver } from "../graphs/visual/EdgeExplanationResolver";
import { ArtifactInspectionResolver, type ArtifactDataRecord } from "../graphs/visual/ArtifactInspectionResolver";
import { BrowserEvidenceResolver } from "../graphs/visual/BrowserEvidenceResolver";
import { SituationInspectionResolver } from "../graphs/visual/SituationInspectionResolver";
import { GraphNavigationState } from "../graphs/visual/GraphNavigationState";
import { CyclePresentationPlanner } from "../graphs/visual/CyclePresentationPlanner";
import { VisualizationInteractionResolver } from "../graphs/visual/VisualizationInteractionResolver";
import { DeterministicGraphRenderer } from "../graphs/visual/DeterministicGraphRenderer";
import type { MissionGraphIR } from "../graphs/MissionGraph";
import type { EvidenceGraphIR } from "../graphs/EvidenceGraph";
import type { SituationRecord } from "../../model/SituationRecord";

export async function runGraphInteractionCorrectnessTestSuite(): Promise<{ passed: boolean; testCount: number }> {
  console.log(`\n======================================================================`);
  console.log(` FACTORYOS VISUALIZATION V2 CORRECTNESS HARDENING SUITE (A1 - K14)`);
  console.log(`======================================================================\n`);

  let testCount = 0;
  const testDir = path.resolve("data/evidence/correctness_test_tmp");
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  // ---------------------------------------------------------------------------
  // GROUP A: ARTIFACT PHYSICAL TRUTH (A1 - A6)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group A] Artifact Physical Truth Invariants ---`);

  // A1: Missing file + valid-looking metadata -> NOT PHYSICAL
  {
    testCount++;
    console.log(`[A1] Missing file + valid-looking metadata cannot become PHYSICAL...`);
    const record: ArtifactDataRecord = {
      id: "art_missing_01",
      path: "data/non_existent_dir/ghost_audio.wav",
      producer: "floor04",
      consumers: ["floor05"],
      byteLength: 204800,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      verificationStatus: "VERIFIED",
    };
    const res = ArtifactInspectionResolver.resolve("art_missing_01", [record]);
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.physicalExistenceProven, false, "Physical existence MUST NOT be proven when file is absent");
    assert.notStrictEqual(res.truthLevel, "PHYSICAL", "Truth level MUST NOT be PHYSICAL when file is missing");
    assert.strictEqual(res.truthLevel, "UNKNOWN");
    console.log(`  -> PASSED: Missing file correctly rejected from PHYSICAL truth.\n`);
  }

  // A2: Filesystem access error / directory path -> NOT PHYSICAL
  {
    testCount++;
    console.log(`[A2] Filesystem path that is a directory instead of a regular file -> NOT PHYSICAL...`);
    const dirPath = path.resolve(testDir, "test_dir_not_file");
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

    const record: ArtifactDataRecord = {
      id: "art_dir_path",
      path: dirPath,
      producer: "floor04",
      consumers: [],
      byteLength: 4096,
      sha256: "some_sha256_hash",
    };
    const res = ArtifactInspectionResolver.resolve("art_dir_path", [record]);
    assert.strictEqual(res.physicalExistenceProven, false, "Directory must not be treated as a regular physical file");
    assert.strictEqual(res.truthLevel, "UNKNOWN");
    console.log(`  -> PASSED: Inaccessible/directory path failed closed without physical claim.\n`);
  }

  // A3: Real file exists -> physical existence proven
  {
    testCount++;
    console.log(`[A3] Real physical file on disk -> physical existence proven...`);
    const realFile = path.resolve(testDir, "real_physical_sample.wav");
    const content = Buffer.from("RIFF....WAVEfmt ....data....physicalbytes999", "utf-8");
    fs.writeFileSync(realFile, content);

    const record: ArtifactDataRecord = {
      id: "art_real_01",
      path: realFile,
      producer: "floor04",
      consumers: ["floor05"],
      byteLength: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
    const res = ArtifactInspectionResolver.resolve("art_real_01", [record]);
    assert.strictEqual(res.physicalExistenceProven, true, "Real regular file must establish physical proof");
    assert.strictEqual(res.truthLevel, "PHYSICAL");
    assert.strictEqual(res.byteLength, content.length);
    console.log(`  -> PASSED: Real file verified with PHYSICAL truth level.\n`);
  }

  // A4: Real file + wrong supplied hash -> detect mismatch
  {
    testCount++;
    console.log(`[A4] Real file + wrong supplied hash -> detect hash mismatch...`);
    const realFile = path.resolve(testDir, "real_hash_mismatch.wav");
    const content = Buffer.from("RIFF....WAVEfmt ....data....actualcontent", "utf-8");
    fs.writeFileSync(realFile, content);

    const record: ArtifactDataRecord = {
      id: "art_mismatch_hash",
      path: realFile,
      producer: "floor04",
      consumers: [],
      byteLength: content.length,
      sha256: "0000000000000000000000000000000000000000000000000000000000000000", // Wrong hash
    };
    const res = ArtifactInspectionResolver.resolve("art_mismatch_hash", [record]);
    assert.strictEqual(res.physicalExistenceProven, true);
    assert.strictEqual(res.hashMismatchDetected, true, "Hash mismatch MUST be detected");
    assert.strictEqual(res.verificationStatus, "FAILED", "Verification must fail on hash mismatch");
    console.log(`  -> PASSED: Hash mismatch detected and flagged as FAILED.\n`);
  }

  // A5: Real file + recalculated hash -> calculated hash is authoritative physical digest
  {
    testCount++;
    console.log(`[A5] Real file + recalculated hash -> actual file bytes dictate digest...`);
    const realFile = path.resolve(testDir, "real_recalc.wav");
    const content = Buffer.from("RIFF....recalculated_bytes_authoritative", "utf-8");
    fs.writeFileSync(realFile, content);
    const expectedDigest = createHash("sha256").update(content).digest("hex");

    const record: ArtifactDataRecord = {
      id: "art_recalc",
      path: realFile,
      producer: "floor04",
      consumers: [],
      sha256: "UNKNOWN",
    };
    const res = ArtifactInspectionResolver.resolve("art_recalc", [record]);
    assert.strictEqual(res.physicalSha256, expectedDigest);
    assert.strictEqual(res.sha256, expectedDigest);
    console.log(`  -> PASSED: Authoritative physical digest computed directly from file bytes.\n`);
  }

  // A6: Reported byte length differs from actual stat size -> physical measurement wins
  {
    testCount++;
    console.log(`[A6] Reported byte length differs from actual stat size -> physical measurement wins...`);
    const realFile = path.resolve(testDir, "real_size_mismatch.wav");
    const content = Buffer.from("Exact15Bytes...", "utf-8"); // 15 bytes
    fs.writeFileSync(realFile, content);

    const record: ArtifactDataRecord = {
      id: "art_size_mismatch",
      path: realFile,
      producer: "floor04",
      consumers: [],
      byteLength: 999999, // False reported size
    };
    const res = ArtifactInspectionResolver.resolve("art_size_mismatch", [record]);
    assert.strictEqual(res.reportedByteLength, 999999);
    assert.strictEqual(res.physicalByteLength, 15);
    assert.strictEqual(res.byteLength, 15, "Physical measurement MUST win over reported metadata");
    assert.strictEqual(res.sizeMismatchDetected, true);
    console.log(`  -> PASSED: Physical measurement overrode erroneous reported metadata.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP B: EDGE-SPECIFIC EVIDENCE GROUNDING (B1 - B5)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group B] Edge Evidence Grounding Invariants ---`);

  const edgeTestMissionGraph: MissionGraphIR = {
    schemaVersion: "1.0.0",
    missionId: "mis_edge_test",
    runId: "run_edge_001",
    createdAt: new Date().toISOString(),
    nodes: [
      { id: "node_src", type: "FLOOR", label: "Source Floor", truthLevel: "VERIFIED", status: "VERIFIED" },
      { id: "node_tgt", type: "FLOOR", label: "Target Floor", truthLevel: "VERIFIED", status: "VERIFIED" },
    ],
    edges: [
      {
        id: "edge_src_tgt",
        from: "node_src",
        to: "node_tgt",
        type: "EXECUTION_SEQUENCE",
        truthLevel: "OBSERVED",
        status: "OBSERVED",
      },
    ],
  };

  // B1: Evidence attached ONLY to source node -> does not prove edge
  {
    testCount++;
    console.log(`[B1] Evidence attached only to source node does not become edge proof...`);
    const evidenceGraph: EvidenceGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_edge_test",
      runId: "run_edge_001",
      createdAt: new Date().toISOString(),
      evidenceNodes: [
        {
          id: "ev_src_only",
          category: "DURABLE_EVENT_RECORD",
          truthLevel: "VERIFIED",
          subjectId: "node_src",
          timestamp: new Date().toISOString(),
          description: "Evidence proving source node",
        },
      ],
      evidenceEdges: [
        { id: "ee_src", evidenceNodeId: "ev_src_only", targetGraphNodeId: "node_src", relationship: "PROVES_NODE_EXISTENCE" },
      ],
    };
    const res = EdgeExplanationResolver.resolve("edge_src_tgt", {
      missionGraph: edgeTestMissionGraph,
      evidenceGraph,
    });
    assert.strictEqual(res.evidenceRefs.includes("ev_src_only"), false, "Source node evidence MUST NOT be direct edge evidence");
    assert.strictEqual(res.contextualEndpointEvidence?.includes("ev_src_only"), true, "Must appear as contextual endpoint evidence");
    console.log(`  -> PASSED: Endpoint evidence properly isolated from edge proof.\n`);
  }

  // B2: Evidence attached ONLY to target node -> does not prove edge
  {
    testCount++;
    console.log(`[B2] Evidence attached only to target node does not become edge proof...`);
    const evidenceGraph: EvidenceGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_edge_test",
      runId: "run_edge_001",
      createdAt: new Date().toISOString(),
      evidenceNodes: [
        {
          id: "ev_tgt_only",
          category: "DURABLE_EVENT_RECORD",
          truthLevel: "VERIFIED",
          subjectId: "node_tgt",
          timestamp: new Date().toISOString(),
          description: "Evidence proving target node",
        },
      ],
      evidenceEdges: [
        { id: "ee_tgt", evidenceNodeId: "ev_tgt_only", targetGraphNodeId: "node_tgt", relationship: "PROVES_NODE_EXISTENCE" },
      ],
    };
    const res = EdgeExplanationResolver.resolve("edge_src_tgt", {
      missionGraph: edgeTestMissionGraph,
      evidenceGraph,
    });
    assert.strictEqual(res.evidenceRefs.includes("ev_tgt_only"), false);
    assert.strictEqual(res.contextualEndpointEvidence?.includes("ev_tgt_only"), true);
    console.log(`  -> PASSED: Target node evidence properly isolated as contextual.\n`);
  }

  // B3: Direct evidence attached to edge -> appears in edge evidence
  {
    testCount++;
    console.log(`[B3] Direct evidence explicitly attached to edge -> appears in edge evidence...`);
    const evidenceGraph: EvidenceGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_edge_test",
      runId: "run_edge_001",
      createdAt: new Date().toISOString(),
      evidenceNodes: [
        {
          id: "ev_direct_edge_proof",
          category: "DURABLE_EVENT_RECORD",
          truthLevel: "VERIFIED",
          subjectId: "edge_src_tgt",
          timestamp: new Date().toISOString(),
          description: "Direct handoff verification receipt",
        },
      ],
      evidenceEdges: [
        { id: "ee_edge", evidenceNodeId: "ev_direct_edge_proof", targetGraphNodeId: "edge_src_tgt", relationship: "PROVES_STATE_TRANSITION" },
      ],
    };
    const res = EdgeExplanationResolver.resolve("edge_src_tgt", {
      missionGraph: edgeTestMissionGraph,
      evidenceGraph,
    });
    assert.strictEqual(res.evidenceRefs.includes("ev_direct_edge_proof"), true, "Direct edge evidence MUST be included");
    console.log(`  -> PASSED: Direct edge evidence correctly identified.\n`);
  }

  // B4: Artifact producer/consumer lineage explicitly proves transfer
  {
    testCount++;
    console.log(`[B4] Artifact producer/consumer lineage explicitly grounds transfer edge...`);
    const artifactTransferGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_edge_test",
      runId: "run_edge_001",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "f4", type: "FLOOR", label: "F4 Voice", truthLevel: "VERIFIED", status: "VERIFIED", metadata: { artifactId: "art_wav" } },
        { id: "f5", type: "FLOOR", label: "F5 Timeline", truthLevel: "VERIFIED", status: "VERIFIED" },
      ],
      edges: [
        { id: "edge_transfer", from: "f4", to: "f5", type: "ARTIFACT_PRODUCED", truthLevel: "OBSERVED", status: "VERIFIED" },
      ],
    };
    const evidenceGraph: EvidenceGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_edge_test",
      runId: "run_edge_001",
      createdAt: new Date().toISOString(),
      evidenceNodes: [
        {
          id: "ev_art_lineage",
          category: "SHA256_BYTE_DIGEST",
          truthLevel: "VERIFIED",
          subjectId: "art_wav",
          timestamp: new Date().toISOString(),
          description: "Artifact SHA256 digest proving byte identity",
        },
      ],
      evidenceEdges: [
        { id: "ee_art", evidenceNodeId: "ev_art_lineage", targetGraphNodeId: "f4", relationship: "PROVES_ARTIFACT_INTEGRITY" },
      ],
    };
    const res = EdgeExplanationResolver.resolve("edge_transfer", {
      missionGraph: artifactTransferGraph,
      evidenceGraph,
      physicalArtifacts: [
        { id: "art_wav", path: "data/audio.wav", byteLength: 500, sha256: "abc12345", existsPhysically: true },
      ],
    });
    assert.strictEqual(res.evidenceRefs.includes("ev_art_lineage"), true, "Transferred artifact evidence grounds transfer edge");
    console.log(`  -> PASSED: Transferred artifact lineage grounds relationship.\n`);
  }

  // B5: No edge proof -> edge remains unverified
  {
    testCount++;
    console.log(`[B5] No edge proof -> edge remains OBSERVED without verification claim...`);
    const res = EdgeExplanationResolver.resolve("edge_src_tgt", {
      missionGraph: edgeTestMissionGraph,
      evidenceGraph: undefined,
    });
    assert.strictEqual(res.evidenceRefs.length, 0);
    assert.strictEqual(res.verificationStatus, "UNVERIFIED");
    assert.strictEqual(res.verification, undefined);
    console.log(`  -> PASSED: Edge with zero proof safely remains UNVERIFIED.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP C: VERIFICATION DERIVATION (C1 - C4)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group C] Verification Derivation Invariants ---`);

  // C1: Verified artifact but unverified edge -> edge remains unverified
  {
    testCount++;
    console.log(`[C1] Verified artifact does not automatically verify graph edge...`);
    const testGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_c1",
      runId: "run_c1",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "node_a", type: "FLOOR", label: "A", truthLevel: "VERIFIED", status: "VERIFIED" },
        { id: "node_b", type: "FLOOR", label: "B", truthLevel: "VERIFIED", status: "VERIFIED" },
      ],
      edges: [
        { id: "edge_unverified", from: "node_a", to: "node_b", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "OBSERVED" },
      ],
    };
    // Evidence proves an artifact on node_a, but NO evidence proves edge_unverified
    const evidenceGraph: EvidenceGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_c1",
      runId: "run_c1",
      createdAt: new Date().toISOString(),
      evidenceNodes: [
        {
          id: "ev_probe_ffprobe",
          category: "FFPROBE_STREAM_METRIC",
          truthLevel: "VERIFIED",
          subjectId: "art_sample",
          timestamp: new Date().toISOString(),
          description: "FFPROBE stream probe for artifact",
        },
      ],
      evidenceEdges: [
        { id: "ee1", evidenceNodeId: "ev_probe_ffprobe", targetGraphNodeId: "node_a", relationship: "PROVES_ARTIFACT_INTEGRITY" },
      ],
    };
    const res = EdgeExplanationResolver.resolve("edge_unverified", {
      missionGraph: testGraph,
      evidenceGraph,
    });
    assert.notStrictEqual(res.verificationStatus, "VERIFIED", "Artifact probe on node MUST NOT verify edge");
    assert.strictEqual(res.verification, undefined);
    console.log(`  -> PASSED: Artifact verification did not leak into relationship verification.\n`);
  }

  // C2: Verified source + verified target -> edge does not automatically become verified
  {
    testCount++;
    console.log(`[C2] Verified source + verified target does not verify intermediate edge...`);
    const testGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_c2",
      runId: "run_c2",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "src_v", type: "FLOOR", label: "Source", truthLevel: "VERIFIED", status: "VERIFIED" },
        { id: "tgt_v", type: "FLOOR", label: "Target", truthLevel: "VERIFIED", status: "VERIFIED" },
      ],
      edges: [
        { id: "edge_between", from: "src_v", to: "tgt_v", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "OBSERVED" },
      ],
    };
    const res = EdgeExplanationResolver.resolve("edge_between", {
      missionGraph: testGraph,
    });
    assert.strictEqual(res.verificationStatus, "UNVERIFIED");
    assert.notStrictEqual(res.truthLevel, "VERIFIED");
    console.log(`  -> PASSED: Intermediate edge remained unverified despite verified endpoints.\n`);
  }

  // C3: Explicit edge verification evidence -> edge verification becomes VERIFIED
  {
    testCount++;
    console.log(`[C3] Explicit edge verification evidence -> edge becomes VERIFIED...`);
    const testGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_c3",
      runId: "run_c3",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "src_c3", type: "FLOOR", label: "Source", truthLevel: "VERIFIED", status: "VERIFIED" },
        { id: "tgt_c3", type: "FLOOR", label: "Target", truthLevel: "VERIFIED", status: "VERIFIED" },
      ],
      edges: [
        {
          id: "edge_verified_direct",
          from: "src_c3",
          to: "tgt_c3",
          type: "VERIFICATION",
          truthLevel: "VERIFIED",
          status: "VERIFIED",
          metadata: { verified: true },
        } as any,
      ],
    };
    const evidenceGraph: EvidenceGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_c3",
      runId: "run_c3",
      createdAt: new Date().toISOString(),
      evidenceNodes: [
        {
          id: "ev_direct_edge_probe",
          category: "DURABLE_EVENT_RECORD",
          truthLevel: "VERIFIED",
          subjectId: "edge_verified_direct",
          timestamp: new Date().toISOString(),
          description: "Authoritative verification probe of handoff execution",
        },
      ],
      evidenceEdges: [
        { id: "ee_direct", evidenceNodeId: "ev_direct_edge_probe", targetGraphNodeId: "edge_verified_direct", relationship: "PROVES_STATE_TRANSITION" },
      ],
    };
    const res = EdgeExplanationResolver.resolve("edge_verified_direct", {
      missionGraph: testGraph,
      evidenceGraph,
    });
    assert.strictEqual(res.verificationStatus, "VERIFIED");
    assert.strictEqual(res.verification?.verified, true);
    console.log(`  -> PASSED: Explicit edge verification evidence established verified status.\n`);
  }

  // C4: Missing verification proof -> verification = UNKNOWN / NOT_ESTABLISHED
  {
    testCount++;
    console.log(`[C4] Missing verification proof -> verificationStatus = NOT_ESTABLISHED...`);
    const testGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_c4",
      runId: "run_c4",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "p1", type: "FLOOR", label: "Planned 1", truthLevel: "ASSERTED", status: "PLANNED" },
        { id: "p2", type: "FLOOR", label: "Planned 2", truthLevel: "ASSERTED", status: "PLANNED" },
      ],
      edges: [
        { id: "e_planned", from: "p1", to: "p2", type: "PLANNED_DEPENDENCY", truthLevel: "ASSERTED", status: "PLANNED" },
      ],
    };
    const res = EdgeExplanationResolver.resolve("e_planned", { missionGraph: testGraph });
    assert.strictEqual(res.verificationStatus, "NOT_ESTABLISHED");
    assert.strictEqual(res.verification, undefined);
    console.log(`  -> PASSED: Planned edge verification reported NOT_ESTABLISHED.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP D: EXECUTION SEQUENCE TRUTH (D1 - D4)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group D] Execution Sequence Truth Invariants ---`);

  // D1: Node state only -> RECONSTRUCTED from NODE_STATE
  {
    testCount++;
    console.log(`[D1] Node status transition without runtime event -> RECONSTRUCTED from NODE_STATE...`);
    const testGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_d1",
      runId: "run_d1",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "f1", type: "FLOOR", label: "F1", truthLevel: "OBSERVED", status: "OBSERVED" },
        { id: "f2", type: "FLOOR", label: "F2", truthLevel: "OBSERVED", status: "OBSERVED" },
      ],
      edges: [{ id: "e_seq", from: "f1", to: "f2", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "OBSERVED" }],
    };
    const res = EdgeExplanationResolver.resolve("e_seq", {
      missionGraph: testGraph,
      executionEvents: [], // Zero runtime events
    });
    const f1Step = res.executionSequence.find((s) => s.step.includes("F1 execution initiated"));
    assert.ok(f1Step, "Sequence step must exist");
    assert.strictEqual(f1Step!.truthLevel, "RECONSTRUCTED", "Derived sequence must be RECONSTRUCTED, not OBSERVED");
    assert.strictEqual(f1Step!.source, "NODE_STATE");
    console.log(`  -> PASSED: Node state safely classified as RECONSTRUCTED.\n`);
  }

  // D2: Actual execution event -> OBSERVED from EXECUTION_EVENT
  {
    testCount++;
    console.log(`[D2] Actual execution event present -> OBSERVED from EXECUTION_EVENT...`);
    const testGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_d2",
      runId: "run_d2",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "f1_ev", type: "FLOOR", label: "F1", truthLevel: "OBSERVED", status: "OBSERVED" },
        { id: "f2_ev", type: "FLOOR", label: "F2", truthLevel: "OBSERVED", status: "OBSERVED" },
      ],
      edges: [{ id: "e_ev", from: "f1_ev", to: "f2_ev", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "OBSERVED" }],
    };
    const res = EdgeExplanationResolver.resolve("e_ev", {
      missionGraph: testGraph,
      executionEvents: [
        { eventId: "evt_init_01", targetId: "f1_ev", type: "INIT_RUN", timestamp: new Date().toISOString() },
      ],
    });
    const f1Step = res.executionSequence.find((s) => s.step.includes("F1 execution initiated"));
    assert.ok(f1Step);
    assert.strictEqual(f1Step!.truthLevel, "OBSERVED", "Actual event justifies OBSERVED truth level");
    assert.strictEqual(f1Step!.source, "EXECUTION_EVENT");
    console.log(`  -> PASSED: Execution event correctly surfaced as OBSERVED.\n`);
  }

  // D3: Planned node -> PLANNED / ASSERTED semantics
  {
    testCount++;
    console.log(`[D3] Planned node produces PLANNED status and ASSERTED truth...`);
    const testGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_d3",
      runId: "run_d3",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "plan_a", type: "FLOOR", label: "Planned A", truthLevel: "ASSERTED", status: "PLANNED" },
        { id: "plan_b", type: "FLOOR", label: "Planned B", truthLevel: "ASSERTED", status: "PLANNED" },
      ],
      edges: [{ id: "e_plan", from: "plan_a", to: "plan_b", type: "PLANNED_DEPENDENCY", truthLevel: "ASSERTED", status: "PLANNED" }],
    };
    const res = EdgeExplanationResolver.resolve("e_plan", { missionGraph: testGraph });
    const stepA = res.executionSequence.find((s) => s.step.includes("Planned A"));
    assert.ok(stepA);
    assert.strictEqual(stepA!.status, "PLANNED");
    assert.strictEqual(stepA!.truthLevel, "ASSERTED");
    console.log(`  -> PASSED: Planned node maintained strict ASSERTED truth.\n`);
  }

  // D4: Missing event -> never fabricate execution event
  {
    testCount++;
    console.log(`[D4] Missing event never results in EXECUTION_EVENT source...`);
    const testGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_d4",
      runId: "run_d4",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "n_a", type: "FLOOR", label: "NA", truthLevel: "OBSERVED", status: "COMPLETED" },
        { id: "n_b", type: "FLOOR", label: "NB", truthLevel: "OBSERVED", status: "COMPLETED" },
      ],
      edges: [{ id: "e_ab", from: "n_a", to: "n_b", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "COMPLETED" }],
    };
    const res = EdgeExplanationResolver.resolve("e_ab", { missionGraph: testGraph, executionEvents: [] });
    for (const step of res.executionSequence) {
      assert.notStrictEqual(step.source, "EXECUTION_EVENT", "Must not claim EXECUTION_EVENT when events are absent");
    }
    console.log(`  -> PASSED: Zero fabrication of execution event sources.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP E: DETERMINISTIC INTERACTION IDENTITY (E1)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group E] Deterministic Interaction Identity Invariants ---`);

  // E1: Deterministic interaction identity
  {
    testCount++;
    console.log(`[E1] Interaction ID is deterministic and independent of current wall-clock time...`);
    const env = {
      missionGraph: edgeTestMissionGraph,
      viewType: "MISSION_OVERVIEW" as const,
    };
    const actionA = { type: "OPEN_SUBJECT" as const, subjectId: "node_src" };
    const actionB = { type: "OPEN_SUBJECT" as const, subjectId: "node_tgt" };

    const idA1 = VisualizationInteractionResolver.computeDeterministicInteractionId(actionA, env, "MISSION_OVERVIEW");
    const idA2 = VisualizationInteractionResolver.computeDeterministicInteractionId(actionA, env, "MISSION_OVERVIEW");
    const idB = VisualizationInteractionResolver.computeDeterministicInteractionId(actionB, env, "MISSION_OVERVIEW");

    assert.strictEqual(idA1, idA2, "Identical invocation parameters MUST yield identical interactionId");
    assert.notStrictEqual(idA1, idB, "Different target MUST yield different interactionId");

    const envDifferentRun = {
      ...env,
      missionGraph: { ...edgeTestMissionGraph, runId: "run_edge_999" },
    };
    const idA_diffRun = VisualizationInteractionResolver.computeDeterministicInteractionId(actionA, envDifferentRun, "MISSION_OVERVIEW");
    assert.notStrictEqual(idA1, idA_diffRun, "Different runId MUST yield different interactionId");
    console.log(`  -> PASSED: Interaction identity is strictly deterministic without Date.now() entropy.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP F: FAIL-CLOSED NAVIGATION & OPEN_GRAPH_VIEW (F1 - F4)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group F] Fail-Closed Navigation Invariants ---`);

  // F1: Valid view -> resolved
  {
    testCount++;
    console.log(`[F1] Valid graph view -> resolved=true...`);
    const env = { missionGraph: edgeTestMissionGraph };
    const nav = new GraphNavigationState({ viewType: "MISSION_OVERVIEW" });
    const { receipt } = VisualizationInteractionResolver.dispatch(
      { type: "OPEN_GRAPH_VIEW", viewType: "OVERSEER_OPERATIONAL" },
      env,
      nav
    );
    assert.strictEqual(receipt.resolved, true);
    assert.strictEqual(receipt.sourceView, "OVERSEER_OPERATIONAL");
    console.log(`  -> PASSED: Valid view resolved cleanly.\n`);
  }

  // F2: Invalid view type -> rejected
  {
    testCount++;
    console.log(`[F2] Invalid view type -> fails closed with explicit diagnostic...`);
    const env = { missionGraph: edgeTestMissionGraph };
    const nav = new GraphNavigationState({ viewType: "MISSION_OVERVIEW" });
    const { receipt } = VisualizationInteractionResolver.dispatch(
      { type: "OPEN_GRAPH_VIEW", viewType: "NON_EXISTENT_VIEW_TYPE" as any },
      env,
      nav
    );
    assert.strictEqual(receipt.resolved, false, "Invalid view type must fail closed");
    assert.strictEqual(receipt.truthLevel, "UNKNOWN");
    assert.ok(receipt.diagnostics.some((d) => d.code === "INVALID_VIEW_TYPE"));
    assert.strictEqual(nav.current().viewType, "MISSION_OVERVIEW", "Must not push invalid navigation state");
    console.log(`  -> PASSED: Invalid view type failed closed.\n`);
  }

  // F3: Unknown subject -> rejected
  {
    testCount++;
    console.log(`[F3] Unknown subject supplied to OPEN_GRAPH_VIEW -> rejected...`);
    const env = { missionGraph: edgeTestMissionGraph };
    const nav = new GraphNavigationState({ viewType: "MISSION_OVERVIEW" });
    const { receipt } = VisualizationInteractionResolver.dispatch(
      { type: "OPEN_GRAPH_VIEW", viewType: "EVIDENCE_DRILLDOWN", subjectId: "non_existent_subject_xyz" },
      env,
      nav
    );
    assert.strictEqual(receipt.resolved, false, "Unknown subject must fail closed");
    assert.ok(receipt.diagnostics.some((d) => d.code === "UNKNOWN_SUBJECT"));
    console.log(`  -> PASSED: Unknown subject rejected before navigation push.\n`);
  }

  // F4: Valid view + valid subject -> navigation push occurs
  {
    testCount++;
    console.log(`[F4] Valid view + valid subject -> navigation push occurs...`);
    const env = { missionGraph: edgeTestMissionGraph };
    const nav = new GraphNavigationState({ viewType: "MISSION_OVERVIEW" });
    const { receipt } = VisualizationInteractionResolver.dispatch(
      { type: "OPEN_GRAPH_VIEW", viewType: "EVIDENCE_DRILLDOWN", subjectId: "node_src" },
      env,
      nav
    );
    assert.strictEqual(receipt.resolved, true);
    assert.strictEqual(nav.current().viewType, "EVIDENCE_DRILLDOWN");
    assert.strictEqual(nav.current().subjectId, "node_src");
    console.log(`  -> PASSED: Valid view and subject pushed onto navigation stack.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP G: FOCUS-SUBGRAPH TRUTH PROPAGATION (G1 - G4)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group G] Focus-Subgraph Truth Propagation Invariants ---`);

  const truthSubjectGraph: MissionGraphIR = {
    schemaVersion: "1.0.0",
    missionId: "mis_g",
    runId: "run_g",
    createdAt: new Date().toISOString(),
    nodes: [
      { id: "node_unknown", type: "FLOOR", label: "Unknown Node", truthLevel: "UNKNOWN", status: "UNKNOWN" },
      { id: "node_observed", type: "FLOOR", label: "Observed Node", truthLevel: "OBSERVED", status: "OBSERVED" },
      { id: "node_verified", type: "FLOOR", label: "Verified Node", truthLevel: "VERIFIED", status: "VERIFIED" },
    ],
    edges: [],
  };

  // G1: UNKNOWN subject -> focused result does not become VERIFIED
  {
    testCount++;
    console.log(`[G1] UNKNOWN subject focus does not become VERIFIED...`);
    const env = { missionGraph: truthSubjectGraph };
    const { receipt } = VisualizationInteractionResolver.dispatch(
      { type: "FOCUS_SUBGRAPH", subjectId: "node_unknown" },
      env
    );
    assert.strictEqual(receipt.resolved, true, "Resolution may succeed structurally");
    assert.strictEqual(receipt.truthLevel, "UNKNOWN", "Truth level MUST remain UNKNOWN, never upgraded");
    console.log(`  -> PASSED: UNKNOWN subject truth level strictly preserved.\n`);
  }

  // G2: OBSERVED subject -> remains OBSERVED
  {
    testCount++;
    console.log(`[G2] OBSERVED subject focus remains OBSERVED...`);
    const env = { missionGraph: truthSubjectGraph };
    const { receipt } = VisualizationInteractionResolver.dispatch(
      { type: "FOCUS_SUBGRAPH", subjectId: "node_observed" },
      env
    );
    assert.strictEqual(receipt.truthLevel, "OBSERVED");
    console.log(`  -> PASSED: OBSERVED subject truth level preserved.\n`);
  }

  // G3: VERIFIED subject -> remains VERIFIED
  {
    testCount++;
    console.log(`[G3] VERIFIED subject focus remains VERIFIED...`);
    const env = { missionGraph: truthSubjectGraph };
    const { receipt } = VisualizationInteractionResolver.dispatch(
      { type: "FOCUS_SUBGRAPH", subjectId: "node_verified" },
      env
    );
    assert.strictEqual(receipt.truthLevel, "VERIFIED");
    console.log(`  -> PASSED: VERIFIED subject truth level preserved.\n`);
  }

  // G4: Projection succeeds but source truth UNKNOWN -> resolution succeeds, truth remains UNKNOWN
  {
    testCount++;
    console.log(`[G4] Projection succeeds structurally while truth remains UNKNOWN...`);
    const env = { missionGraph: truthSubjectGraph };
    const { receipt, result } = VisualizationInteractionResolver.dispatch(
      { type: "FOCUS_SUBGRAPH", subjectId: "node_unknown" },
      env
    );
    assert.strictEqual(receipt.resolved, true);
    assert.strictEqual(receipt.truthLevel, "UNKNOWN");
    assert.ok(result, "Focused presentation IR exists");
    console.log(`  -> PASSED: Resolution status cleanly separated from truth level.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP H: EVIDENCE GRAPH RELATIONSHIP INTEGRITY (H1 - H3)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group H] Evidence Graph Relationship Integrity Invariants ---`);

  const focusIntegrityMissionGraph: MissionGraphIR = {
    schemaVersion: "1.0.0",
    missionId: "mis_h",
    runId: "run_h",
    createdAt: new Date().toISOString(),
    nodes: [
      { id: "target_floor", type: "FLOOR", label: "Target Floor", truthLevel: "VERIFIED", status: "VERIFIED" },
    ],
    edges: [],
  };

  const focusIntegrityEvidenceGraph: EvidenceGraphIR = {
    schemaVersion: "1.0.0",
    missionId: "mis_h",
    runId: "run_h",
    createdAt: new Date().toISOString(),
    evidenceNodes: [
      {
        id: "ev_direct_child",
        category: "DURABLE_EVENT_RECORD",
        truthLevel: "VERIFIED",
        subjectId: "target_floor",
        timestamp: new Date().toISOString(),
        description: "Direct supporting evidence",
      },
    ],
    evidenceEdges: [
      { id: "ev_rel_1", evidenceNodeId: "ev_direct_child", targetGraphNodeId: "target_floor", relationship: "GROUNDS_STATE" },
    ],
  };

  // H1: Evidence node displayed -> supporting presentation relation exists (zero orphan islands)
  {
    testCount++;
    console.log(`[H1] Displayed evidence node has supporting presentation edge (no orphan islands)...`);
    const env = { missionGraph: focusIntegrityMissionGraph, evidenceGraph: focusIntegrityEvidenceGraph };
    const focusIR = VisualizationInteractionResolver.buildFocusSubgraph("target_floor", env);
    assert.ok(focusIR);

    const hasEvNode = focusIR!.nodes.some((n) => n.id === "ev_direct_child");
    assert.strictEqual(hasEvNode, true, "Evidence node must be in focus graph");

    // Must have an edge connecting target_floor to ev_direct_child
    const supportingEdge = focusIR!.edges.find(
      (e) => (e.from === "target_floor" && e.to === "ev_direct_child") || (e.to === "target_floor" && e.from === "ev_direct_child")
    );
    assert.ok(supportingEdge, "Every displayed evidence node MUST have a connecting presentation edge");
    assert.strictEqual(supportingEdge!.type, "EVIDENCE_SUPPORT");
    console.log(`  -> PASSED: Evidence node cleanly connected via EVIDENCE_SUPPORT edge.\n`);
  }

  // H2: Evidence node with no valid relation is not injected into canvas
  {
    testCount++;
    console.log(`[H2] Unrelated evidence node is not injected into focused canvas...`);
    const unrelatedEvidenceGraph: EvidenceGraphIR = {
      ...focusIntegrityEvidenceGraph,
      evidenceNodes: [
        ...focusIntegrityEvidenceGraph.evidenceNodes,
        {
          id: "ev_unrelated",
          category: "DURABLE_EVENT_RECORD",
          truthLevel: "VERIFIED",
          subjectId: "different_unrelated_node",
          timestamp: new Date().toISOString(),
          description: "Unrelated evidence",
        },
      ],
      evidenceEdges: [
        ...focusIntegrityEvidenceGraph.evidenceEdges,
        { id: "ee_unrelated", evidenceNodeId: "ev_unrelated", targetGraphNodeId: "different_unrelated_node", relationship: "GROUNDS_STATE" },
      ],
    };
    const env = { missionGraph: focusIntegrityMissionGraph, evidenceGraph: unrelatedEvidenceGraph };
    const focusIR = VisualizationInteractionResolver.buildFocusSubgraph("target_floor", env);
    assert.ok(focusIR);
    assert.strictEqual(focusIR!.nodes.some((n) => n.id === "ev_unrelated"), false, "Unrelated evidence MUST NOT be injected");
    console.log(`  -> PASSED: Unrelated evidence pruned from canvas.\n`);
  }

  // H3: All PresentationIR edges have valid endpoints existing in nodes
  {
    testCount++;
    console.log(`[H3] All PresentationIR edges have valid endpoints present in nodes array...`);
    const env = { missionGraph: focusIntegrityMissionGraph, evidenceGraph: focusIntegrityEvidenceGraph };
    const focusIR = VisualizationInteractionResolver.buildFocusSubgraph("target_floor", env);
    assert.ok(focusIR);

    const nodeIds = new Set(focusIR!.nodes.map((n) => n.id));
    for (const edge of focusIR!.edges) {
      assert.ok(nodeIds.has(edge.from), `Edge source '${edge.from}' must exist in nodes`);
      assert.ok(nodeIds.has(edge.to), `Edge target '${edge.to}' must exist in nodes`);
    }
    console.log(`  -> PASSED: Zero dangling presentation edges.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP I: SITUATION RECORD EVIDENCE IDENTITY (I1 - I4)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group I] SituationRecord Evidence Identity Invariants ---`);

  // I1: Canonical evidence ID preserved exactly
  {
    testCount++;
    console.log(`[I1] Canonical evidence ID preserved exactly...`);
    const situation: SituationRecord = {
      id: "sit_i1",
      missionId: "mis_i",
      sender: { agentId: "agent_a", role: "ROLE" },
      recipients: [],
      type: "STATUS",
      priority: "NORMAL",
      text: "Testing exact canonical ID preservation",
      graph: { nodes: [], edges: [] },
      evidence: [
        {
          evidenceId: "ev_canonical_exact_123",
          type: "ARTIFACT",
          truthLevel: "PHYSICAL",
          description: "Canonical artifact",
        },
      ],
      createdAt: new Date().toISOString(),
    };
    const evGraph: EvidenceGraphIR = {
      schemaVersion: "2.0.0",
      missionId: "mis_i",
      runId: "run_i",
      evidenceNodes: [
        {
          id: "ev_canonical_exact_123",
          category: "PHYSICAL_FILE_ON_DISK",
          truthLevel: "PHYSICAL",
          subjectId: "art_exact",
          timestamp: new Date().toISOString(),
          description: "Canonical artifact node",
        },
      ],
      evidenceEdges: [],
    };
    const res = SituationInspectionResolver.resolve("sit_i1", [situation], evGraph);
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.evidenceRefs[0], "ev_canonical_exact_123");
    console.log(`  -> PASSED: Canonical evidence ID preserved exactly.\n`);
  }

  // I2: URI/path only preserved as source reference, not mislabeled canonical ID
  {
    testCount++;
    console.log(`[I2] Raw URI/path only without canonical ID preserved as unresolved reference...`);
    const situation: SituationRecord = {
      id: "sit_i2",
      missionId: "mis_i",
      sender: { agentId: "agent_a", role: "ROLE" },
      recipients: [],
      type: "STATUS",
      priority: "NORMAL",
      text: "Testing raw URI reference",
      graph: { nodes: [], edges: [] },
      evidence: [
        {
          type: "PHYSICAL_FILE" as any,
          truthLevel: "PHYSICAL",
          uriOrPath: "data/artifacts/unregistered_file.wav",
          description: "Unregistered file",
        } as any,
      ],
      createdAt: new Date().toISOString(),
    };
    const res = SituationInspectionResolver.resolve("sit_i2", [situation]);
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.evidenceRefs.length, 0, "Raw path must NOT be placed into canonical evidenceRefs");
    assert.ok(res.unresolvedReferences?.includes("data/artifacts/unregistered_file.wav"));
    console.log(`  -> PASSED: Raw path correctly isolated in unresolvedReferences.\n`);
  }

  // I3: Evidence reference maps to EvidenceGraph node -> resolver maps to canonical ID
  {
    testCount++;
    console.log(`[I3] Evidence reference with URI maps to canonical EvidenceGraph node ID...`);
    const situation: SituationRecord = {
      id: "sit_i3",
      missionId: "mis_i",
      sender: { agentId: "agent_a", role: "ROLE" },
      recipients: [],
      type: "STATUS",
      priority: "NORMAL",
      text: "Testing URI resolution via EvidenceGraph",
      graph: { nodes: [], edges: [] },
      evidence: [
        {
          type: "PHYSICAL_FILE" as any,
          truthLevel: "PHYSICAL",
          uriOrPath: "data/known_file.wav",
          description: "Known file",
        } as any,
      ],
      createdAt: new Date().toISOString(),
    };
    const evidenceGraph: EvidenceGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_i",
      runId: "run_i",
      createdAt: new Date().toISOString(),
      evidenceNodes: [
        {
          id: "ev_canonical_file_known",
          category: "PHYSICAL_FILE_ON_DISK",
          truthLevel: "PHYSICAL",
          subjectId: "art_known",
          physicalPath: "data/known_file.wav",
          timestamp: new Date().toISOString(),
          description: "Known registered file",
        },
      ],
      evidenceEdges: [],
    };
    const res = SituationInspectionResolver.resolve("sit_i3", [situation], evidenceGraph);
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.evidenceRefs[0], "ev_canonical_file_known", "Must resolve to canonical EvidenceNode ID");
    console.log(`  -> PASSED: URI mapped to canonical EvidenceNode ID.\n`);
  }

  // I4: Untraced evidence reference remains UNRESOLVED
  {
    testCount++;
    console.log(`[I4] Untraced evidence reference marked UNRESOLVED...`);
    const situation: SituationRecord = {
      id: "sit_i4",
      missionId: "mis_i",
      sender: { agentId: "agent_a", role: "ROLE" },
      recipients: [],
      type: "STATUS",
      priority: "NORMAL",
      text: "Testing untraced reference",
      graph: { nodes: [], edges: [] },
      evidence: [{ type: "DECISION_LEDGER", truthLevel: "UNKNOWN", description: "Empty ref" } as any],
      createdAt: new Date().toISOString(),
    };
    const res = SituationInspectionResolver.resolve("sit_i4", [situation]);
    assert.strictEqual(res.resolved, true);
    assert.ok(res.unresolvedReferences?.includes("UNRESOLVED_REFERENCE"));
    console.log(`  -> PASSED: Untraced reference marked UNRESOLVED_REFERENCE.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP J: CYCLE SEMANTICS (J1 - J4)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group J] Cycle Semantics Invariants ---`);

  // J1: Cycle detected -> cyclic structure preserved
  {
    testCount++;
    console.log(`[J1] Cycle detected -> cyclic structure preserved...`);
    const cyclicGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_j1",
      runId: "run_j1",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "A", type: "FLOOR", label: "A", truthLevel: "OBSERVED", status: "OBSERVED" },
        { id: "B", type: "FLOOR", label: "B", truthLevel: "OBSERVED", status: "OBSERVED" },
      ],
      edges: [
        { id: "e_ab", from: "A", to: "B", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "OBSERVED" },
        { id: "e_ba", from: "B", to: "A", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "OBSERVED" },
      ],
    };
    const cycles = CyclePresentationPlanner.detectCycles(cyclicGraph);
    assert.strictEqual(cycles.length, 1);
    assert.strictEqual(cycles[0].memberNodeIds.length, 2);
    assert.strictEqual(cycles[0].cycleEdgeIds.length, 2);
    console.log(`  -> PASSED: 2-node cycle detected and members preserved.\n`);
  }

  // J2: Cycle exists but no recovery evidence -> no recovery proof claimed
  {
    testCount++;
    console.log(`[J2] Cycle without recovery evidence claims zero recovery proof...`);
    const plainCycleGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_j2",
      runId: "run_j2",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "X", type: "FLOOR", label: "X", truthLevel: "OBSERVED", status: "OBSERVED" },
        { id: "Y", type: "FLOOR", label: "Y", truthLevel: "OBSERVED", status: "OBSERVED" },
      ],
      edges: [
        { id: "e_xy", from: "X", to: "Y", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "OBSERVED" },
        { id: "e_yx", from: "Y", to: "X", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "OBSERVED" },
      ],
    };
    const cycles = CyclePresentationPlanner.detectCycles(plainCycleGraph);
    assert.strictEqual(cycles[0].recoveryEdgeIds.length, 0, "Must not claim recovery edge without canonical type or metadata");
    assert.strictEqual(cycles[0].evidenceRefs.length, 0, "Zero evidence refs claimed without EvidenceGraph");
    console.log(`  -> PASSED: Cycle without recovery evidence asserts zero recovery proof.\n`);
  }

  // J3: Explicit recovery edge -> recovery classification shown
  {
    testCount++;
    console.log(`[J3] Explicit recovery edge classification shown...`);
    const recoveryCycleGraph: MissionGraphIR = {
      schemaVersion: "1.0.0",
      missionId: "mis_j3",
      runId: "run_j3",
      createdAt: new Date().toISOString(),
      nodes: [
        { id: "task_1", type: "FLOOR", label: "Task", truthLevel: "OBSERVED", status: "FAILED" },
        { id: "recovery_engine", type: "RECOVERY", label: "Healer Engine", truthLevel: "VERIFIED", status: "VERIFIED" },
      ],
      edges: [
        { id: "e_fail_to_rec", from: "task_1", to: "recovery_engine", type: "EXECUTION_SEQUENCE", truthLevel: "OBSERVED", status: "FAILED" },
        { id: "e_rec_retry", from: "recovery_engine", to: "task_1", type: "RECOVERY", truthLevel: "VERIFIED", status: "VERIFIED" },
      ],
    };
    const cycles = CyclePresentationPlanner.detectCycles(recoveryCycleGraph);
    assert.strictEqual(cycles.length, 1);
    assert.ok(cycles[0].recoveryEdgeIds.includes("e_rec_retry"), "Explicit RECOVERY edge MUST be classified");
    console.log(`  -> PASSED: Explicit recovery edge correctly identified.\n`);
  }

  // J4: Cycle exists -> root cause not automatically inferred
  {
    testCount++;
    console.log(`[J4] Cycle presence does not cause root cause inference...`);
    const testIR = {
      schemaVersion: "2.0.0",
      viewType: "MISSION_OVERVIEW" as const,
      title: "Cycle Test",
      subtitle: "Non-inference test",
      missionId: "mis_j4",
      nodes: [
        { id: "N1", label: "N1", type: "FLOOR" as const, status: "OBSERVED" as const, truthLevel: "OBSERVED" as const, evidenceRefs: [], visualHints: { isFocal: false, emphasis: "PRIMARY" as const, icon: "box", shape: "RECT" as const } },
        { id: "N2", label: "N2", type: "FLOOR" as const, status: "OBSERVED" as const, truthLevel: "OBSERVED" as const, evidenceRefs: [], visualHints: { isFocal: false, emphasis: "PRIMARY" as const, icon: "box", shape: "RECT" as const } },
      ],
      edges: [],
      groups: [],
      focus: [],
      emphasis: [],
      collapsedGroups: [],
      annotations: [],
      complexityBudget: { maxNodes: 10, currentNodes: 2, budgetExceeded: false, action: "NONE" as const },
      generatedAt: new Date().toISOString(),
    };
    const detectedCycle = {
      cycleId: "c_1",
      entryNodeId: "N1",
      memberNodeIds: ["N1", "N2"],
      cycleEdgeIds: ["e1", "e2"],
      recoveryEdgeIds: [],
      evidenceRefs: [],
    };
    const augmented = CyclePresentationPlanner.augmentPresentationWithCycles(testIR, [detectedCycle]);
    const entryNode = augmented.nodes.find((n) => n.id === "N1");
    assert.notStrictEqual(entryNode?.visualHints.badge, "ROOT CAUSE", "Entry node MUST NOT be labeled ROOT CAUSE");
    assert.strictEqual(entryNode?.visualHints.badge, "LOOP ENTRY");
    console.log(`  -> PASSED: Loop entry node labeled LOOP ENTRY, never falsely claimed as root cause.\n`);
  }

  // ---------------------------------------------------------------------------
  // GROUP K: FINAL TRUTH CLOSURE & INVARIANT VERIFICATION (K1 - K14)
  // ---------------------------------------------------------------------------
  console.log(`--- [Group K] Final Truth Closure & Invariant Verification (K1 - K14) ---`);

  // K1: Caller gives hasAuthoritativePhysicalReceipt = true without a structured valid receipt
  {
    testCount++;
    console.log(`[K1] Caller provides boolean hasAuthoritativePhysicalReceipt=true without structured receipt -> NOT PHYSICAL...`);
    const record: ArtifactDataRecord = {
      id: "art_k1",
      path: "data/non_existent/fake_k1.wav",
      producer: "floor04",
      consumers: ["floor05"],
      byteLength: 5000,
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      hasAuthoritativePhysicalReceipt: true,
    };
    const res = ArtifactInspectionResolver.resolve("art_k1", [record]);
    assert.strictEqual(res.physicalExistenceProven, false, "Boolean assertion must NOT grant physical proof");
    assert.notStrictEqual(res.truthLevel, "PHYSICAL", "Truth level must NOT become PHYSICAL");
    assert.strictEqual(res.truthBasis, "REPORTED_METADATA");
    assert.strictEqual(res.diagnostic, "INVALID_PHYSICAL_RECEIPT");
    console.log(`  -> PASSED: Boolean-only physical assertion rejected; truth downgraded.\n`);
  }

  // K2: Valid structured physical receipt. No filesystem access.
  {
    testCount++;
    console.log(`[K2] Valid structured physical receipt with missing file -> PHYSICAL with AUTHORITATIVE_PHYSICAL_RECEIPT...`);
    const record: ArtifactDataRecord = {
      id: "art_k2",
      path: "data/non_existent/valid_rcpt_k2.wav",
      producer: "floor04",
      consumers: ["floor05"],
      authoritativeReceipt: {
        receiptId: "rcpt_k2_001",
        artifactId: "art_k2",
        path: "data/non_existent/valid_rcpt_k2.wav",
        byteLength: 128000,
        sha256: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        verifiedAt: new Date().toISOString(),
        source: "F7_VERIFICATION",
      },
    };
    const res = ArtifactInspectionResolver.resolve("art_k2", [record]);
    assert.strictEqual(res.physicalExistenceProven, true, "Valid receipt authorizes physical proof");
    assert.strictEqual(res.truthLevel, "PHYSICAL");
    assert.strictEqual(res.truthBasis, "AUTHORITATIVE_PHYSICAL_RECEIPT");
    assert.strictEqual(res.physicalByteLength, 128000);
    assert.strictEqual(res.physicalSha256, "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210");
    console.log(`  -> PASSED: Valid structured receipt establishes receipt-backed physical truth.\n`);
  }

  // K3: Malformed receipt.
  {
    testCount++;
    console.log(`[K3] Malformed receipt (invalid source or negative byteLength) -> UNKNOWN...`);
    const record: ArtifactDataRecord = {
      id: "art_k3",
      path: "data/non_existent/malformed_k3.wav",
      producer: "floor04",
      consumers: ["floor05"],
      authoritativeReceipt: {
        receiptId: "rcpt_k3_bad",
        artifactId: "art_k3",
        path: "data/non_existent/malformed_k3.wav",
        byteLength: -50,
        sha256: "short",
        verifiedAt: new Date().toISOString(),
        source: "UNTRUSTED_SOURCE" as any,
      },
    };
    const res = ArtifactInspectionResolver.resolve("art_k3", [record]);
    assert.strictEqual(res.physicalExistenceProven, false);
    assert.strictEqual(res.truthLevel, "UNKNOWN");
    assert.strictEqual(res.diagnostic, "INVALID_PHYSICAL_RECEIPT");
    console.log(`  -> PASSED: Malformed receipt rejected with diagnostic.\n`);
  }

  // K4: Receipt artifact ID mismatch.
  {
    testCount++;
    console.log(`[K4] Receipt artifact ID mismatch -> UNKNOWN with PHYSICAL_RECEIPT_ARTIFACT_MISMATCH...`);
    const record: ArtifactDataRecord = {
      id: "art_k4_target",
      path: "data/non_existent/mismatch_k4.wav",
      producer: "floor04",
      consumers: ["floor05"],
      authoritativeReceipt: {
        receiptId: "rcpt_k4_mismatch",
        artifactId: "art_k4_DIFFERENT",
        path: "data/non_existent/mismatch_k4.wav",
        byteLength: 5000,
        sha256: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        verifiedAt: new Date().toISOString(),
        source: "PHYSICAL_PROBE",
      },
    };
    const res = ArtifactInspectionResolver.resolve("art_k4_target", [record]);
    assert.strictEqual(res.physicalExistenceProven, false);
    assert.strictEqual(res.truthLevel, "UNKNOWN");
    assert.strictEqual(res.diagnostic, "PHYSICAL_RECEIPT_ARTIFACT_MISMATCH");
    console.log(`  -> PASSED: Receipt ID mismatch detected and flagged.\n`);
  }

  // K5: Filesystem bytes disagree with receipt.
  {
    testCount++;
    console.log(`[K5] Filesystem bytes disagree with receipt -> filesystem facts win and mismatch is surfaced...`);
    const testFilePath = path.join(testDir, "test_k5_receipt_mismatch.bin");
    fs.writeFileSync(testFilePath, Buffer.from("ACTUAL_FILE_BYTES_FROM_DISK_K5"));
    const actualBytes = fs.readFileSync(testFilePath);
    const actualSha = createHash("sha256").update(actualBytes).digest("hex");

    const record: ArtifactDataRecord = {
      id: "art_k5",
      path: testFilePath,
      producer: "floor04",
      consumers: ["floor05"],
      authoritativeReceipt: {
        receiptId: "rcpt_k5",
        artifactId: "art_k5",
        path: testFilePath,
        byteLength: 999999, // Disagrees with actual file size
        sha256: "1111111111111111111111111111111111111111111111111111111111111111",
        verifiedAt: new Date().toISOString(),
        source: "ARTIFACT_LINEAGE_JUDGE",
      },
    };
    const res = ArtifactInspectionResolver.resolve("art_k5", [record]);
    assert.strictEqual(res.physicalExistenceProven, true);
    assert.strictEqual(res.truthBasis, "PHYSICAL_FILE_PROBE");
    assert.strictEqual(res.physicalByteLength, actualBytes.length, "Filesystem measurement MUST WIN");
    assert.strictEqual(res.physicalSha256, actualSha, "Filesystem hash MUST WIN");
    assert.strictEqual(res.receiptMismatchDetected, true, "Receipt mismatch MUST be surfaced");
    assert.strictEqual(res.verificationStatus, "FAILED", "Status drops to FAILED on mismatch");
    console.log(`  -> PASSED: Filesystem measurements won over conflicting receipt.\n`);
  }

  // K6: Edge artifact metadata: byteLength = 12345, file missing -> edge does not claim physical transfer
  {
    testCount++;
    console.log(`[K6] Edge artifact metadata without physical file -> physical transfer NOT_ESTABLISHED...`);
    const edgeRes = EdgeExplanationResolver.resolve("edge_k6_f4_f5", {
      missionGraph: {
        schemaVersion: "2.0.0",
        missionId: "mis_k6",
        runId: "run_k6",
        nodes: [
          { id: "f4", label: "F4", type: "FLOOR", status: "COMPLETED", truthLevel: "OBSERVED", metadata: { artifactId: "art_k6" } },
          { id: "f5", label: "F5", type: "FLOOR", status: "PLANNED", truthLevel: "ASSERTED" },
        ],
        edges: [
          { id: "edge_k6_f4_f5", from: "f4", to: "f5", type: "ARTIFACT_PRODUCED", status: "COMPLETED", truthLevel: "OBSERVED" },
        ],
      },
      physicalArtifacts: [
        {
          id: "art_k6",
          path: "data/non_existent/voice_k6.wav",
          byteLength: 12345,
          sha256: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
      ],
    });
    assert.strictEqual(edgeRes.resolved, true);
    assert.notStrictEqual(edgeRes.artifactTruthBasis, "PHYSICAL_FILE_PROBE");
    assert.strictEqual(edgeRes.artifactTruthBasis, "REPORTED_METADATA");
    const artSeq = edgeRes.executionSequence.find((s) => s.step.includes("NOT_ESTABLISHED"));
    assert.ok(artSeq, "Execution sequence must flag physical transfer NOT_ESTABLISHED");
    assert.strictEqual(artSeq?.status, "UNVERIFIED");
    assert.strictEqual(artSeq?.truthLevel, "ASSERTED");
    console.log(`  -> PASSED: Missing artifact transfer safely classified as NOT_ESTABLISHED.\n`);
  }

  // K7: Edge artifact exists physically -> edge exposes physical artifact evidence through resolver
  {
    testCount++;
    console.log(`[K7] Edge artifact exists physically -> physical artifact evidence grounded...`);
    const k7FilePath = path.join(testDir, "test_k7_voice.wav");
    fs.writeFileSync(k7FilePath, Buffer.from("WAVE_BYTES_ON_DISK_K7"));
    const edgeRes = EdgeExplanationResolver.resolve("edge_k7_f4_f5", {
      missionGraph: {
        schemaVersion: "2.0.0",
        missionId: "mis_k7",
        runId: "run_k7",
        nodes: [
          { id: "f4", label: "F4", type: "FLOOR", status: "COMPLETED", truthLevel: "OBSERVED", metadata: { artifactId: "art_k7" } },
          { id: "f5", label: "F5", type: "FLOOR", status: "COMPLETED", truthLevel: "OBSERVED" },
        ],
        edges: [
          { id: "edge_k7_f4_f5", from: "f4", to: "f5", type: "ARTIFACT_PRODUCED", status: "COMPLETED", truthLevel: "OBSERVED" },
        ],
      },
      physicalArtifacts: [
        {
          id: "art_k7",
          path: k7FilePath,
          producer: "f4",
          consumers: ["f5"],
        },
      ],
    });
    assert.strictEqual(edgeRes.resolved, true);
    assert.strictEqual(edgeRes.artifactTruthBasis, "PHYSICAL_FILE_PROBE");
    const artSeq = edgeRes.executionSequence.find((s) => s.step.includes("physically persisted"));
    assert.ok(artSeq, "Must have physically persisted step");
    assert.strictEqual(artSeq?.truthLevel, "PHYSICAL");
    assert.strictEqual(artSeq?.status, "VERIFIED");
    console.log(`  -> PASSED: Physical artifact transfer confirmed and grounded.\n`);
  }

  // K8: SituationRecord explicit ID ev_fake_123, EvidenceGraph contains no such node -> NOT canonical
  {
    testCount++;
    console.log(`[K8] SituationRecord explicit ID missing from EvidenceGraph -> placed in unresolvedReferences...`);
    const sampleRec: SituationRecord = {
      id: "sit_k8",
      missionId: "mis_k8",
      sender: { agentId: "floor04", role: "SYNTH" },
      recipients: ["floor05"],
      type: "HANDOFF",
      priority: "NORMAL",
      text: "Testing ungrounded explicit evidence ID",
      graph: { nodes: [], edges: [] },
      evidence: [
        { evidenceId: "ev_fake_123", type: "ARTIFACT", truthLevel: "OBSERVED", description: "Fake" },
      ],
      createdAt: new Date().toISOString(),
    };
    const emptyEvGraph: EvidenceGraphIR = {
      schemaVersion: "2.0.0",
      missionId: "mis_k8",
      runId: "run_k8",
      evidenceNodes: [],
      evidenceEdges: [],
    };
    const res = SituationInspectionResolver.resolve("sit_k8", [sampleRec], emptyEvGraph);
    assert.strictEqual(res.resolved, true);
    assert.ok(res.unresolvedReferences.includes("ev_fake_123"), "Ungrounded ID must be in unresolvedReferences");
    assert.strictEqual(res.canonicalEvidenceRefs?.includes("ev_fake_123") ?? false, false, "Must NOT be in canonicalEvidenceRefs");
    console.log(`  -> PASSED: Ungrounded evidence ID isolated in unresolvedReferences.\n`);
  }

  // K9: SituationRecord explicit canonical ID exists in EvidenceGraph -> canonicalEvidenceRefs contains exact ID
  {
    testCount++;
    console.log(`[K9] SituationRecord explicit canonical ID resolved against EvidenceGraph...`);
    const evGraph: EvidenceGraphIR = {
      schemaVersion: "2.0.0",
      missionId: "mis_k9",
      runId: "run_k9",
      evidenceNodes: [
        { id: "ev_real_canonical_456", category: "DURABLE_EVENT_RECORD", truthLevel: "VERIFIED", subjectId: "floor04", timestamp: new Date().toISOString(), description: "Real record" },
      ],
      evidenceEdges: [],
    };
    const sampleRec: SituationRecord = {
      id: "sit_k9",
      missionId: "mis_k9",
      sender: { agentId: "floor04", role: "SYNTH" },
      recipients: ["floor05"],
      type: "HANDOFF",
      priority: "NORMAL",
      text: "Testing explicit canonical ID",
      graph: { nodes: [], edges: [] },
      evidence: [
        { evidenceId: "ev_real_canonical_456", type: "EVENT", truthLevel: "VERIFIED", description: "Real" },
      ],
      createdAt: new Date().toISOString(),
    };
    const res = SituationInspectionResolver.resolve("sit_k9", [sampleRec], evGraph);
    assert.strictEqual(res.resolved, true);
    assert.ok(res.canonicalEvidenceRefs?.includes("ev_real_canonical_456"));
    assert.strictEqual(res.unresolvedReferences.length, 0);
    console.log(`  -> PASSED: Canonical evidence ID confirmed via EvidenceGraph lookup.\n`);
  }

  // K10: SituationRecord URI maps to EvidenceGraph -> canonical ID resolved
  {
    testCount++;
    console.log(`[K10] SituationRecord URI reference maps to EvidenceGraph node...`);
    const evGraph: EvidenceGraphIR = {
      schemaVersion: "2.0.0",
      missionId: "mis_k10",
      runId: "run_k10",
      evidenceNodes: [
        { id: "ev_mapped_node_789", category: "PHYSICAL_FILE_ON_DISK", physicalPath: "data/artifacts/mapped_audio.wav", truthLevel: "PHYSICAL", subjectId: "art_10", timestamp: new Date().toISOString(), description: "Mapped path" },
      ],
      evidenceEdges: [],
    };
    const sampleRec: SituationRecord = {
      id: "sit_k10",
      missionId: "mis_k10",
      sender: { agentId: "floor04", role: "SYNTH" },
      recipients: ["floor05"],
      type: "HANDOFF",
      priority: "NORMAL",
      text: "Testing URI mapping",
      graph: { nodes: [], edges: [] },
      evidence: [
        { evidenceId: "", type: "ARTIFACT", uriOrPath: "data/artifacts/mapped_audio.wav", truthLevel: "PHYSICAL", description: "Path ref" },
      ],
      createdAt: new Date().toISOString(),
    };
    const res = SituationInspectionResolver.resolve("sit_k10", [sampleRec], evGraph);
    assert.strictEqual(res.resolved, true);
    assert.ok(res.canonicalEvidenceRefs?.includes("ev_mapped_node_789"));
    assert.strictEqual(res.unresolvedReferences.length, 0);
    console.log(`  -> PASSED: URI reference correctly mapped to canonical evidence ID.\n`);
  }

  // K11: Artifact inspector displays reported and physical measurements with explicit labels
  {
    testCount++;
    console.log(`[K11] Artifact inspector distinguishes PHYSICAL, RECEIPT-BACKED, and REPORTED labels...`);
    const testArtRes = {
      artifactId: "art_display_test",
      path: "data/artifacts/test.wav",
      truthLevel: "PHYSICAL" as const,
      truthBasis: "PHYSICAL_FILE_PROBE" as const,
      physicalByteLength: 144284,
      reportedByteLength: 144284,
      physicalSha256: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      reportedSha256: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      receiptByteLength: undefined,
      receiptSha256: undefined,
      verificationStatus: "VERIFIED" as const,
      resolved: true,
    };
    const cardText = ArtifactInspectionResolver.renderInspectionCard(testArtRes as any);
    assert.ok(cardText.includes("PHYSICAL: 144,284 bytes"));
    assert.ok(cardText.includes("REPORTED: 144,284 bytes"));
    assert.ok(cardText.includes("PHYSICAL: abcdef1234567890"));
    assert.ok(cardText.includes("REPORTED: abcdef1234567890"));

    const htmlCard = DeterministicGraphRenderer.renderArtifactInspector(testArtRes);
    assert.ok(htmlCard.includes("PHYSICAL:</span><span class=\"val\">144,284 bytes"));
    assert.ok(htmlCard.includes("REPORTED:</span><span class=\"val\">144,284 bytes"));
    console.log(`  -> PASSED: Inspector UI displays explicit measurement provenance labels.\n`);
  }

  // K12: Hash mismatch remains visible in UI
  {
    testCount++;
    console.log(`[K12] Hash mismatch remains surfaced as DIGEST MISMATCH in inspector UI...`);
    const mismatchArt = {
      artifactId: "art_hash_mismatch",
      path: "data/artifacts/mismatch.wav",
      physicalSha256: "1111111111111111111111111111111111111111111111111111111111111111",
      reportedSha256: "9999999999999999999999999999999999999999999999999999999999999999",
      hashMismatchDetected: true,
      truthLevel: "UNKNOWN" as const,
      truthBasis: "UNKNOWN" as const,
      verificationStatus: "FAILED" as const,
      resolved: true,
    };
    const cardText = ArtifactInspectionResolver.renderInspectionCard(mismatchArt as any);
    assert.ok(cardText.includes("[DIGEST MISMATCH]"));
    const htmlCard = DeterministicGraphRenderer.renderArtifactInspector(mismatchArt);
    assert.ok(htmlCard.includes("DIGEST MISMATCH"));
    console.log(`  -> PASSED: Hash mismatch prominently flagged in inspector UI.\n`);
  }

  // K13: Size mismatch remains visible in UI
  {
    testCount++;
    console.log(`[K13] Size mismatch remains surfaced as SIZE MISMATCH in inspector UI...`);
    const sizeMismatchArt = {
      artifactId: "art_size_mismatch",
      path: "data/artifacts/size.wav",
      physicalByteLength: 1000,
      reportedByteLength: 2000,
      sizeMismatchDetected: true,
      truthLevel: "UNKNOWN" as const,
      truthBasis: "UNKNOWN" as const,
      verificationStatus: "FAILED" as const,
      resolved: true,
    };
    const cardText = ArtifactInspectionResolver.renderInspectionCard(sizeMismatchArt as any);
    assert.ok(cardText.includes("[SIZE MISMATCH]"));
    const htmlCard = DeterministicGraphRenderer.renderArtifactInspector(sizeMismatchArt);
    assert.ok(htmlCard.includes("SIZE MISMATCH"));
    console.log(`  -> PASSED: Size mismatch prominently flagged in inspector UI.\n`);
  }

  // K14: Static safety scan: no code path derives PHYSICAL from byteLength > 0
  {
    testCount++;
    console.log(`[K14] Static safety audit across testing/graphs/visual codebase...`);
    const visualDir = path.resolve("testing/graphs/visual");
    const visualFiles = fs.readdirSync(visualDir).filter((f) => f.endsWith(".ts"));
    for (const f of visualFiles) {
      const content = fs.readFileSync(path.join(visualDir, f), "utf-8");
      // Check 1: Forbidden inference: byteLength > 0 -> PHYSICAL
      assert.ok(
        !content.includes('byteLength > 0 ? "PHYSICAL"'),
        `File ${f} must NOT derive PHYSICAL from byteLength > 0`
      );
      // Check 2: Forbidden inference: existsPhysically: a.byteLength > 0
      assert.ok(
        !content.includes('existsPhysically: a.byteLength ? a.byteLength > 0 : false'),
        `File ${f} must NOT derive existsPhysically from byteLength > 0`
      );
      // Check 3: Forbidden naming convention bypass in SituationInspectionResolver
      if (f === "SituationInspectionResolver.ts") {
        assert.ok(
          !content.includes('explicitId.startsWith("ev_")'),
          `SituationInspectionResolver.ts must NOT grant canonicality from startsWith("ev_")`
        );
      }
    }
    console.log(`  -> PASSED: Zero forbidden inference patterns found across ${visualFiles.length} visual source files.\n`);
  }

  // Clean up temporary files
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}

  console.log(`======================================================================`);
  console.log(` FACTORYOS VISUALIZATION V2 CORRECTNESS SUITE: ${testCount}/${testCount} PASSED`);
  console.log(`======================================================================\n`);

  return { passed: true, testCount };
}

if (require.main === module) {
  runGraphInteractionCorrectnessTestSuite()
    .then(({ passed, testCount }) => {
      process.exit(passed ? 0 : 1);
    })
    .catch((err) => {
      console.error("FATAL: Correctness test suite failed with error:", err);
      process.exit(1);
    });
}
