import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CaseManager } from "../core/cases/CaseManager";
import { DatabaseFactory } from "../core/database/MongoDBClient";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { WorldStateEngine } from "../core/worldstate/WorldStateEngine";
import {
  DiskFloorBlackboardJournal,
  InMemoryFloorBlackboardJournal,
} from "../core/governance/FloorBlackboardJournal";
import { FloorGovernanceCell } from "../core/governance/FloorGovernanceCell";
import { GuardianGovernanceAdapter } from "../core/governance/GuardianGovernanceAdapter";
import { ProposalOnlyAscalonAdapter } from "../core/governance/AscalonGuardianAdapter";
import { createDefaultFloorActionGraph } from "../core/governance/DefaultFloorActionGraph";
import { BorderDefenseAgent } from "../core/governance/BorderDefenseAgent";
import { PythonFloorBridge } from "../core/bridge/PythonFloorBridge";
import type { FloorHandoffEnvelope } from "../core/contracts/FloorProtocolContracts";

const FLOOR = "floor04_media_synthesis";

function buildCell(journal = new InMemoryFloorBlackboardJournal()): FloorGovernanceCell {
  const cell = new FloorGovernanceCell({
    floorId: FLOOR,
    guardianId: "guardian_floor04",
    actionGraph: createDefaultFloorActionGraph(),
    ascalon: new ProposalOnlyAscalonAdapter(async () => null),
    capabilities: [
      "floor.read",
      "floor.analyze",
      "floor.validate",
      "floor.authorize",
      "floor.execute",
      "floor.verify",
      "floor.close",
      "floor.quarantine",
      "floor.escalate",
      "floor.human_approval",
    ],
    blackboardJournal: journal,
  });
  cell.setState("READY", "wave2 test boot");
  return cell;
}

describe("Floor Governance Cell — Wave 2 runtime integration", () => {
  it("restores a hash-chained blackboard across process reconstruction", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-fgc-"));
    try {
      const journal = new DiskFloorBlackboardJournal(root, FLOOR);
      const cell = buildCell(journal);
      cell.blackboard.append(
        "EVIDENCE",
        "FLOOR_GUARDIAN",
        "VERIFIED",
        { source: "wave2", value: 1 },
        ["evidence_01"]
      );

      const restored = buildCell(new DiskFloorBlackboardJournal(root, FLOOR));
      // Two state transitions are journaled by setState(); the explicit evidence is the third entry.
      expect(restored.blackboard.getEntries()).toHaveLength(3);
      expect(restored.blackboard.getVerifiedEvidence()).toHaveLength(1);
      expect(restored.blackboard.getVerifiedEvidence()[0].evidenceRefs).toEqual(["evidence_01"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("routes a Guardian mutation through the typed action gate before execution", async () => {
    const cell = buildCell();
    const adapter = new GuardianGovernanceAdapter(cell);
    const snapshot = cell.createSnapshot({
      jobs: [],
      workers: [],
      resources: [],
      activeIncidents: [],
      constraints: [],
    });

    let executed = false;
    const result = await adapter.executeDecision(
      {
        action: "RECOVER_WORKER",
        targetId: "worker_01",
        reason: "worker heartbeat loss",
        confidence: 0.91,
        requiresOverseerApproval: false,
        timestamp: new Date().toISOString(),
      },
      snapshot,
      async () => {
        executed = true;
      }
    );

    expect(result.success).toBe(true);
    expect(executed).toBe(true);
    expect(result.actionName).toBe("floor.execute");
    expect(
      cell.blackboard.getEntries().some(
        (entry) =>
          entry.content.event === "GUARDIAN_MUTATION_GATE_OPEN" &&
          entry.author === "FLOOR_GUARDIAN"
      )
    ).toBe(true);
  });

  it("passes Python floor handoffs through the BDA before case creation", async () => {
    const repos = DatabaseFactory.createRepositories(null);
    const worldState = new WorldStateEngine(repos.worldState, true);
    await worldState.restore();
    const eventBus = new DurableEventBus();
    const caseManager = new CaseManager(repos.cases, eventBus, worldState);
    const bridge = new PythonFloorBridge(
      worldState,
      eventBus,
      caseManager,
      new BorderDefenseAgent()
    );

    const envelope: FloorHandoffEnvelope = {
      handoffId: "handoff_wave2_01",
      security: {
        userId: "user_wave2",
        jobId: "job_wave2",
        missionId: "mission_wave2",
        floorId: "floor04_media_synthesis",
        executionId: "exec_wave2_01",
        attempt: 1,
        executionToken: "token_wave2_abcdefghijklmnopqrstuvwxyz",
        initiatedBy: "overseer",
      },
      status: "FAILED",
      errors: ["provider timeout"],
      executionTimeMs: 1200,
      timestamp: new Date().toISOString(),
      nonce: "nonce_wave2_01",
      schemaVersion: "1.0.0",
    };

    await bridge.handleFloorHandoff(envelope);

    const cases = await caseManager.getAllCases();
    expect(cases).toHaveLength(1);
    expect(
      cases[0].evidence.some(
        (e) => e.source === "BorderDefenseAgent" && e.data.bdaPass === true
      )
    ).toBe(true);

    const borderEvents = eventBus.getEvents(20).filter(
      (event) => event.topic === "BORDER_INSPECTED"
    );
    expect(borderEvents).toHaveLength(1);
  });

  it("rejects direct legacy resolution without explicit ResolutionGate proof", async () => {
    const repos = DatabaseFactory.createRepositories(null);
    const worldState = new WorldStateEngine(repos.worldState, true);
    await worldState.restore();
    const eventBus = new DurableEventBus();
    const caseManager = new CaseManager(repos.cases, eventBus, worldState);

    const caseItem = await caseManager.createCase({
      title: "Resolution Gate Test",
      description: "Direct close must require proof",
      floorId: FLOOR,
      category: "WORKER_STALL",
      severity: "MEDIUM",
      detectorId: "test",
      targetWorker: "worker_01",
      symptoms: ["stalled"],
      observedState: {},
    });

    await expect(
      caseManager.resolveCase(caseItem.caseId, {
        diagnosis: "attempted direct close",
      })
    ).rejects.toThrow(/ResolutionGate proof is required/);
  });
});
