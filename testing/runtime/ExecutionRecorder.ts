import type { MissionEvent } from "../contracts/execution.contract";
import { EventNormalizer } from "./EventNormalizer";

export class ExecutionRecorder {
  private events: MissionEvent[] = [];
  private missionId: string;
  private runId: string;

  constructor(missionId: string, runId: string) {
    this.missionId = missionId;
    this.runId = runId;
  }

  public recordRaw(topic: string, payload: Record<string, unknown>): MissionEvent {
    const normalized = EventNormalizer.normalize(topic, payload, {
      missionId: this.missionId,
      runId: this.runId,
      truthLevel: "OBSERVED",
    });
    this.events.push(normalized);
    return normalized;
  }

  public recordEvent(event: MissionEvent): void {
    this.events.push(event);
  }

  public getEvents(): MissionEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events = [];
  }
}
