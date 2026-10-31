/**
 * Project Ascalon — Replay admission placeholder.
 *
 * The previous implementation echoed the recorded action as the replayed
 * action without reconstructing state or executing an isolated transition.
 * That is not replay evidence. Until a real replay adapter is injected,
 * this helper fails closed and reports NOT_EXECUTED.
 */
export interface ReplayResult {
  readonly trajectoryId: string;
  readonly replayExecuted: boolean;
  readonly replayEquivalent: boolean;
  readonly originalDecision: string;
  readonly replayedDecision: string;
  readonly divergenceReason?: string;
  readonly replayedAt: string;
}

export class AscalonReplayEngine {
  public static replayTrajectory(trajectory: Record<string, any>): ReplayResult {
    const originalDecision =
      trajectory.decision?.selectedAction?.actionType ||
      trajectory.decision?.selectedAction?.capabilityId ||
      "UNKNOWN";

    return {
      trajectoryId: trajectory.trajectoryId ?? "UNKNOWN",
      replayExecuted: false,
      replayEquivalent: false,
      originalDecision,
      replayedDecision: "NOT_EXECUTED",
      divergenceReason:
        "NO_INDEPENDENT_REPLAY_ADAPTER: recorded actions were not re-executed against reconstructed state.",
      replayedAt: new Date().toISOString(),
    };
  }
}
