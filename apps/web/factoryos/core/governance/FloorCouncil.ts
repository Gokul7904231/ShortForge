import { randomUUID } from "node:crypto";
import type {
  ActionProposal,
  CounselPacket,
  FloorActionContract,
  FloorSnapshot,
} from "./FloorGovernanceContracts";
import {
  DiskFloorCouncilSessionStore,
  type FloorCouncilMemoryContext,
  type FloorCouncilSessionRecord,
  type FloorCouncilSessionState,
  type FloorCouncilSessionStore,
  proposalFingerprint,
} from "./FloorCouncilSessionStore";

export interface FloorCouncilAdvisorContext {
  readonly snapshot: FloorSnapshot;
  readonly proposal: ActionProposal;
  readonly action: FloorActionContract;
  readonly verifiedEvidenceRefs: readonly string[];
  readonly memoryContext?: FloorCouncilMemoryContext;
}

export type FloorCouncilAdvisor = (
  context: FloorCouncilAdvisorContext
) => Promise<CounselPacket>;

export type FloorCouncilMemoryProvider = (
  query: string,
  maxItems: number,
  maxChars: number,
) => Promise<FloorCouncilMemoryContext | null>;

export type FloorCouncilPhase =
  | "INSTRUCTOR_REVIEW"
  | "ADVISOR_REVIEW"
  | "AUDITOR_REVIEW"
  | "SYNTHESIS"
  | "CLOSED";

export interface FloorCouncilReview {
  readonly sessionId: string;
  readonly proposalFingerprint: string;
  readonly decision: "APPROVE" | "REJECT" | "ESCALATE";
  readonly reason: string;
  readonly counselPackets: readonly CounselPacket[];
  readonly conflicts: readonly string[];
  readonly phaseTrace: readonly FloorCouncilPhase[];
  readonly reviewedAt: string;
  readonly memoryContext?: {
    readonly snapshotId: string;
    readonly generatedAt: string;
    readonly itemIds: readonly string[];
  };
}

export interface FloorCouncilConfig {
  readonly advisor?: FloorCouncilAdvisor;
  readonly minAdvisorConfidence?: number;
  readonly sessionStore?: FloorCouncilSessionStore;
  readonly sessionStoragePath?: string;
  readonly floorId?: string;
  readonly memoryProvider?: FloorCouncilMemoryProvider;
  readonly memoryMaxItems?: number;
  readonly memoryMaxChars?: number;
}

function sessionPhaseFor(phase: FloorCouncilPhase): FloorCouncilSessionState {
  if (phase === "INSTRUCTOR_REVIEW") return "INSTRUCTOR_REVIEW";
  if (phase === "ADVISOR_REVIEW") return "ADVISOR_REVIEW";
  if (phase === "AUDITOR_REVIEW") return "AUDITOR_REVIEW";
  if (phase === "SYNTHESIS") return "SYNTHESIS";
  return "CLOSED";
}

export class FloorCouncil {
  private advisor?: FloorCouncilAdvisor;
  private readonly minAdvisorConfidence: number;
  private readonly sessionStore?: FloorCouncilSessionStore;
  private memoryProvider?: FloorCouncilMemoryProvider;
  private readonly memoryMaxItems: number;
  private readonly memoryMaxChars: number;

  constructor(config: FloorCouncilConfig = {}) {
    this.advisor = config.advisor;
    this.minAdvisorConfidence = config.minAdvisorConfidence ?? 0.7;
    this.sessionStore =
      config.sessionStore ||
      (config.sessionStoragePath && config.floorId
        ? new DiskFloorCouncilSessionStore(config.sessionStoragePath, config.floorId)
        : undefined);
    this.memoryProvider = config.memoryProvider;
    this.memoryMaxItems = Math.max(1, config.memoryMaxItems ?? 8);
    this.memoryMaxChars = Math.max(1000, config.memoryMaxChars ?? 8000);

    // Never resume probabilistic deliberation across a process restart.
    // In-flight sessions are converted to explicit escalation records.
    if (this.sessionStore) {
      for (const openSession of this.sessionStore.listOpen()) {
        this.sessionStore.markEscalated(
          openSession.sessionId,
          "council_session_recovered_after_process_restart"
        );
      }
    }
  }

