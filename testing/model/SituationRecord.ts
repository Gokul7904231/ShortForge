import type { TruthLevel } from "../contracts/execution.contract";

export interface SituationGraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: "FLOOR" | "ARTIFACT" | "DECISION" | "FAILURE" | "RECOVERY" | "DELIVERY" | "UI_STATE" | "VERIFICATION";
  readonly status?: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED" | "RECOVERED";
  readonly metadata?: Record<string, unknown>;
}


export interface SituationGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type:
    | "PLANNED_DEPENDENCY"
    | "EXECUTION_SEQUENCE"
    | "ARTIFACT_PRODUCED"
    | "ARTIFACT_CONSUMED"
    | "VERIFICATION"
    | "RECOVERY"
    | "ESCALATION"
    | "EVIDENCE_SUPPORT"
    | "UI_ACTION";
  readonly label?: string;
}

export interface SituationGraphIR {
  readonly schemaVersion: string;
  readonly nodes: SituationGraphNode[];
  readonly edges: SituationGraphEdge[];
  readonly focus: string[]; // IDs of focal nodes
  readonly emphasis: Array<{
    readonly targetId: string;
    readonly visualWeight: "PRIMARY" | "ALERT" | "MUTED";
    readonly reason: string;
  }>;
  readonly viewHints?: {
    readonly preferredView?: "OVERVIEW" | "FORENSIC" | "DEPENDENCY" | "RECOVERY";
    readonly collapsedGroups?: string[];
  };
}

export interface SituationEvidenceRef {
  readonly evidenceId: string;
  readonly type:
    | "ARTIFACT"
    | "EVENT"
    | "VERIFICATION_PROBE"
    | "DECISION_LEDGER"
    | "OUTBOX_RECEIPT"
    | "BROWSER_OBSERVATION";
  readonly truthLevel: TruthLevel;
  readonly digest?: string;
  readonly uriOrPath?: string;
  readonly description: string;
}

export interface SituationRecord {
  readonly id: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly schemaVersion?: string;
  readonly sender: {
    readonly agentId: string;
    readonly role: string;
    readonly floorId?: string;
  };
  readonly recipients: string[];
  readonly type:
    | "STATUS"
    | "FAILURE"
    | "RECOVERY"
    | "DECISION"
    | "HANDOFF"
    | "VERIFICATION"
    | "DELIVERY"
    | "INVESTIGATION"
    | "ESCALATION";
  readonly priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  readonly text: string;
  readonly graph: SituationGraphIR;
  readonly evidence: SituationEvidenceRef[];
  readonly createdAt: string;
}

