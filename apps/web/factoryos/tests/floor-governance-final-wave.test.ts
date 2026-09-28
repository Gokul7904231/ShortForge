import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FloorCouncil } from "../core/governance/FloorCouncil";
import {
  DiskFloorCouncilSessionStore,
  InMemoryFloorCouncilSessionStore,
  type FloorCouncilSessionRecord,
} from "../core/governance/FloorCouncilSessionStore";
import {
  AscalonInferenceAdmissionGate,
  fingerprintAscalonContext,
} from "../core/governance/AscalonInferenceAdmission";
import { FloorGovernanceCell } from "../core/governance/FloorGovernanceCell";
import { createDefaultFloorActionGraph } from "../core/governance/DefaultFloorActionGraph";
import type {
  ActionProposal,
  CounselPacket,
  FloorSnapshot,
} from "../core/governance/FloorGovernanceContracts";
import type {
  AscalonGuardianAdapter,
  AscalonProposalContext,
} from "../core/governance/AscalonGuardianAdapter";

function makeSnapshot(): FloorSnapshot {
  return {
    floorId: "floor02_scripting",
    state: "READY",
    stateVersion: 1,
    observedAt: new Date().toISOString(),
    jobs: [],
    workers: [],
    resources: [],
    activeIncidents: [],
    constraints: [],
  };
}

function makeProposal(
  snapshot: FloorSnapshot,
  actionName = "floor.observe",
  ascalonInference?: ActionProposal["ascalonInference"]
): ActionProposal {
  return {
    proposalId: "proposal_final_wave",
    floorId: snapshot.floorId,
    actionName,
    proposer: "ASCALON",
    parameters: {},
    evidenceRefs: [],
    expectedOutcome: "Trusted floor observation recorded.",
    expectedPostconditions: ["observation_recorded"],
    confidence: 0.9,
    stateVersion: snapshot.stateVersion,
    proposedAt: new Date().toISOString(),
    inputTrust: "TRUSTED_SYSTEM_STATE",
    ascalonInference,
  };
}

function supportingAdvisor(): CounselPacket {
  return {
    counselId: "advisor_support_final",
    floorId: "floor02_scripting",
    recommendation: "SUPPORT:floor.observe",
    supportingEvidence: [],
    constraints: [],
    uncertainty: 0.1,
    conflictsWith: [],
    urgency: "LOW",
    expectedOutcome: "Observation is bounded and safe.",
    rejectionConditions: [],
    provenance: "test_advisor",
    createdAt: new Date().toISOString(),
    ministerRole: "ADVISOR",
  };
}

class StubAscalon implements AscalonGuardianAdapter {
  constructor(private readonly proposal: ActionProposal) {}

  async proposeNext(_context: AscalonProposalContext): Promise<ActionProposal | null> {
    return this.proposal;
  }
}

