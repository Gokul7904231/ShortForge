import type { MissionEvent } from "../contracts/execution.contract";
import type { PhysicalArtifactRecord } from "../contracts/artifact.contract";

export interface MissionSnapshot {
  readonly snapshotId: string;
  readonly missionId: string;
  readonly runId: string;
  readonly createdAt: string;
  readonly eventCount: number;
  readonly finalStatus: string;
  readonly eventSequenceDigest: string;
  readonly artifacts: Array<{
    readonly kind: string;
    readonly sha256: string;
    readonly byteLength: number;
  }>;
}

export class MissionSnapshotBuilder {
  public static create(
    missionId: string,
    runId: string,
    status: string,
    events: MissionEvent[],
    artifacts: PhysicalArtifactRecord[]
  ): MissionSnapshot {
    const crypto = require("node:crypto");
    const eventIds = events.map((e) => `${e.action.type}:${e.actor.floor || e.subjectId}`).join("|");
    const eventSequenceDigest = crypto.createHash("sha256").update(eventIds).digest("hex");

    return {
      snapshotId: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      missionId,
      runId,
      createdAt: new Date().toISOString(),
      eventCount: events.length,
      finalStatus: status,
      eventSequenceDigest,
      artifacts: artifacts.map((a) => ({
        kind: a.kind,
        sha256: a.sha256,
        byteLength: a.byteLength,
      })),
    };
  }
}
