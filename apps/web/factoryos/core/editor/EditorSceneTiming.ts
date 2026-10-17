/**
 * Allocates a physically measured timeline duration across stable ordered scene
 * rows using their declared durations as weights. Allocation is integer-ms,
 * strictly positive per scene, and the final end time equals the measured
 * duration exactly after rounding.
 */
export interface EditorSceneTiming {
  readonly startMs: number;
  readonly endMs: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

function positiveDuration(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function sceneDurationWeight(scene: Record<string, unknown>): number {
  const durationIntent = scene.durationIntent && typeof scene.durationIntent === "object"
    ? scene.durationIntent as Record<string, unknown>
    : undefined;
  return positiveDuration(scene.target_duration_seconds) ??
    positiveDuration(scene.durationSeconds) ??
    positiveDuration(durationIntent?.target) ??
    positiveDuration(scene.targetDurationSeconds) ??
    1;
}

export function buildEditorSceneTimings(
  scenes: readonly Record<string, unknown>[],
  measuredDurationSeconds: number,
): EditorSceneTiming[] {
  if (!scenes.length) return [];
  if (!Number.isFinite(measuredDurationSeconds) || measuredDurationSeconds <= 0) {
    throw new Error("EDITOR_SCENE_TIMING_DURATION_INVALID");
  }
  const totalMs = Math.round(measuredDurationSeconds * 1000);
  if (totalMs < scenes.length) {
    throw new Error("EDITOR_SCENE_TIMING_DURATION_TOO_SHORT");
  }

  // Give each non-empty scene one millisecond first, then distribute the
  // remaining measured milliseconds by target duration using largest remainders.
  const allocatableMs = totalMs - scenes.length;
  const weights = scenes.map(sceneDurationWeight);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(weightSum) || weightSum <= 0) {
    throw new Error("EDITOR_SCENE_TIMING_WEIGHTS_INVALID");
  }

  const exact = weights.map((weight) => (allocatableMs * weight) / weightSum);
  const additional = exact.map((value) => Math.floor(value));
  let remainder = allocatableMs - additional.reduce((sum, value) => sum + value, 0);
  const remainderOrder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i++) additional[remainderOrder[i]!.index]!++;

  let startMs = 0;
  return scenes.map((_scene, index) => {
    const durationMs = additional[index]! + 1;
    const timing = {
      startMs,
      endMs: startMs + durationMs,
      startSeconds: startMs / 1000,
      durationSeconds: durationMs / 1000,
    };
    startMs += durationMs;
    return timing;
  });
}
