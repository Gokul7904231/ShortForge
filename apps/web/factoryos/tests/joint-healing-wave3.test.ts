import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { WorldStateEngine } from "../core/worldstate/WorldStateEngine";
import { InMemoryWorldStateRepository } from "../core/database/InMemoryDatabase";
import { CaseManager } from "../core/cases/CaseManager";
import { GuardianManager } from "../core/guardian/GuardianManager";
import { HealerEngine } from "../core/healers/HealerEngine";
import { JointHealingSessionManager } from "../core/governance/JointHealingSession";
import { DiskJointHealingSessionStore, InMemoryJointHealingSessionStore } from "../core/governance/JointHealingSessionStore";
import { RepairLockManager } from "../core/healers/RepairLockManager";
import { BorderDefenseAgent } from "../core/governance/BorderDefenseAgent";

async function buildRuntime() {
  const eventBus = new DurableEventBus();
  const worldState = new WorldStateEngine(new InMemoryWorldStateRepository(), true);
  await worldState.restore();
  const caseManager = new CaseManager(undefined, eventBus, worldState);
  const guardianManager = new GuardianManager(eventBus, worldState, caseManager);
  const healerEngine = new HealerEngine(caseManager, eventBus, worldState);

  worldState.updateFloorStatus("floor02_scripting", "ONLINE", "wave3 test boot");
  healerEngine.enableJointHealing({
    guardianClosureAuthorizer: async (request) =>
      guardianManager.requestHealingClosureGrant(request),
  });

  return { eventBus, worldState, caseManager, guardianManager, healerEngine };
}

describe("Floor Governance Cell — Wave 3 paired healing", () => {
  it("persists sessions and escalates in-flight mutation state after restart", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-wave3-"));
    try {
      const store = new DiskJointHealingSessionStore(root);
      const first = new JointHealingSessionManager(store);
      const record = first.createSession("incident-01", "floor02_scripting", "healer_a", "healer_b");
      first.transition(record.sessionId, "DIAGNOSING");
      first.transition(record.sessionId, "PLANNED");
      first.transition(record.sessionId, "HEALING");

      const restarted = new JointHealingSessionManager(
        new DiskJointHealingSessionStore(root)
      );
      expect(restarted.get(record.sessionId)?.state).toBe("ESCALATED");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects stale mutation leases with a fencing epoch", async () => {
    const lockManager = new RepairLockManager();
    const first = await lockManager.acquireMutationLease(
      "shared-resource",
      "session-01",
      "healer_a",
      "incident-01",
      "healing.mutate",
      ["RESET_RESOURCE"],
      30000
    );
    expect(first).not.toBeNull();

    await lockManager.releaseMutationLease(first!);

    const second = await lockManager.acquireMutationLease(
      "shared-resource",
      "session-01",
      "healer_a",
      "incident-01",
      "healing.mutate",
      ["RESET_RESOURCE"],
      30000
    );
    expect(second).not.toBeNull();
    expect(second!.fencingEpoch).toBeGreaterThan(first!.fencingEpoch);

    expect(lockManager.validateMutationLease(first!)).toEqual({
      valid: false,
      reason: "stale_fencing_epoch",
    });
    await lockManager.releaseMutationLease(second!);
  });

  it("runs paired reasoning, fenced mutation, BDA reinspection, Auditor verification, and Guardian closure", async () => {
    const { eventBus, caseManager, healerEngine } = await buildRuntime();

    const incident = await caseManager.createCase({
      title: "Wave 3 paired healing",
      description: "Critical worker stall",
      floorId: "floor02_scripting",
      targetWorker: "worker_wave3",
      category: "WORKER_STALL",
      severity: "HIGH",
      detectorId: "wave3_test",
      symptoms: ["heartbeat timeout"],
      observedState: {},
    });

    await caseManager.transitionStatus(incident.caseId, "TRIAGED", "Overseer");
    await caseManager.transitionStatus(incident.caseId, "INVESTIGATING", "Overseer");

    const reports = await healerEngine.dispatchHealersForCase(incident);

    expect(reports).toHaveLength(2);
    expect(reports.every((report) => report.repairStatus === "SUCCESS")).toBe(true);

    const resolved = await caseManager.getCase(incident.caseId);
    expect(resolved?.status).toBe("RESOLVED");
    // All mutation leases must be released before Auditor/Guardian closure.
    expect(healerEngine.lockManager.getAllActiveLocks()).toHaveLength(0);

    const events = eventBus.getEvents(200).map((event) => event.topic);
    expect(events).toContain("JOINT_HEALING_STARTED");
    expect(events).toContain("HEALER_DIAGNOSIS_COMPLETED");
    expect(events).toContain("JOINT_HEALING_MUTATION_APPLIED");
    expect(events).toContain("HEALING_BDA_REINSPECTION_PASSED");
    expect(events).toContain("JOINT_HEALING_AUDIT_PASSED");
    expect(events).toContain("GUARDIAN_CLOSURE_GRANTED");
    expect(events).toContain("JOINT_HEALING_COMPLETED");
  });

  it("blocks closure when BDA reinspection fails", async () => {
    class FailingReinspectionBDA extends BorderDefenseAgent {
      override egress(...args: Parameters<BorderDefenseAgent["egress"]>): ReturnType<BorderDefenseAgent["egress"]> {
        const dossier = super.egress(...args);
        return {
          ...dossier,
          policyDecision: "QUARANTINE",
          anomalies: ["TEST_REINSPECTION_FAILURE"],
          contained: true,
        };
      }
    }

    const eventBus = new DurableEventBus();
    const worldState = new WorldStateEngine(new InMemoryWorldStateRepository(), true);
    await worldState.restore();
    worldState.updateFloorStatus("floor02_scripting", "ONLINE", "wave3 test boot");
    const caseManager = new CaseManager(undefined, eventBus, worldState);
    const lockManager = new RepairLockManager();
    const sessionStore = new InMemoryJointHealingSessionStore();
    let closureCalled = false;

    const { JointHealingOrchestrator } = await import("../core/healers/JointHealingOrchestrator");
    const orchestrator = new JointHealingOrchestrator(
      caseManager,
      eventBus,
      worldState,
      lockManager,
      {
        sessionManager: new JointHealingSessionManager(sessionStore),
        bda: new FailingReinspectionBDA(),
        guardianClosureAuthorizer: async () => {
          closureCalled = true;
          return { authorized: true, grantId: "unexpected", reason: "unexpected" };
        },
      }
    );

    const helperEngine = new HealerEngine(caseManager, eventBus, worldState);
    const incident = await caseManager.createCase({
      title: "Wave 3 BDA rejection",
      description: "Critical worker stall",
      floorId: "floor02_scripting",
      targetWorker: "worker_wave3_bda",
      category: "WORKER_STALL",
      severity: "HIGH",
      detectorId: "wave3_test",
      symptoms: ["heartbeat timeout"],
      observedState: {},
    });

    await caseManager.transitionStatus(incident.caseId, "TRIAGED", "Overseer");
    await caseManager.transitionStatus(incident.caseId, "INVESTIGATING", "Overseer");

    const paired = helperEngine.allocateHealers(incident).slice(0, 2);
    const result = await orchestrator.execute(incident, paired);

    expect(result.bdaReinspectionPassed).toBe(false);
    expect(result.session.state).toBe("ESCALATED");
    expect(closureCalled).toBe(false);
    expect((await caseManager.getCase(incident.caseId))?.status).toBe("ESCALATED");
  });
});
