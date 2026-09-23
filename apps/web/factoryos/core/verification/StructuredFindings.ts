/**
 * FactoryOS v3 — Structured Findings & QA Evaluation Contracts
 * Reuses and promotes the canonical Archify-inspired Finding model.
 * Bridges Floor 07 QA Gate -> Finding -> Evidence -> Receipt -> Overseer -> Healer Bounded Repair.
 */

export type FindingSeverity = "info" | "warning" | "error" | "critical";

export interface SupportedRepairAction {
  readonly actionId: string;
  readonly description: string;
  readonly targetFloor: string; // e.g. "floor05_timeline_composition", "floor04_media_synthesis"
  readonly parameters?: Record<string, unknown>;
  readonly riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

export interface StructuredFinding {
  readonly id: string;
  readonly rule: string;
  readonly severity: FindingSeverity;
  readonly subject: string;
  readonly evidence: string[];
  readonly expected: string;
  readonly observed: string;
  readonly rootCause?: string;
  readonly confidence: number;
  readonly supportedRepairs: SupportedRepairAction[];
  readonly floorId: "floor07_compliance";
  readonly detectedAt: string;
}

export interface F07QAResult {
  readonly evaluationId: string;
  readonly missionId: string;
  readonly passed: boolean;
  readonly score: number; // 0.0 to 1.0
  readonly findings: StructuredFinding[];
  readonly blockingCount: number;
  readonly evaluatedAt: string;
  readonly verificationReceiptId?: string;
}
