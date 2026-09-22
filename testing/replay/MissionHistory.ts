import type { MissionRun } from "../model/MissionRun";
import { MissionSnapshotBuilder, type MissionSnapshot } from "./MissionSnapshot";

export class MissionHistory {
  private runs: Map<string, MissionRun> = new Map();
  private snapshots: Map<string, MissionSnapshot> = new Map();

  public recordRun(run: MissionRun): MissionSnapshot {
    this.runs.set(run.runId, run);
    const snapshot = MissionSnapshotBuilder.create(
      run.missionId,
      run.runId,
      run.finalVerdict,
      run.events,
      run.artifacts
    );
    this.snapshots.set(run.runId, snapshot);
    return snapshot;
  }

  public getRun(runId: string): MissionRun | undefined {
    return this.runs.get(runId);
  }

  public getSnapshot(runId: string): MissionSnapshot | undefined {
    return this.snapshots.get(runId);
  }
}
