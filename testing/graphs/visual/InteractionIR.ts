/**
 * FactoryOS v1 / Frontier v3 — Visualization Interaction IR (InteractionIR)
 * Schema-first, strongly typed contract for user and agent interactions with
 * the Mission / Evidence Graph visual projections.
 * Preserves strict separation: Presentation and Interaction layers never mutate
 * authoritative execution truth.
 */

import type { TruthLevel } from "../../contracts/execution.contract";
import type { PresentationViewType } from "./PresentationIR";

export type CanonicalId = string;

export type PresentationAction =
  | {
      type: "OPEN_SUBJECT";
      subjectId: CanonicalId;
    }
  | {
      type: "EXPLAIN_EDGE";
      edgeId: CanonicalId;
    }
  | {
      type: "OPEN_EVIDENCE";
      evidenceId: string;
    }
  | {
      type: "OPEN_ARTIFACT";
      artifactId: string;
    }
  | {
      type: "OPEN_SITUATION";
      situationId: string;
    }
  | {
      type: "OPEN_BROWSER_EVIDENCE";
      evidenceId: string;
    }
  | {
      type: "OPEN_GRAPH_VIEW";
      viewType: PresentationViewType;
      subjectId?: CanonicalId;
    }
  | {
      type: "FOCUS_SUBGRAPH";
      subjectId: CanonicalId;
    }
  | {
      type: "RETURN_TO_PARENT";
    };

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly targetId?: string;
}

export interface VisualizationInteractionReceipt {
  readonly interactionId: string;
  readonly action: PresentationAction;
  readonly sourceView: PresentationViewType;
  readonly subjectId?: CanonicalId;
  readonly resolved: boolean;
  readonly truthLevel?: TruthLevel;
  readonly authoritativeRefs: string[];
  readonly evidenceRefs: string[];
  readonly artifactRefs: string[];
  readonly diagnostics: Diagnostic[];
  readonly generatedAt: string;
}

export interface NodeInspectionResult {
  readonly canonicalId: CanonicalId;
  readonly label: string;
  readonly type: string;
  readonly status: string;
  readonly truthLevel: TruthLevel;
  readonly producer?: string;
  readonly consumers: string[];
  readonly dependencies: string[];
  readonly recoveryState?: {
    readonly recovered: boolean;
    readonly recoveryEngine?: string;
    readonly recoveryEvidenceRef?: string;
  };
  readonly evidenceRefs: string[];
  readonly artifactRefs: string[];
  readonly browserEvidenceRefs: string[];
  readonly timestamps?: {
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly durationMs?: number;
  };
  readonly currentProjectionView: PresentationViewType;
  readonly metadata?: Record<string, unknown>;
  readonly resolved: boolean;
}

export interface EdgeExplanationResult {
  readonly edgeId: CanonicalId;
  readonly fromNodeId: CanonicalId;
  readonly toNodeId: CanonicalId;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly relationshipType: string;
  readonly plannedRelationship: string;
  readonly observedRelationship?: string;
  readonly truthLevel: TruthLevel;
  readonly executionSequence: Array<{
    readonly step: string;
    readonly status: string;
    readonly truthLevel: TruthLevel;
    readonly source?: "EXECUTION_EVENT" | "NODE_STATE" | "ARTIFACT_RECEIPT" | "UNKNOWN";
  }>;
  readonly artifactTransferred?: {
    readonly artifactId: string;
    readonly name: string;
    readonly path: string;
    readonly byteLength: number;
    readonly sha256: string;
    readonly mimeType?: string;
  };
  readonly artifactTruthBasis?:
    | "PHYSICAL_FILE_PROBE"
    | "AUTHORITATIVE_PHYSICAL_RECEIPT"
    | "REPORTED_METADATA"
    | "UNKNOWN";
  readonly producer: string;
  readonly consumer: string;
  readonly verification?: {
    readonly verified: boolean;
    readonly verifier?: string;
    readonly probeRef?: string;
    readonly hardGatesPassed?: number;
  };
  readonly verificationStatus?: "VERIFIED" | "UNVERIFIED" | "UNKNOWN" | "NOT_ESTABLISHED";
  readonly edgeVerificationBasis?:
    | "DIRECT_EDGE_EVIDENCE"
    | "ARTIFACT_TRANSFER_LINEAGE"
    | "EXPLICIT_VERIFICATION_RECEIPT"
    | "NONE";
  readonly evidenceRefs: string[];
  readonly contextualEndpointEvidence?: string[];
  readonly recoveryEvents: string[];
  readonly deliveryConsequences: string[];
  readonly resolved: boolean;
  readonly rationale: string;
}

