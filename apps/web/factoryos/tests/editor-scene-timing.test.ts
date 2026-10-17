import { describe, expect, it } from "vitest";
import { buildEditorSceneTimings } from "../core/editor/EditorSceneTiming";

describe("editor scene timing allocation", () => {
  it("distributes measured duration by scene target weights and ends at the physical duration", () => {
    const timings = buildEditorSceneTimings(
      [
        { sceneId: "hook", target_duration_seconds: 2 },
        { sceneId: "fact-1", target_duration_seconds: 5 },
        { sceneId: "outro", target_duration_seconds: 3 },
      ],
      19.237,
    );

    expect(timings).toHaveLength(3);
    expect(timings[0]?.startMs).toBe(0);
    expect(timings[0]?.endMs).toBe(timings[1]?.startMs);
    expect(timings[1]?.endMs).toBe(timings[2]?.startMs);
    expect(timings[2]?.endMs).toBe(19_237);
    expect(timings.reduce((sum, timing) => sum + timing.durationSeconds, 0)).toBeCloseTo(19.237, 9);
    expect(timings[1]!.durationSeconds).toBeGreaterThan(timings[0]!.durationSeconds);
    expect(timings[2]!.durationSeconds).toBeGreaterThan(timings[0]!.durationSeconds);
  });

  it("prefers target duration metadata to a stale duration estimate", () => {
    const timings = buildEditorSceneTimings(
      [
        { sceneId: "a", durationSeconds: 99, target_duration_seconds: 1 },
        { sceneId: "b", durationSeconds: 1, target_duration_seconds: 3 },
      ],
      8,
    );
    expect(timings[1]!.durationSeconds).toBeGreaterThan(timings[0]!.durationSeconds);
    expect(timings[timings.length - 1]!.endMs).toBe(8_000);
  });

  it("keeps every scene non-empty when total duration is at least one millisecond per scene", () => {
    const timings = buildEditorSceneTimings(
      [{ sceneId: "a", durationSeconds: 1 }, { sceneId: "b", durationSeconds: 1 }, { sceneId: "c", durationSeconds: 1 }],
      0.003,
    );
    expect(timings.map((timing) => timing.durationSeconds)).toEqual([0.001, 0.001, 0.001]);
    expect(timings[timings.length - 1]!.endMs).toBe(3);
  });

  it("fails closed when measured duration cannot fit positive scene intervals", () => {
    expect(() => buildEditorSceneTimings(
      [{ sceneId: "a" }, { sceneId: "b" }],
      0.001,
    )).toThrow("EDITOR_SCENE_TIMING_DURATION_TOO_SHORT");
    expect(() => buildEditorSceneTimings([{ sceneId: "a" }], 0)).toThrow("EDITOR_SCENE_TIMING_DURATION_INVALID");
  });
});
