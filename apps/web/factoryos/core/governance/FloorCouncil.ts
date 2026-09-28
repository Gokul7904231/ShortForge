import type {
  ActionProposal,
  CounselPacket,
  FloorActionContract,
  FloorSnapshot,
} from "./FloorGovernanceContracts";

export interface FloorCouncilAdvisorContext {
  readonly snapshot: FloorSnapshot;
  readonly proposal: ActionProposal;
  readonly action: FloorActionContract;
  readonly verifiedEvidenceRefs: readonly string[];
}

export type FloorCouncilAdvisor = (
  context: FloorCouncilAdvisorContext
) => Promise<CounselPacket>;

export type FloorCouncilPhase =
  | "INSTRUCTOR_REVIEW"
  | "ADVISOR_REVIEW"
  | "AUDITOR_REVIEW"
  | "SYNTHESIS"
  | "CLOSED";

export interface FloorCouncilReview {
  readonly decision: "APPROVE" | "REJECT" | "ESCALATE";
  readonly reason: string;
  readonly counselPackets: readonly CounselPacket[];
  readonly conflicts: readonly string[];
  readonly phaseTrace: readonly FloorCouncilPhase[];
  readonly reviewedAt: string;
}

export interface FloorCouncilConfig {
  readonly advisor?: FloorCouncilAdvisor;
  readonly minAdvisorConfidence?: number;
}

export class FloorCouncil {
  private advisor?: FloorCouncilAdvisor;
  private readonly minAdvisorConfidence: number;

  constructor(config: FloorCouncilConfig = {}) {
    this.advisor = config.advisor;
    this.minAdvisorConfidence = config.minAdvisorConfidence ?? 0.7;
  }

  setAdvisor(advisor: FloorCouncilAdvisor): void {
    this.advisor = advisor;
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

    const instructor = this.buildInstructorPacket(input, reviewedAt);

    let advisor: CounselPacket;
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
      advisor = await this.advisor({
        snapshot: input.snapshot,
        proposal: input.proposal,
        action: input.action,
        verifiedEvidenceRefs: input.verifiedEvidenceRefs,
      });
    }

    phaseTrace.push("ADVISOR_REVIEW");
    const auditor = this.buildAuditorPacket(input, instructor, reviewedAt);
    phaseTrace.push("AUDITOR_REVIEW", "SYNTHESIS");

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

    if (conflicts.length === 0) {
      return {
        decision: "APPROVE",
        reason: "Instructor, Advisor and Auditor counsel are mutually consistent and evidence-bounded.",
        counselPackets: [instructor, advisor, auditor],
        conflicts: [],
        phaseTrace: [...phaseTrace, "CLOSED"],
        reviewedAt,
      };
    }

    const hardBoundaryFailure =
      conflicts.some((reason) => reason.startsWith("INSTRUCTOR_")) ||
      conflicts.some((reason) => reason.startsWith("AUDITOR_"));

    return {
      decision: hardBoundaryFailure ? "REJECT" : "ESCALATE",
      reason: hardBoundaryFailure
        ? "A deterministic governance boundary rejected the proposal."
        : "Council members disagree or Advisor confidence is insufficient; authority must not be inferred from consensus.",
      counselPackets: [instructor, advisor, auditor],
      conflicts: Array.from(new Set(conflicts)),
      phaseTrace: [...phaseTrace, "CLOSED"],
      reviewedAt,
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
