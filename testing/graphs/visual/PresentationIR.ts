/**
 * FactoryOS v1 — Graph Presentation Intermediate Representation (PresentationIR)
 * Schema-first, typed intermediate representation for visual graph projection.
 * Bridges MissionGraphIR, EvidenceGraphIR, and SituationRecord to deterministic renderers
 * following tt-a1i/archify and cathrynlavery/diagram-design principles.
 */

import type { TruthLevel } from "../../contracts/execution.contract";

export type PresentationViewType =
  | "MISSION_OVERVIEW"
  | "OVERSEER_OPERATIONAL"
  | "SLAYER_FORENSIC"
  | "EVIDENCE_DRILLDOWN"
  | "DELTA_COMPARISON";

export type VisualWeight = "CRITICAL" | "PRIMARY" | "MUTED";

export type NodeVisualShape = "RECT" | "PILL" | "DIAMOND" | "HEXAGON" | "SHIELD" | "CYLINDER";

export type EdgeLineStyle = "solid" | "dashed" | "dotted";

export interface PresentationNode {
  readonly id: string; // Canonical source ID (e.g. missionGraphNode.id)
  readonly label: string;
  readonly type:
    | "MISSION"
    | "GOAL"
    | "FLOOR"
    | "TASK_NODE"
    | "CAPABILITY"
    | "DECISION"
    | "ARTIFACT"
    | "VERIFICATION"
    | "DELIVERY"
    | "UI_STATE"
    | "FAILURE"
    | "RECOVERY"
    | "EVIDENCE";
  readonly status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED" | "RECOVERED" | "UNKNOWN";
  readonly truthLevel: TruthLevel;
  readonly group?: string;
  readonly evidenceRefs: string[]; // Canonical evidence IDs
  readonly metrics?: Record<string, string | number>;
  readonly metadata?: Record<string, unknown>;
  readonly visualHints: {
    readonly isFocal: boolean;
    readonly emphasis: VisualWeight;
    readonly icon: string;
    readonly shape: NodeVisualShape;
    readonly badge?: string;
    readonly order?: number;
  };
  readonly inspectable?: boolean;
  readonly actions?: string[];
  readonly parentSubjectId?: string;
  readonly sourceType?: string;
  readonly selectionKey?: string;
  readonly artifactRefs?: string[];
  readonly browserEvidenceRefs?: string[];
}

export interface PresentationEdge {
  readonly id: string; // Canonical edge ID
  readonly from: string; // Source canonical node ID
  readonly to: string; // Target canonical node ID
  readonly type: string;
  readonly label?: string;
  readonly truthLevel: TruthLevel;
  readonly status: string;
  readonly evidenceRefs?: string[];
  readonly artifactRefs?: string[];
  readonly executionRefs?: string[];
  readonly inspectable?: boolean;
  readonly explainable?: boolean;
  readonly visualHints: {
    readonly style: EdgeLineStyle;
    readonly color: string;
    readonly marker: "arrow" | "circle" | "none";
    readonly highlighted?: boolean;
  };
}

export interface PresentationGroup {
  readonly id: string;
  readonly label: string;
  readonly collapsed: boolean;
  readonly nodeIds: string[];
}

export interface PresentationAnnotation {
  readonly targetId: string;
  readonly text: string;
  readonly type: "INFO" | "WARNING" | "ALERT" | "EVIDENCE";
}

export interface ComplexityBudget {
  readonly maxNodes: number;
  readonly currentNodes: number;
  readonly budgetExceeded: boolean;
  readonly action: "NONE" | "COLLAPSED" | "SPLIT";
}

export interface GuidedStoryChapter {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly focalNodeIds: string[];
  readonly visibleEdgeIds: string[];
}

