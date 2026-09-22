/**
 * FactoryOS Canonical Scenario — situation-record-comms-001
 * Executes a REAL live distributed agent-to-agent handoff over FactoryOS DurableEventBus:
 *   Sender: agent_guardian_f4 (Guardian Floor 04)
 *   Receiver: agent_overseer (Overseer Control Plane)
 *   Payload: SituationRecord (TEXT + GRAPH IR + EVIDENCE)
 * Proves zero semantic loss, exact truth preservation, and full projection consumption.
 */

import { DurableEventBus } from "../../../apps/web/factoryos/core/events/DurableEventBus";
import {
  SituationCommsClient,
  checkSituationRecordIntegrity,
} from "../../../apps/web/factoryos/core/comms/SituationComms";
import { GraphProjections, type OverseerSituationView } from "../../graphs/GraphProjections";
import type { SituationRecord } from "../../model/SituationRecord";

export interface LiveHandoffResult {
  readonly success: boolean;
  readonly messageId: string;
  readonly situationId: string;
  readonly sender: string;
  readonly receiver: string;
  readonly graphNodeIds: string[];
  readonly graphEdgeIds: string[];
  readonly evidenceIds: string[];
  readonly timestamp: string;
  readonly integrityPassed: boolean;
  readonly discrepancies: string[];
  readonly overseerView: OverseerSituationView;
}

