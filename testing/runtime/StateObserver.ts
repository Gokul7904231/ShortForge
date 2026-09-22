import type { WorldStateEngine } from "../../apps/web/factoryos/core/worldstate/WorldStateEngine";

export interface StateObservationSnapshot {
  readonly timestamp: string;
  readonly factoryStatus: string;
  readonly floorStatuses: Record<string, string>;
  readonly activeRunsCount: number;
}

export class StateObserver {
  public static captureSnapshot(worldState: WorldStateEngine): StateObservationSnapshot {
    const state = worldState.getState();
    const floorStatuses: Record<string, string> = {};

    for (const [id, f] of Object.entries(state.floors || {})) {
      floorStatuses[id] = f.status;
    }

    return {
      timestamp: new Date().toISOString(),
      factoryStatus: state.factoryStatus,
      floorStatuses,
      activeRunsCount: state.activeRuns?.length || 0,
    };
  }
}
