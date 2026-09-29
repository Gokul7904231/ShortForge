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

import * as fs from "node:fs";
import * as path from "node:path";

export class JsonlAEREpisodeTelemetrySink implements AEREpisodeTelemetrySink {
  private readonly filePath: string;

  public constructor(filePath?: string) {
    const root =
      filePath ??
      path.join(
        process.cwd(),
        "data",
        "factoryos_state",
        "aer",
        "episodes.jsonl",
      );
    this.filePath = root;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  public append(event: AEREpisodeTelemetryEvent): void {
    // Telemetry is deliberately metadata-only: prompts, credentials and raw
    // model content are not persisted by this sink.
    try {
      fs.appendFileSync(
        this.filePath,
        JSON.stringify(event) + "\n",
        "utf8",
      );
    } catch {
      // Observability must not become an execution-authority or availability
      // dependency. The runtime can continue if the local telemetry sink fails.
    }
  }
}