export interface GraphPresentationIR {
  readonly schemaVersion: string;
  readonly viewType: PresentationViewType;
  readonly title: string;
  readonly subtitle: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly nodes: PresentationNode[];
  readonly edges: PresentationEdge[];
  readonly groups: PresentationGroup[];
  readonly focus: string[]; // Node IDs with active focus
  readonly emphasis: Array<{
    readonly targetId: string;
    readonly visualWeight: VisualWeight;
    readonly reason: string;
  }>;
  readonly collapsedGroups: string[];
  readonly annotations: PresentationAnnotation[];
  readonly complexityBudget: ComplexityBudget;
  readonly chapters?: GuidedStoryChapter[];
  readonly metadata?: Record<string, unknown>;
  readonly generatedAt: string;
}

export interface VisualizationReceipt {
  readonly schemaVersion: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly viewType: PresentationViewType;
  readonly presentationHash: string;
  readonly artifactPath?: string;
  readonly artifactHash?: string;
  readonly htmlArtifactPath?: string;
  readonly htmlArtifactHash?: string;
  readonly status: "VALIDATED" | "DELIVERED" | "FAILED" | "BLOCKED" | "UNKNOWN";
  readonly validationPassed: boolean;
  readonly diagnostics: string[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly viewport: { width: number; height: number };
  readonly lastGoodReference?: string;
  readonly generatedAt: string;
  // V2 interaction extensions
  readonly interactionCount?: number;
  readonly selectedSubject?: string;
  readonly selectedEdge?: string;
  readonly evidenceRefs?: string[];
  readonly artifactRefs?: string[];
  readonly navigationPath?: string[];
  readonly renderHash?: string;
  readonly screenshotHash?: string;
  readonly browserExecutionMode?: string;
  readonly validationDiagnostics?: string[];
  readonly semanticResolutionPassed?: boolean;
  readonly browserVerificationPassed?: boolean;
}

export const FactoryOSVisualTokens = {
  colors: {
    background: "#09090b",
    surface: "#18181b",
    surfaceElevated: "#27272a",
    border: "#3f3f46",
    borderSubtle: "#27272a",
    textPrimary: "#f4f4f5",
    textSecondary: "#a1a1aa",
    textMuted: "#71717a",
    // Status semantic tokens
    status: {
      COMPLETED: "#10b981", // Emerald
      RUNNING: "#3b82f6", // Blue
      PENDING: "#71717a", // Zinc
      FAILED: "#ef4444", // Red
      BLOCKED: "#f97316", // Orange
      RECOVERED: "#14b8a6", // Teal
      UNKNOWN: "#a1a1aa", // Gray
    },
    // Truth level tokens (paired with accessible patterns & badges)
    truth: {
      PHYSICAL: "#a855f7", // Purple (physical bytes & filesystem)
      VERIFIED: "#10b981", // Emerald (independently proven)
      OBSERVED: "#06b6d4", // Cyan (observed telemetry)
      ASSERTED: "#f59e0b", // Amber (system claim)
      INFERRED: "#eab308", // Yellow (deduced)
      UNKNOWN: "#71717a", // Zinc (uncertain)
      RECONSTRUCTED: "#6366f1", // Indigo (reconstructed history)
    },
    emphasis: {
      CRITICAL: "#ef4444",
      PRIMARY: "#3b82f6",
      MUTED: "#52525b",
    },
  },
  lineStyles: {
    PHYSICAL: "solid" as EdgeLineStyle,
    VERIFIED: "solid" as EdgeLineStyle,
    OBSERVED: "solid" as EdgeLineStyle,
    ASSERTED: "dashed" as EdgeLineStyle,
    INFERRED: "dashed" as EdgeLineStyle,
    UNKNOWN: "dotted" as EdgeLineStyle,
    RECONSTRUCTED: "dashed" as EdgeLineStyle,
  },
  badges: {
    PHYSICAL: "⬡ PHYS",
    VERIFIED: "✓ VERIFIED",
    OBSERVED: "👁 OBSERVED",
    ASSERTED: "▲ ASSERTED",
    INFERRED: "≈ INFERRED",
    UNKNOWN: "? UNKNOWN",
    RECONSTRUCTED: "↺ RECON",
  },
} as const;