export interface PhysicalArtifactReceipt {
  readonly receiptId: string;
  readonly artifactId: string;
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly verifiedAt: string;
  readonly source:
    | "ARTIFACT_LINEAGE_JUDGE"
    | "PHYSICAL_PROBE"
    | "F7_VERIFICATION"
    | "OTHER_AUTHORITATIVE_FACTORYOS_SOURCE";
}

export interface ArtifactInspectionResult {
  readonly artifactId: string;
  readonly path: string;
  readonly producer: string;
  readonly consumers: string[];
  readonly byteLength: number;
  readonly sha256: string;
  readonly reportedByteLength?: number;
  readonly reportedSha256?: string;
  readonly physicalByteLength?: number;
  readonly physicalSha256?: string;
  readonly receiptByteLength?: number;
  readonly receiptSha256?: string;
  readonly hashMismatchDetected?: boolean;
  readonly sizeMismatchDetected?: boolean;
  readonly receiptMismatchDetected?: boolean;
  readonly truthLevel?: TruthLevel;
  readonly truthBasis?:
    | "PHYSICAL_FILE_PROBE"
    | "AUTHORITATIVE_PHYSICAL_RECEIPT"
    | "REPORTED_METADATA"
    | "UNKNOWN";
  readonly diagnostic?: string;
  readonly receipt?: PhysicalArtifactReceipt;
  readonly mimeType: string;
  readonly durationSeconds?: number;
  readonly durationTruth?: string;
  readonly physicalExistenceProven: boolean;
  readonly verificationStatus: "VERIFIED" | "UNVERIFIED" | "FAILED" | "UNKNOWN";
  readonly probeResults?: Record<string, boolean>;
  readonly lineageProof: {
    readonly upstreamHashMatch: boolean;
    readonly consumerHashMatch: boolean;
  };
  readonly deliveryStatus: {
    readonly localDelivered: boolean;
    readonly remoteDelivered: boolean;
    readonly outboxLocation?: string;
  };
  readonly resolved: boolean;
}

export interface BrowserEvidenceInspectionResult {
  readonly evidenceId: string;
  readonly kind: "CONSOLE" | "NETWORK" | "DOM_STATE" | "SCREENSHOT" | "PERFORMANCE";
  readonly executionMode: "LIVE_BROWSER" | "BLOCKED_BROWSER" | "SIMULATED_BROWSER" | "MOCKED_BROWSER";
  readonly truthLevel: TruthLevel;
  readonly timestamp: string;
  readonly sourcePage: string;
  readonly requestUrl?: string;
  readonly statusCode?: number;
  readonly domSelector?: string;
  readonly domState?: string;
  readonly screenshotPath?: string;
  readonly screenshotDigest?: string;
  readonly performanceMetric?: {
    readonly navigationTimeMs?: number;
    readonly memoryUsedMB?: number;
  };
  readonly redactedKeysCount: number;
  readonly resolved: boolean;
}

export interface SituationInspectionResult {
  readonly situationId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly sender: {
    readonly agentId: string;
    readonly role: string;
    readonly floorId?: string;
  };
  readonly recipients: string[];
  readonly priority: string;
  readonly type: string;
  readonly text: string;
  readonly graphNodesCount: number;
  readonly graphEdgesCount: number;
  readonly evidenceRefs: string[];
  readonly canonicalEvidenceRefs?: string[];
  readonly unresolvedReferences: string[];
  readonly sourceEvidenceRefs?: Array<{
    readonly source: string;
    readonly canonicalId?: string;
    readonly resolved: boolean;
  }>;
  readonly createdAt: string;
  readonly resolved: boolean;
}

export interface DeltaInspectionResult {
  readonly subjectId: CanonicalId;
  readonly deltaType: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED";
  readonly before?: {
    readonly status?: string;
    readonly truthLevel?: TruthLevel;
    readonly metadata?: Record<string, unknown>;
  };
  readonly delta?: {
    readonly statusChange?: string;
    readonly truthLevelChange?: string;
    readonly changedEvidenceRefs?: string[];
  };
  readonly after?: {
    readonly status?: string;
    readonly truthLevel?: TruthLevel;
    readonly metadata?: Record<string, unknown>;
  };
  readonly resolved: boolean;
}