describe("Floor Governance Cell — Final Wave", () => {
  it("persists a closed council session and reloads it with identical terminal evidence", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-council-"));
    try {
      const store = new DiskFloorCouncilSessionStore(root, "floor02_scripting");
      const council = new FloorCouncil({
        sessionStore: store,
        advisor: async () => supportingAdvisor(),
      });

      const review = await council.reviewProposal({
        snapshot: makeSnapshot(),
        proposal: makeProposal(makeSnapshot()),
        action: createDefaultFloorActionGraph().getAction("floor.observe")!,
        currentAction: "START",
        nextActions: ["floor.observe"],
        verifiedEvidenceRefs: [],
      });

      expect(review.decision).toBe("APPROVE");

      const reloaded = new DiskFloorCouncilSessionStore(root, "floor02_scripting");
      const persisted = reloaded.get(review.sessionId);
      expect(persisted?.state).toBe("CLOSED");
      expect(persisted?.decision).toBe("APPROVE");
      expect(persisted?.proposalFingerprint).toBe(review.proposalFingerprint);
      expect(persisted?.phaseTrace).toEqual(review.phaseTrace);
      expect(persisted?.counselPackets).toHaveLength(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("escalates an in-flight council session after restart instead of resuming it", () => {
    const store = new InMemoryFloorCouncilSessionStore();
    const session: FloorCouncilSessionRecord = {
      sessionId: "council_inflight_01",
      proposalId: "proposal_inflight_01",
      floorId: "floor02_scripting",
      stateVersion: 7,
      actionName: "floor.observe",
      proposalFingerprint: "fp",
      state: "ADVISOR_REVIEW",
      phaseTrace: ["INSTRUCTOR_REVIEW", "ADVISOR_REVIEW"],
      counselPackets: [],
      conflicts: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.create(session);

    new FloorCouncil({ sessionStore: store });
    const recovered = store.get(session.sessionId);

    expect(recovered?.state).toBe("ESCALATED");
    expect(recovered?.recoveryReason).toBe("council_session_recovered_after_process_restart");
  });

  it("passes only verified derived memory context into the Advisor and stores only its references durably", async () => {
    const store = new InMemoryFloorCouncilSessionStore();
    let advisorMemoryItems = 0;

    const council = new FloorCouncil({
      sessionStore: store,
      memoryProvider: async () => ({
        snapshotId: "memory_snapshot_01",
        generatedAt: "2026-09-28T10:00:00.000Z",
        items: [
          {
            id: "memory_verified_01",
            title: "Verified repair outcome",
            content: "Prior verified repair completed without regression.",
            provenance: "runtime-event:VERIFICATION_PASSED",
            qualityScore: 0.95,
          },
        ],
      }),
      advisor: async ({ memoryContext }) => {
        advisorMemoryItems = memoryContext?.items.length || 0;
        return supportingAdvisor();
      },
    });

    const snapshot = makeSnapshot();
    const review = await council.reviewProposal({
      snapshot,
      proposal: makeProposal(snapshot),
      action: createDefaultFloorActionGraph().getAction("floor.observe")!,
      currentAction: "START",
      nextActions: ["floor.observe"],
      verifiedEvidenceRefs: [],
    });

    expect(review.decision).toBe("APPROVE");
    expect(advisorMemoryItems).toBe(1);
    expect(review.memoryContext?.snapshotId).toBe("memory_snapshot_01");
    expect(review.memoryContext?.itemIds).toEqual(["memory_verified_01"]);

    const persisted = store.get(review.sessionId);
    expect(persisted?.memoryContext?.itemIds).toEqual(["memory_verified_01"]);
  });

  it("admits only a context-bound Ascalon inference to Council, while shadow inference never becomes executable", async () => {
    const snapshot = makeSnapshot();
    const availableActions = ["floor.observe"];
    const fingerprint = fingerprintAscalonContext(snapshot, availableActions, []);
    const gate = new AscalonInferenceAdmissionGate(0.7, new Set(["ascalon-test-v1"]));

    const admitted = gate.evaluate({
      snapshot,
      availableActions,
      verifiedEvidenceRefs: [],
      envelope: {
        metadata: {
          inferenceId: "infer_admitted_01",
          modelRef: "ascalon-test-v1",
          adapterVersion: "gateway-v1",
          mode: "ADMITTED",
          contextFingerprint: fingerprint,
          observedAt: new Date().toISOString(),
        },
        proposal: makeProposal(snapshot, "floor.observe", {
          inferenceId: "infer_admitted_01",
          modelRef: "ascalon-test-v1",
          adapterVersion: "gateway-v1",
          mode: "ADMITTED",
          contextFingerprint: fingerprint,
          observedAt: new Date().toISOString(),
        }),
      },
    });

    expect(admitted.admitted).toBe(true);
    expect(admitted.proposal?.actionName).toBe("floor.observe");

    const shadow = gate.evaluate({
      snapshot,
      availableActions,
      verifiedEvidenceRefs: [],
      envelope: {
        metadata: {
          inferenceId: "infer_shadow_01",
          modelRef: "ascalon-test-v1",
          adapterVersion: "gateway-v1",
          mode: "SHADOW",
          contextFingerprint: fingerprint,
          observedAt: new Date().toISOString(),
        },
        proposal: makeProposal(snapshot, "floor.observe", {
          inferenceId: "infer_shadow_01",
          modelRef: "ascalon-test-v1",
          adapterVersion: "gateway-v1",
          mode: "SHADOW",
          contextFingerprint: fingerprint,
          observedAt: new Date().toISOString(),
        }),
      },
    });

    expect(shadow.admitted).toBe(false);
    expect(shadow.shadowOnly).toBe(true);
    expect(shadow.proposal).toBeUndefined();
  });

  it("routes an admitted Ascalon proposal through Council rather than executing it directly", async () => {
    const snapshot = makeSnapshot();
    const availableActions = ["floor.observe"];
    const fingerprint = fingerprintAscalonContext(snapshot, availableActions, []);
    const proposal = makeProposal(snapshot, "floor.observe", {
      inferenceId: "infer_live_boundary",
      modelRef: "ascalon-test-v1",
      adapterVersion: "gateway-v1",
      mode: "ADMITTED",
      contextFingerprint: fingerprint,
      observedAt: new Date().toISOString(),
    });

    const cell = new FloorGovernanceCell({
      floorId: snapshot.floorId,
      guardianId: "guardian_floor02_scripting",
      actionGraph: createDefaultFloorActionGraph(),
      ascalon: new StubAscalon(proposal),
      capabilities: ["floor.read", "floor.analyze", "floor.validate"],
      council: new FloorCouncil({ advisor: async () => supportingAdvisor() }),
      ascalonAdmission: new AscalonInferenceAdmissionGate(0.7, new Set(["ascalon-test-v1"])),
    });

    cell.setState("READY");
    const admittedProposal = await cell.proposeNext(snapshot);

    expect(admittedProposal?.proposalId).toBe(proposal.proposalId);
    expect(
      cell.blackboard.getEntries().some(
        (entry) =>
          entry.kind === "RECOMMENDATION" &&
          entry.author === "ADVISOR" &&
          entry.content.event === "COUNCIL_APPROVED_PROPOSAL"
      )
    ).toBe(true);

    const execution = await cell.authorizeAndExecute(
      admittedProposal!,
      snapshot,
      async () => undefined,
      {
        satisfiedPreconditions: new Set(["floor_ready", "candidate_validated", "authorization_grant_present"]),
        evidenceRefs: new Set(),
      }
    );

    expect(execution.success).toBe(false);
    expect(["missing_authorization_grant", "required_capability_missing", "authorization_capability_mismatch"])
      .toContain(execution.reason);
  });
});


describe("Floor Governance Cell — Final Wave — Model admission fail-closed", () => {
  it("rejects admitted inference when no model allowlist is configured", () => {
    const snapshot = makeSnapshot();
    const availableActions = ["floor.observe"];
    const fingerprint = fingerprintAscalonContext(snapshot, availableActions, []);
    const gate = new AscalonInferenceAdmissionGate(0.7);

    const result = gate.evaluate({
      snapshot,
      availableActions,
      verifiedEvidenceRefs: [],
      envelope: {
        metadata: {
          inferenceId: "infer_unallowlisted",
          modelRef: "unknown-model",
          adapterVersion: "gateway-v1",
          mode: "ADMITTED",
          contextFingerprint: fingerprint,
          observedAt: new Date().toISOString(),
        },
        proposal: makeProposal(snapshot, "floor.observe", {
          inferenceId: "infer_unallowlisted",
          modelRef: "unknown-model",
          adapterVersion: "gateway-v1",
          mode: "ADMITTED",
          contextFingerprint: fingerprint,
          observedAt: new Date().toISOString(),
        }),
      },
    });

    expect(result.admitted).toBe(false);
    expect(result.reason).toContain("model_ref_allowlist_not_configured");
  });
});
