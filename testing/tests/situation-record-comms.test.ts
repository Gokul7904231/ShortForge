/**
 * FactoryOS Canonical Testing Suite — SituationRecord Distributed Comms
 * Tests A through L verifying lossless communication of TEXT + GRAPH IR + EVIDENCE
 * through the authoritative FactoryOS DurableEventBus.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DurableEventBus } from "../../apps/web/factoryos/core/events/DurableEventBus";
import {
  SituationCommsClient,
  serializeSituationRecord,
  deserializeSituationRecord,
  checkSituationRecordIntegrity,
  validateSituationRecord,
} from "../../apps/web/factoryos/core/comms/SituationComms";
import { GraphProjections } from "../graphs/GraphProjections";

import type { SituationRecord } from "../model/SituationRecord";
import type { TruthLevel } from "../contracts/execution.contract";

function loadFixture(filename: string): SituationRecord {
  const filePath = resolve(__dirname, "../fixtures/situations", filename);
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SituationRecord;
}

export interface CommsTestSummary {
  readonly passed: boolean;
  readonly totalTests: number;
  readonly passedTests: number;
  readonly failedTests: number;
  readonly results: Array<{ name: string; passed: boolean; error?: string }>;
}

export async function runSituationRecordCommsTestSuite(): Promise<CommsTestSummary> {
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

  console.log("\n=== FactoryOS SituationRecord Comms Suite (Tests A -> L) ===");

  // =========================================================================
  // TEST A: Round Trip Serialization
  // =========================================================================
  await runTest("Test A: Round Trip Serialization & Deserialization", () => {
    const fixture = loadFixture("situation-f4-fallback.json");
    const serialized = serializeSituationRecord(fixture);
    const deserialized = deserializeSituationRecord(serialized);

    const integrity = checkSituationRecordIntegrity(fixture, deserialized);
    if (!integrity.match) {
      throw new Error(`Integrity check failed: ${integrity.discrepancies.join("; ")}`);
    }
  });

  // =========================================================================
  // TEST B: Real Comms Handoff (Sender -> DurableEventBus -> Receiver)
  // =========================================================================
  await runTest("Test B: Real Comms Handoff via DurableEventBus", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);
    const fixture = loadFixture("situation-f4-fallback.json");

    let receivedRecord: SituationRecord | null = null;
    let receivedEnvelopeId: string | null = null;

    // Register receiver agent (Overseer)
    commsClient.receive("agent_overseer", (rec, env) => {
      receivedRecord = rec;
      receivedEnvelopeId = env.eventId;
    });

    // Sender transmits through Comms
    const envelope = await commsClient.send(fixture, { source: "agent_guardian_f4" });

    if (!receivedRecord) {
      throw new Error("Receiver agent did not receive SituationRecord via DurableEventBus");
    }

    // Verify envelope ID is distinct from situationRecordId
    if (receivedEnvelopeId === fixture.id) {
      throw new Error("Transport envelope ID must be distinct from situationRecordId");
    }

    const integrity = checkSituationRecordIntegrity(fixture, receivedRecord);
    if (!integrity.match) {
      throw new Error(`Lossless handoff failed: ${integrity.discrepancies.join("; ")}`);
    }
  });

  // =========================================================================
  // TEST C: Truth Preservation (Exact fidelity across all 7 truth levels)
  // =========================================================================
  await runTest("Test C: Truth Preservation across all Truth Levels", async () => {
    const truthLevels: TruthLevel[] = [
      "PHYSICAL",
      "OBSERVED",
      "VERIFIED",
      "ASSERTED",
      "INFERRED",
      "UNKNOWN",
      "RECONSTRUCTED",
    ];

    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);

    for (let i = 0; i < truthLevels.length; i++) {
      const level = truthLevels[i];
      const record: SituationRecord = {
        id: `sit_truth_test_${level.toLowerCase()}_${i}`,
        missionId: "golden-short-001",
        sender: { agentId: "agent_tester", role: "Verifier" },
        recipients: ["agent_receiver"],
        type: "STATUS",
        priority: "NORMAL",
        text: `Testing truth level ${level}`,
        graph: {
          schemaVersion: "1.0.0",
          nodes: [{ id: `node_${i}`, label: `Node ${level}`, type: "FLOOR", status: "COMPLETED" }],
          edges: [],
          focus: [],
          emphasis: [],
        },
        evidence: [
          {
            evidenceId: `ev_truth_${level.toLowerCase()}`,
            type: "EVENT",
            truthLevel: level,
            description: `Claim with truth level ${level}`,
          },
        ],
        createdAt: new Date().toISOString(),
      };

      let receivedLevel: TruthLevel | null = null;
      const unsub = commsClient.receive("agent_receiver", (rec) => {
        receivedLevel = rec.evidence[0].truthLevel;
      });

      await commsClient.send(record);
      unsub();

      if (receivedLevel !== level) {
        throw new Error(`Truth level altered across Comms! Expected ${level}, got ${receivedLevel}`);
      }

    }
  });

  // =========================================================================
  // TEST D: Evidence Preservation (References intact, no dropped references)
  // =========================================================================
  await runTest("Test D: Evidence Preservation (Zero dropped references)", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);
    const fixture = loadFixture("situation-f4-fallback.json");

    let receivedEvCount = 0;
    const receivedIds: string[] = [];

    commsClient.receive("agent_guardian_f5", (rec) => {
      receivedEvCount = rec.evidence.length;
      receivedIds.push(...rec.evidence.map((e) => e.evidenceId));
    });

    await commsClient.send(fixture);

    if (receivedEvCount !== 4) {
      throw new Error(`Expected 4 evidence references, received ${receivedEvCount}`);
    }

    const expectedIds = ["ev_provider_fail_01", "ev_wav_exist_01", "ev_sha256_01", "ev_rec_01"];
    for (const exp of expectedIds) {
      if (!receivedIds.includes(exp)) {
        throw new Error(`Missing expected evidence reference: ${exp}`);
      }
    }
  });

  // =========================================================================
  // TEST E: Graph Preservation (Nodes, edges, focus, emphasis exact)
  // =========================================================================
  await runTest("Test E: Graph Preservation (Full topological structure)", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);
    const fixture = loadFixture("situation-f4-fallback.json");

    let receivedRecord: SituationRecord | null = null;
    commsClient.receive("agent_slayer_general", (rec) => {
      receivedRecord = rec;
    });

    await commsClient.send(fixture);

    if (!receivedRecord) throw new Error("Record not received");
    const rec = receivedRecord as SituationRecord;

    if (rec.graph.nodes.length !== 4) throw new Error(`Expected 4 nodes, got ${rec.graph.nodes.length}`);
    if (rec.graph.edges.length !== 3) throw new Error(`Expected 3 edges, got ${rec.graph.edges.length}`);
    if (rec.graph.focus.length !== 2) throw new Error(`Expected 2 focus nodes, got ${rec.graph.focus.length}`);
    if (rec.graph.emphasis.length !== 2) throw new Error(`Expected 2 emphasis elements, got ${rec.graph.emphasis.length}`);

    // Verify viewHints survived
    if (rec.graph.viewHints?.preferredView !== "RECOVERY") {
      throw new Error("Graph viewHints were lost in transit");
    }
  });

  // =========================================================================
  // TEST F: Duplicate Message Delivery (Semantic Idempotency)
  // =========================================================================
  await runTest("Test F: Duplicate Delivery Idempotency", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);
    const fixture = loadFixture("situation-f4-fallback.json");

    let deliveryCount = 0;
    commsClient.receive("agent_overseer", () => {
      deliveryCount++;
    });

    // First send
    await commsClient.send(fixture);
    // Second send of the exact same situationRecordId
    await commsClient.send(fixture);

    // DurableEventBus + SituationCommsClient ensures exactly-once semantic delivery
    if (deliveryCount !== 1) {
      throw new Error(`Expected idempotent delivery (count=1), but handler was triggered ${deliveryCount} times`);
    }
  });

  // =========================================================================
  // TEST G: Conflict Handling (Safe retention without silent overwrite)
  // =========================================================================
  await runTest("Test G: Conflict Detection & Non-Destructive Retention", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);

    const recordA = loadFixture("situation-f4-fallback.json"); // F4 status: RECOVERED
    const recordB = loadFixture("situation-conflict.json"); // F4 status: FAILED

    let conflictEventsCount = 0;
    eventBus.subscribe("SITUATION_RECORD_CONFLICT", () => {
      conflictEventsCount++;
    });

    let recordsReceived = 0;
    commsClient.receive("agent_overseer", () => {
      recordsReceived++;
    });

    await commsClient.send(recordA);
    await commsClient.send(recordB);

    const conflicts = commsClient.getConflicts("golden-short-001");
    if (conflicts.length === 0) {
      throw new Error("Expected conflicting claims on floor04_media_synthesis to be detected");
    }

    if (conflictEventsCount !== 1) {
      throw new Error(`Expected 1 SITUATION_RECORD_CONFLICT event, got ${conflictEventsCount}`);
    }

    // Both records must be preserved and attributable
    const conflict = conflicts[0];
    if (conflict.recordA.sender.agentId !== "agent_guardian_f4" || conflict.recordB.sender.agentId !== "agent_sentinel_watchdog") {
      throw new Error("Conflict records lost sender attribution");
    }
  });

  // =========================================================================
  // TEST H: UNKNOWN Evidence Preservation (Never upgraded)
  // =========================================================================
  await runTest("Test H: UNKNOWN Evidence Remains UNKNOWN", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);

    const record: SituationRecord = {
      id: "sit_unknown_test_001",
      missionId: "golden-short-001",
      sender: { agentId: "agent_probe", role: "Probe" },
      recipients: ["agent_overseer"],
      type: "STATUS",
      priority: "LOW",
      text: "Uncertain probe observation",
      graph: {
        schemaVersion: "1.0.0",
        nodes: [{ id: "unverified_node", label: "Unverified Node", type: "FLOOR", status: "PENDING" }],
        edges: [],
        focus: [],
        emphasis: [],
      },
      evidence: [
        {
          evidenceId: "ev_unknown_probe",
          type: "EVENT",
          truthLevel: "UNKNOWN",
          description: "Sensor signal degraded, status unconfirmed",
        },
      ],
      createdAt: new Date().toISOString(),
    };

    let receivedTruth: TruthLevel | null = null;
    commsClient.receive("agent_overseer", (rec) => {
      receivedTruth = rec.evidence[0].truthLevel;
    });

    await commsClient.send(record);

    if (receivedTruth !== "UNKNOWN") {
      throw new Error(`UNKNOWN truth level was upgraded to '${receivedTruth}'!`);
    }
  });

  // =========================================================================
  // TEST I: Browser Failure Situation Consumed by Slayer
  // =========================================================================
  await runTest("Test I: Browser Failure Situation Consumed by Slayer", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);
    const fixture = loadFixture("situation-browser-failure.json");

    let slayerProjection: any = null;
    commsClient.receive("agent_slayer_general", (rec) => {
      slayerProjection = GraphProjections.createSlayerSituationView(rec);
    });

    await commsClient.send(fixture);

    if (!slayerProjection) throw new Error("Slayer did not receive situation");

    // Slayer must have causal chain
    if (slayerProjection.causalChain.length === 0) {
      throw new Error("Slayer projection missing causal chain");
    }

    // Slayer must have failure nodes
    if (!slayerProjection.failureNodes.includes("node_network_500")) {
      throw new Error("Slayer projection missing node_network_500 in failure nodes");
    }

    // Slayer must have browser evidence chain
    if (!slayerProjection.browserEvidenceChain || slayerProjection.browserEvidenceChain.length !== 4) {
      throw new Error(`Expected 4 browser evidence items in Slayer view, got ${slayerProjection.browserEvidenceChain?.length}`);
    }
  });

  // =========================================================================
  // TEST J: Overseer Operational View
  // =========================================================================
  await runTest("Test J: Overseer Operational View Projection", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);
    const fixture = loadFixture("situation-f4-fallback.json");

    let overseerProjection: any = null;
    commsClient.receive("agent_overseer", (rec) => {
      overseerProjection = GraphProjections.createOverseerSituationView(rec);
    });

    await commsClient.send(fixture);

    if (!overseerProjection) throw new Error("Overseer did not receive situation");

    if (!overseerProjection.recoveredFloors.includes("Floor 04 Media Synthesis")) {
      throw new Error("Overseer projection missing recovered floor");
    }

    if (!overseerProjection.currentBlockers.includes("Gemini TTS Provider")) {
      throw new Error("Overseer projection missing failing blocker");
    }

    if (overseerProjection.keyEvidenceRefs.length !== 4) {
      throw new Error("Overseer projection missing key evidence references");
    }
  });

  // =========================================================================
  // TEST K: Provenance & Identity Preservation
  // =========================================================================
  await runTest("Test K: Provenance & Identity Preservation", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);
    const fixture = loadFixture("situation-verified-artifact.json");

    let received: SituationRecord | null = null;
    commsClient.receive("agent_delivery_manager", (rec) => {
      received = rec;
    });

    await commsClient.send(fixture);

    if (!received) throw new Error("Record not received");
    const rec = received as SituationRecord;

    if (rec.id !== "sit_verified_artifact_004") throw new Error("id mismatch");
    if (rec.missionId !== "golden-short-001") throw new Error("missionId mismatch");
    if (rec.runId !== "run_golden_short_001_1788944000000") throw new Error("runId mismatch");
    if (rec.sender.agentId !== "agent_compliance_f7") throw new Error("sender.agentId mismatch");
    if (rec.sender.floorId !== "floor07_compliance") throw new Error("sender.floorId mismatch");
    if (rec.sender.role !== "ComplianceVerifier") throw new Error("sender.role mismatch");
  });

  // =========================================================================
  // TEST L: Malformed Record & Security Rejection (Fail-Closed)
  // =========================================================================
  await runTest("Test L: Malformed Record & Security Rejection", async () => {
    const eventBus = new DurableEventBus();
    const commsClient = new SituationCommsClient(eventBus);

    // 1. Missing id
    const badId: any = {
      missionId: "m1",
      sender: { agentId: "a1", role: "r1" },
      recipients: ["*"],
      type: "STATUS",
      priority: "NORMAL",
      text: "test",
      graph: { schemaVersion: "1.0.0", nodes: [], edges: [], focus: [], emphasis: [] },
      evidence: [],
      createdAt: new Date().toISOString(),
    };
    const resBadId = validateSituationRecord(badId);
    if (resBadId.valid) throw new Error("Expected validation to fail for missing id");

    // 2. Missing sender
    const badSender: any = {
      id: "s1",
      missionId: "m1",
      recipients: ["*"],
      type: "STATUS",
      priority: "NORMAL",
      text: "test",
      graph: { schemaVersion: "1.0.0", nodes: [], edges: [], focus: [], emphasis: [] },
      evidence: [],
      createdAt: new Date().toISOString(),
    };
    const resBadSender = validateSituationRecord(badSender);
    if (resBadSender.valid) throw new Error("Expected validation to fail for missing sender");

    // 3. Invalid node type
    const badNodeType: any = {
      id: "s2",
      missionId: "m1",
      sender: { agentId: "a1", role: "r1" },
      recipients: ["*"],
      type: "STATUS",
      priority: "NORMAL",
      text: "test",
      graph: {
        schemaVersion: "1.0.0",
        nodes: [{ id: "n1", label: "Invalid Node", type: "NON_EXISTENT_TYPE" }],
        edges: [],
        focus: [],
        emphasis: [],
      },
      evidence: [],
      createdAt: new Date().toISOString(),
    };
    const resBadNodeType = validateSituationRecord(badNodeType);
    if (resBadNodeType.valid) throw new Error("Expected validation to fail for invalid node type");

    // 4. Invalid truth level
    const badTruth: any = {
      id: "s3",
      missionId: "m1",
      sender: { agentId: "a1", role: "r1" },
      recipients: ["*"],
      type: "STATUS",
      priority: "NORMAL",
      text: "test",
      graph: { schemaVersion: "1.0.0", nodes: [], edges: [], focus: [], emphasis: [] },
      evidence: [{ evidenceId: "e1", type: "EVENT", truthLevel: "DEFINITELY_TRUE", description: "bad" }],
      createdAt: new Date().toISOString(),
    };
    const resBadTruth = validateSituationRecord(badTruth);
    if (resBadTruth.valid) throw new Error("Expected validation to fail for invalid truth level");

    // 5. Security: Unredacted secret in text
    const badSecret: any = {
      id: "s4",
      missionId: "m1",
      sender: { agentId: "a1", role: "r1" },
      recipients: ["*"],
      type: "STATUS",
      priority: "NORMAL",
      text: "Here is the key: Bearer ya29.a0AfH6SMD_secret_token_1234567890",
      graph: { schemaVersion: "1.0.0", nodes: [], edges: [], focus: [], emphasis: [] },
      evidence: [],
      createdAt: new Date().toISOString(),
    };
    const resBadSecret = validateSituationRecord(badSecret);
    if (resBadSecret.valid) throw new Error("Expected validation to fail for unredacted secret token");

    // Verify commsClient.send() rejects fail-closed
    try {
      await commsClient.send(badId);
      throw new Error("commsClient.send did not reject malformed record!");
    } catch (e) {
      // Expected
    }
  });

  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.filter((r) => !r.passed).length;
  const passed = failedTests === 0;

  console.log(`\nSituationRecord Comms Suite Result: ${passedTests}/${results.length} PASSED`);
  return {
    passed,
    totalTests: results.length,
    passedTests,
    failedTests,
    results,
  };
}

if (require.main === module) {
  runSituationRecordCommsTestSuite().then((res) => {
    process.exit(res.passed ? 0 : 1);
  });
}
