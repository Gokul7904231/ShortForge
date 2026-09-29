export type AEREpisodeEventName =
  | "aer.assessment"
  | "aer.decision"
  | "aer.probe"
  | "aer.model"
  | "aer.outcome"
  | "aer.calibration"
  | "aer.policy_shadow";

export interface AEREpisodeTelemetryEvent {
  readonly eventId: string;
  readonly episodeId: string;
  readonly eventName: AEREpisodeEventName;
  readonly timestamp: string;
  readonly policyVersion: string;
  readonly attributes: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Stable telemetry vocabulary aligned with the current OpenTelemetry GenAI
 * model/tool observability shape without coupling AER to an exporter.
 */
export interface AEREpisodeTelemetrySink {
  append(event: AEREpisodeTelemetryEvent): void | Promise<void>;
}