  setAdvisor(advisor: FloorCouncilAdvisor): void {
    this.advisor = advisor;
  }

  setMemoryProvider(provider: FloorCouncilMemoryProvider): void {
    this.memoryProvider = provider;
  }

  async reviewProposal(input: {
    snapshot: FloorSnapshot;
    proposal: ActionProposal;
    action: FloorActionContract;
    currentAction: string | "START";
    nextActions: readonly string[];
    verifiedEvidenceRefs: readonly string[];
  }): Promise<FloorCouncilReview> {
    const reviewedAt = new Date().toISOString();
    const phaseTrace: FloorCouncilPhase[] = ["INSTRUCTOR_REVIEW"];
    const conflicts: string[] = [];
    const sessionId = `council_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const fingerprint = proposalFingerprint({
      floorId: input.proposal.floorId,
      stateVersion: input.proposal.stateVersion,
      actionName: input.proposal.actionName,
      proposer: input.proposal.proposer,
      targetId: input.proposal.targetId,
      evidenceRefs: input.proposal.evidenceRefs,
      parameters: input.proposal.parameters,
    });

    let memoryContext: FloorCouncilMemoryContext | undefined;
    if (this.memoryProvider) {
      try {
        memoryContext = (await this.memoryProvider(
          `${input.snapshot.floorId} ${input.proposal.actionName} ${input.proposal.expectedOutcome}`,
          this.memoryMaxItems,
          this.memoryMaxChars
        )) || undefined;
      } catch {
        // Memory is derived context. Its unavailability must never become authority.
        memoryContext = undefined;
      }
    }

    let session: FloorCouncilSessionRecord = {
      sessionId,
      proposalId: input.proposal.proposalId,
      floorId: input.snapshot.floorId,
      stateVersion: input.snapshot.stateVersion,
      actionName: input.proposal.actionName,
      proposalFingerprint: fingerprint,
      contextFingerprint: input.proposal.ascalonInference?.contextFingerprint,
      memoryContext: memoryContext
        ? {
            snapshotId: memoryContext.snapshotId,
            generatedAt: memoryContext.generatedAt,
            itemIds: memoryContext.items.map((item) => item.id),
          }
        : undefined,
      state: "CREATED",
      phaseTrace: [...phaseTrace],
      counselPackets: [],
      conflicts: [],
      startedAt: reviewedAt,
      updatedAt: reviewedAt,
    };

    const checkpoint = (patch: Partial<FloorCouncilSessionRecord>) => {
      session = {
        ...session,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this.sessionStore?.save(session);
    };

    this.sessionStore?.create(session);

    const instructor = this.buildInstructorPacket(input, reviewedAt);
    checkpoint({
      state: sessionPhaseFor("INSTRUCTOR_REVIEW"),
      phaseTrace: [...phaseTrace],
      counselPackets: [instructor],
    });

    let advisor: CounselPacket;
    phaseTrace.push("ADVISOR_REVIEW");
    if (!this.advisor) {
      advisor = {
        counselId: "counsel_advisor_unavailable",
        floorId: input.snapshot.floorId,
        recommendation: "ESCALATE:ADVISOR_UNAVAILABLE",
        supportingEvidence: [],
        constraints: ["advisor_runtime_not_attached"],
        uncertainty: 1,
        conflictsWith: [],
        urgency: input.action.risk,
        expectedOutcome: "No autonomous promotion without Advisor review.",
        rejectionConditions: ["No Advisor runtime"],
        provenance: "FloorCouncil",
        createdAt: reviewedAt,
        ministerRole: "ADVISOR",
      };
    } else {
      try {
        advisor = await this.advisor({
          snapshot: input.snapshot,
          proposal: input.proposal,
          action: input.action,
          verifiedEvidenceRefs: input.verifiedEvidenceRefs,
          memoryContext,
        });
      } catch (error) {
        advisor = {
          counselId: `counsel_advisor_error_${input.proposal.proposalId}`,
          floorId: input.snapshot.floorId,
          recommendation: `CHALLENGE:${input.proposal.actionName}`,
          supportingEvidence: [],
          constraints: ["advisor_runtime_error"],
          uncertainty: 1,
          conflictsWith: ["ADVISOR_RUNTIME_ERROR"],
          urgency: input.action.risk,
          expectedOutcome: "Council must escalate because cognitive counsel failed closed.",
          rejectionConditions: [error instanceof Error ? error.message : String(error)],
          provenance: "FloorCouncil.fail_closed.advisor",
          createdAt: reviewedAt,
          ministerRole: "ADVISOR",
        };
      }
    }

    checkpoint({
      state: sessionPhaseFor("ADVISOR_REVIEW"),
      phaseTrace: [...phaseTrace],
      counselPackets: [instructor, advisor],
    });

    phaseTrace.push("AUDITOR_REVIEW");
    const auditor = this.buildAuditorPacket(input, instructor, reviewedAt);
    checkpoint({
      state: sessionPhaseFor("AUDITOR_REVIEW"),
      phaseTrace: [...phaseTrace],
      counselPackets: [instructor, advisor, auditor],
    });

    phaseTrace.push("SYNTHESIS");
    checkpoint({
      state: "SYNTHESIS",
      phaseTrace: [...phaseTrace],
      counselPackets: [instructor, advisor, auditor],
      conflicts: [...conflicts],
    });

    if (instructor.recommendation !== `SUPPORT:${input.proposal.actionName}`) {
      conflicts.push("INSTRUCTOR_REJECTED_PROPOSAL");
    }

    if (auditor.recommendation !== `SUPPORT:${input.proposal.actionName}`) {
      conflicts.push("AUDITOR_REJECTED_PROPOSAL");
    }

    if (advisor.recommendation !== `SUPPORT:${input.proposal.actionName}`) {
      conflicts.push("ADVISOR_DISAGREES");
    }

    if (advisor.uncertainty > 1 - this.minAdvisorConfidence) {
      conflicts.push("ADVISOR_CONFIDENCE_BELOW_THRESHOLD");
    }

    if (advisor.conflictsWith.length > 0) {
      conflicts.push(...advisor.conflictsWith.map((id) => `ADVISOR_CONFLICT:${id}`));
    }

    const uniqueConflicts = Array.from(new Set(conflicts));

    if (uniqueConflicts.length === 0) {
      checkpoint({
        state: "CLOSED",
        phaseTrace: [...phaseTrace, "CLOSED"],
        counselPackets: [instructor, advisor, auditor],
        conflicts: [],
        decision: "APPROVE",
        reason: "Instructor, Advisor and Auditor counsel are mutually consistent and evidence-bounded.",
      });
      return {
        sessionId,
        proposalFingerprint: fingerprint,
        decision: "APPROVE",
        reason: "Instructor, Advisor and Auditor counsel are mutually consistent and evidence-bounded.",
        counselPackets: [instructor, advisor, auditor],
        conflicts: [],
        phaseTrace: [...phaseTrace, "CLOSED"],
        reviewedAt,
        memoryContext: memoryContext
          ? {
              snapshotId: memoryContext.snapshotId,
              generatedAt: memoryContext.generatedAt,
              itemIds: memoryContext.items.map((item) => item.id),
            }
          : undefined,
      };
    }

    const hardBoundaryFailure =
      uniqueConflicts.some((reason) => reason.startsWith("INSTRUCTOR_")) ||
      uniqueConflicts.some((reason) => reason.startsWith("AUDITOR_"));

    const decision = hardBoundaryFailure ? "REJECT" : "ESCALATE";
    const reason = hardBoundaryFailure
      ? "A deterministic governance boundary rejected the proposal."
      : "Council members disagree or Advisor confidence is insufficient; authority must not be inferred from consensus.";

    checkpoint({
      state: "CLOSED",
      phaseTrace: [...phaseTrace, "CLOSED"],
      counselPackets: [instructor, advisor, auditor],
      conflicts: uniqueConflicts,
      decision,
      reason,
    });

    return {
      sessionId,
      proposalFingerprint: fingerprint,
      decision,
      reason,
      counselPackets: [instructor, advisor, auditor],
      conflicts: uniqueConflicts,
      phaseTrace: [...phaseTrace, "CLOSED"],
      reviewedAt,
      memoryContext: memoryContext
        ? {
            snapshotId: memoryContext.snapshotId,
            generatedAt: memoryContext.generatedAt,
            itemIds: memoryContext.items.map((item) => item.id),
          }
        : undefined,
    };
  }

  private buildInstructorPacket(
    input: {
      snapshot: FloorSnapshot;
      proposal: ActionProposal;
      action: FloorActionContract;
      currentAction: string | "START";
      nextActions: readonly string[];
      verifiedEvidenceRefs: readonly string[];
    },
    createdAt: string
  ): CounselPacket {
    const conditions: string[] = [];

    if (input.proposal.floorId !== input.snapshot.floorId) {
      conditions.push("proposal_floor_mismatch");
    }
    if (input.proposal.stateVersion !== input.snapshot.stateVersion) {
      conditions.push("proposal_state_version_stale");
    }
    if (!input.nextActions.includes(input.proposal.actionName)) {
      conditions.push("action_not_reachable_from_current_graph_state");
    }
    if (!input.action.actorProposers.includes(input.proposal.proposer)) {
      conditions.push("proposer_not_allowed_for_action");
    }

    for (const evidenceRef of input.proposal.evidenceRefs) {
      if (!input.verifiedEvidenceRefs.includes(evidenceRef)) {
        conditions.push(`unverified_evidence_ref:${evidenceRef}`);
      }
    }

    const supports = conditions.length === 0;
    return {
      counselId: `counsel_instructor_${input.proposal.proposalId}`,
      floorId: input.snapshot.floorId,
      recommendation: supports
        ? `SUPPORT:${input.proposal.actionName}`
        : `REJECT:${input.proposal.actionName}`,
      supportingEvidence: [...input.proposal.evidenceRefs],
      constraints: conditions,
      uncertainty: supports ? 0.05 : 0,
      conflictsWith: [],
      urgency: input.action.risk,
      expectedOutcome: input.proposal.expectedOutcome,
      rejectionConditions: conditions,
      provenance: "FloorCouncil.deterministic.instructor",
      createdAt,
      ministerRole: "INSTRUCTOR",
    };
  }

  private buildAuditorPacket(
    input: {
      snapshot: FloorSnapshot;
      proposal: ActionProposal;
      action: FloorActionContract;
      currentAction: string | "START";
      nextActions: readonly string[];
      verifiedEvidenceRefs: readonly string[];
    },
    instructor: CounselPacket,
    createdAt: string
  ): CounselPacket {
    const conditions: string[] = [];
    const requiredEvidenceMissing = input.action.requiredEvidence.filter(
      (required) => !input.verifiedEvidenceRefs.includes(required)
    );

    if (requiredEvidenceMissing.length > 0) {
      conditions.push(...requiredEvidenceMissing.map((item) => `required_evidence_missing:${item}`));
    }

    if (input.proposal.inputTrust === "UNTRUSTED_EVIDENCE") {
      conditions.push("proposal_input_is_untrusted");
    }

    if (instructor.recommendation.startsWith("REJECT:")) {
      conditions.push("instructor_boundary_failed");
    }

    const supports = conditions.length === 0;
    return {
      counselId: `counsel_auditor_${input.proposal.proposalId}`,
      floorId: input.snapshot.floorId,
      recommendation: supports
        ? `SUPPORT:${input.proposal.actionName}`
        : `REJECT:${input.proposal.actionName}`,
      supportingEvidence: [...input.proposal.evidenceRefs, ...input.action.requiredEvidence],
      constraints: conditions,
      uncertainty: supports ? 0.05 : 0,
      conflictsWith: [],
      urgency: input.action.risk,
      expectedOutcome: supports
        ? "Proposal evidence and governance constraints are internally consistent."
        : "Proposal must not cross the action gate with incomplete evidence.",
      rejectionConditions: conditions,
      provenance: "FloorCouncil.deterministic.auditor",
      createdAt,
      ministerRole: "AUDITOR",
    };
  }
}
