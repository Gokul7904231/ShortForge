export type AERTriggerType =
  | "STATE_CHANGE"
  | "CONTRADICTION"
  | "UNEXPECTED_LATENCY"
  | "PROVIDER_ANOMALY"
  | "NEW_EVIDENCE"
  | "STALE_EVIDENCE"
  | "REPEATED_FAILURE"
  | "NOVEL_TASK"
  | "REPAIR_EXHAUSTION"
  | "HIGH_IMPACT_DECISION";

export interface AERTriggerEvent {
  readonly triggerType: AERTriggerType;
  readonly severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly material?: boolean;
  readonly repeatedCount?: number;
  readonly stateFingerprint?: string;
  readonly lastTriggerFingerprint?: string;
}

export interface AERTriggerDecision {
  readonly shouldTrigger: boolean;
  readonly reason: string;
  readonly triggerType: AERTriggerType;
}

export class EpistemicTrigger {
  public evaluate(event: AERTriggerEvent): AERTriggerDecision {
    if (
      event.stateFingerprint &&
      event.stateFingerprint === event.lastTriggerFingerprint &&
      (event.repeatedCount ?? 0) > 0
    ) {
      return {
        shouldTrigger: false,
        reason: "Duplicate epistemic state suppressed.",
        triggerType: event.triggerType,
      };
    }

    if (event.triggerType === "HIGH_IMPACT_DECISION") {
      return {
        shouldTrigger: true,
        reason: "High-impact decision requires explicit epistemic assessment.",
        triggerType: event.triggerType,
      };
    }

    if (
      event.triggerType === "CONTRADICTION" ||
      event.triggerType === "STALE_EVIDENCE" ||
      event.triggerType === "REPAIR_EXHAUSTION"
    ) {
      return {
        shouldTrigger: true,
        reason: "Material evidence uncertainty requires reassessment.",
        triggerType: event.triggerType,
      };
    }

    if (event.material === true || (event.repeatedCount ?? 0) >= 2) {
      return {
        shouldTrigger: true,
        reason: "Material or repeated production signal requires epistemic assessment.",
        triggerType: event.triggerType,
      };
    }

    return {
      shouldTrigger: false,
      reason: "Signal is not material enough to justify cognition.",
      triggerType: event.triggerType,
    };
  }
}