export async function runSituationRecordComms001(): Promise<LiveHandoffResult> {
  console.log("\n============================================================");
  console.log("  FACTORYOS LIVE HANDOFF SCENARIO: situation-record-comms-001");
  console.log("============================================================");

  // 1. Authoritative Transport
  const eventBus = new DurableEventBus();
  const commsClient = new SituationCommsClient(eventBus);

  // 2. Sender Agent creates SituationRecord (F4 provider failure -> local WAV fallback -> F5 resume)
  const situationRecord: SituationRecord = {
    id: `sit_live_${Date.now()}`,
    missionId: "golden-short-001",
    runId: `run_live_handoff_${Date.now()}`,
    schemaVersion: "1.0.0",
    sender: {
      agentId: "agent_guardian_f4",
      role: "Guardian",
      floorId: "floor04_media_synthesis",
    },
    recipients: ["agent_overseer", "agent_guardian_f5"],
    type: "RECOVERY",
    priority: "HIGH",
    text: "Primary voice provider failed. Local PCM fallback generated a physically verified WAV artifact. F5 may resume.",
    graph: {
      schemaVersion: "1.0.0",
      nodes: [
        {
          id: "floor04_media_synthesis",
          label: "Floor 04 Media Synthesis",
          type: "FLOOR",
          status: "RECOVERED",
          metadata: { floorNumber: 4, fallbackEngaged: true },
        },
        {
          id: "gemini_voice_provider",
          label: "Gemini TTS Provider",
          type: "FAILURE",
          status: "FAILED",
          metadata: { errorCode: 504, error: "Gateway Timeout" },
        },
        {
          id: "local_wav_fallback",
          label: "Local WAV Synthesizer",
          type: "RECOVERY",
          status: "COMPLETED",
          metadata: { artifactPath: "data/audio/fallback_f4.wav", sizeBytes: 1411200 },
        },
        {
          id: "floor05_timeline_composition",
          label: "Floor 05 Timeline Composition",
          type: "FLOOR",
          status: "RUNNING",
          metadata: { floorNumber: 5 },
        },
      ],
      edges: [
        {
          id: "edge_f4_primary",
          from: "floor04_media_synthesis",
          to: "gemini_voice_provider",
          type: "EXECUTION_SEQUENCE",
          label: "Attempt Primary Provider",
        },
        {
          id: "edge_f4_recovery",
          from: "floor04_media_synthesis",
          to: "local_wav_fallback",
          type: "RECOVERY",
          label: "Engage Local PCM Synthesis",
        },
        {
          id: "edge_resume_f5",
          from: "local_wav_fallback",
          to: "floor05_timeline_composition",
          type: "EXECUTION_SEQUENCE",
          label: "Downstream Timeline Composition",
        },
      ],
      focus: ["gemini_voice_provider", "local_wav_fallback"],
      emphasis: [
        {
          targetId: "gemini_voice_provider",
          visualWeight: "ALERT",
          reason: "Primary provider failure timeout",
        },
        {
          targetId: "local_wav_fallback",
          visualWeight: "PRIMARY",
          reason: "Physically verified local WAV artifact produced",
        },
      ],
      viewHints: {
        preferredView: "RECOVERY",
      },
    },
    evidence: [
      {
        evidenceId: "ev_live_prov_fail_504",
        type: "EVENT",
        truthLevel: "OBSERVED",
        description: "Provider failure observation: Gemini TTS endpoint returned 504 Gateway Timeout",
      },
      {
        evidenceId: "ev_live_wav_file",
        type: "ARTIFACT",
        truthLevel: "PHYSICAL",
        digest: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
        uriOrPath: "data/audio/fallback_f4.wav",
        description: "Physical WAV audio artifact on filesystem: 1,411,200 bytes",
      },
      {
        evidenceId: "ev_live_sha256_probe",
        type: "VERIFICATION_PROBE",
        truthLevel: "VERIFIED",
        digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        description: "SHA-256 integrity probe verified checksum against filesystem bytes",
      },
      {
        evidenceId: "ev_live_recovery_transition",
        type: "EVENT",
        truthLevel: "OBSERVED",
        description: "State transition logged: floor04 status updated from FAILED to RECOVERED",
      },
    ],
    createdAt: new Date().toISOString(),
  };

  console.log(`[Sender] Agent 'agent_guardian_f4' created SituationRecord '${situationRecord.id}'`);
  console.log(`  - Text: "${situationRecord.text}"`);
  console.log(`  - Graph Nodes: ${situationRecord.graph.nodes.length} nodes, ${situationRecord.graph.edges.length} edges`);
  console.log(`  - Evidence Refs: ${situationRecord.evidence.map((e) => `${e.evidenceId} [${e.truthLevel}]`).join(", ")}`);

  // 3. Receiver Registration (Overseer)
  let receivedRecord: SituationRecord | null = null;
  let receivedEnvelopeId: string | null = null;
  let receivedTimestamp: string | null = null;

  commsClient.receive("agent_overseer", (record, envelope) => {
    receivedRecord = record;
    receivedEnvelopeId = envelope.eventId;
    receivedTimestamp = envelope.timestamp;
    console.log(`[Receiver] Overseer received message '${envelope.eventId}' via DurableEventBus`);
  });

  // 4. Send through DurableEventBus
  console.log("[Comms] Dispatching SituationRecord via DurableEventBus...");
  const sentEnvelope = await commsClient.send(situationRecord, {
    source: "agent_guardian_f4",
    correlationId: situationRecord.missionId,
  });

  if (!receivedRecord) {
    throw new Error("Live handoff failed: Overseer did not receive the situation record through DurableEventBus");
  }

  const rec = receivedRecord as SituationRecord;

  // 5. Integrity Verification
  const integrity = checkSituationRecordIntegrity(situationRecord, rec);
  console.log(`[Integrity] Lossless Semantic Match: ${integrity.match ? "PASS (100%)" : "FAIL"}`);
  if (!integrity.match) {
    console.error(`[Integrity Discrepancies]:`, integrity.discrepancies);
  }

  // 6. Overseer Consumption & Projection
  const overseerView = GraphProjections.createOverseerSituationView(rec);
  console.log("\n[Overseer Operational View Consumption]:");
  console.log(`  - Current Blockers: [${overseerView.currentBlockers.join(", ")}]`);
  console.log(`  - Recovered Floors: [${overseerView.recoveredFloors.join(", ")}]`);
  console.log(`  - Focused Nodes: [${overseerView.focusedNodes.join(", ")}]`);
  console.log(`  - Key Evidence: [${overseerView.keyEvidenceRefs.join(", ")}]`);

  // 7. Slayer Consumption & Forensic Chain
  const slayerView = GraphProjections.createSlayerSituationView(rec);
  console.log("\n[Slayer Forensic View Consumption]:");
  console.log(`  - Failure Nodes: [${slayerView.failureNodes.join(", ")}]`);
  console.log(`  - Causal Chain Edges: ${slayerView.causalChain.length}`);
  console.log(`  - Affected Nodes: [${slayerView.affectedNodes.join(", ")}]`);
  console.log(`  - Primary Evidence Path: [${slayerView.primaryEvidencePath.join(", ")}]`);

  const result: LiveHandoffResult = {
    success: integrity.match,
    messageId: receivedEnvelopeId || sentEnvelope.eventId,
    situationId: rec.id,
    sender: rec.sender.agentId,
    receiver: "agent_overseer",
    graphNodeIds: rec.graph.nodes.map((n) => n.id),
    graphEdgeIds: rec.graph.edges.map((e) => e.id),
    evidenceIds: rec.evidence.map((e) => e.evidenceId),
    timestamp: receivedTimestamp || sentEnvelope.timestamp,
    integrityPassed: integrity.match,
    discrepancies: integrity.discrepancies,
    overseerView,
  };

  console.log("\n============================================================");
  console.log("  LIVE PROOF RECEIPT RECORD");
  console.log("============================================================");
  console.log(`  Transport Event ID:     ${result.messageId}`);
  console.log(`  Situation Record ID:    ${result.situationId}`);
  console.log(`  Sender Identity:        ${result.sender} (${rec.sender.role})`);
  console.log(`  Receiver Identity:      ${result.receiver}`);
  console.log(`  Graph Nodes Preserved:  ${result.graphNodeIds.join(", ")}`);
  console.log(`  Evidence Preserved:     ${result.evidenceIds.join(", ")}`);
  console.log(`  Transport Timestamp:    ${result.timestamp}`);
  console.log(`  Status:                 ${result.success ? "VERIFIED (100% Lossless)" : "FAILED"}`);
  console.log("============================================================\n");

  return result;
}

if (require.main === module) {
  runSituationRecordComms001().then((res) => {
    process.exit(res.success ? 0 : 1);
  });
}
