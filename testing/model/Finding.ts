export type FindingSeverity = "info" | "warning" | "error" | "critical";

export interface SupportedRepairAction {
  readonly actionId: string;
  readonly description: string;
  readonly targetSubsystem: string;
  readonly parameters?: Record<string, unknown>;
  readonly riskLevel: "LOW" | "MEDIUM" | "HIGH";
}

export interface Finding {
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
}
