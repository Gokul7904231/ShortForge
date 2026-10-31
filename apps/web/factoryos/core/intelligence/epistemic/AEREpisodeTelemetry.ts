import * as fs from "node:fs";
import { open } from "node:fs/promises";
import * as path from "node:path";

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

export interface AEREpisodeTelemetryHealth {
  readonly appendCount: number;
  readonly failureCount: number;
  readonly lastFailureCode: string | null;
}

export interface AEREpisodeTelemetrySink {
  append(event: AEREpisodeTelemetryEvent): void | Promise<void>;
  health?(): AEREpisodeTelemetryHealth;
}

/**
 * Local append-only shadow telemetry adapter.
 *
 * Each event is written with restrictive file permissions and fdatasync.
 * This provides a crash-durable local log, not distributed/replicated storage.
 * It deliberately contains metadata only; prompts and raw model content are
 * not persisted. Write failures are visible through health() but do not affect
 * runtime authority or routing.
 */
export class JsonlAEREpisodeTelemetrySink implements AEREpisodeTelemetrySink {
  private readonly filePath: string;
  private appendCount = 0;
  private failureCount = 0;
  private lastFailureCode: string | null = null;
  private writeTail: Promise<void> = Promise.resolve();

  public constructor(filePath?: string) {
    this.filePath =
      filePath ??
      path.join(
        process.cwd(),
        "data",
        "factoryos_state",
        "aer",
        "episodes.jsonl",
      );
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
  }

  public append(event: AEREpisodeTelemetryEvent): Promise<void> {
    const operation = this.writeTail.then(async () => {
      let handle: Awaited<ReturnType<typeof open>> | null = null;
      try {
        handle = await open(this.filePath, "a", 0o600);
        await handle.chmod(0o600);
        await handle.writeFile(JSON.stringify(event) + "\n", "utf8");
        await handle.datasync();
        this.appendCount += 1;
        this.lastFailureCode = null;
      } catch (error) {
        this.failureCount += 1;
        this.lastFailureCode =
          error instanceof Error ? error.name : "UNKNOWN_WRITE_FAILURE";
      } finally {
        if (handle) {
          try {
            await handle.close();
          } catch {
            this.failureCount += 1;
            this.lastFailureCode = "FILE_CLOSE_FAILURE";
          }
        }
      }
    });
    this.writeTail = operation.catch(() => undefined);
    return operation;
  }

  public health(): AEREpisodeTelemetryHealth {
    return {
      appendCount: this.appendCount,
      failureCount: this.failureCount,
      lastFailureCode: this.lastFailureCode,
    };
  }
}
