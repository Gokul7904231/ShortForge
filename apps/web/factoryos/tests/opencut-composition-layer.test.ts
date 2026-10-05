import { describe, expect, it } from "vitest";
import {
  canonicalizeComposition,
  FRAME_RATE_2997,
  MEDIA_TIMEBASE,
  millisecondsToMediaTime,
  validateCompositionIR,
  type CompositionIR,
} from "../core/timeline/CompositionIR";
import {
  moveClip,
  rippleDelete,
  splitClip,
} from "../core/timeline/TimelineTransforms";
import {
  OpenCutAdapter,
} from "../core/render/OpenCutAdapter";
import { isCapabilitySupported } from "../core/render/RendererCapabilityContracts";

function fixture(): CompositionIR {
  const duration = millisecondsToMediaTime(10_000);

  return {
    compositionId: "comp_test_001",
    schemaVersion: "2.0.0",
    canvas: {
      width: 1080,
      height: 1920,
      frameRate: FRAME_RATE_2997,
      duration,
    },
    tracks: [
      {
        id: "video-main",
        kind: "VIDEO",
        zIndex: 0,
        clips: [
          {
            id: "clip-a",
            kind: "IMAGE",
            assetId: "asset-a",
            src: "cas://asset-a",
            start: 0,
            duration: millisecondsToMediaTime(4_000),
            zIndex: 0,
            effects: [
              {
                effectId: "fx-blur",
                kind: "BLUR",
                scope: "CLIP",
                params: { intensity: 0.4 },
              },
            ],
            masks: [
              {
                maskId: "mask-1",
                kind: "ELLIPSE",
                x: 0.5,
                y: 0.5,
                width: 0.8,
                height: 0.8,
                rotationDeg: 0,
                feather: 0.1,
              },
            ],
          },
          {
            id: "clip-b",
            kind: "VIDEO",
            assetId: "asset-b",
            src: "cas://asset-b",
            start: millisecondsToMediaTime(4_000),
            duration: millisecondsToMediaTime(6_000),
            zIndex: 0,
          },
        ],
      },
    ],
    audio: [
      {
        id: "voice-1",
        kind: "VOICE",
        src: "cas://voice",
        start: 0,
        duration,
        volume: 1,
        waveform: {
          sampleRate: 48_000,
          sampleCount: 480_000,
          durationTicks: duration,
          rmsPeaks: [0.1, 0.2, 0.3],
        },
      },
    ],
    captions: [
      {
        id: "cap-1",
        text: "Hello",
        start: 0,
        end: millisecondsToMediaTime(1_000),
        words: [
          {
            word: "Hello",
            start: millisecondsToMediaTime(100),
            end: millisecondsToMediaTime(800),
          },
        ],
        style: {
          fontFamily: "Inter",
          fontSize: 72,
          primaryColor: "#FFFFFF",
          animation: "KINETIC_WORD",
        },
      },
    ],
    metadata: {
      missionId: "mission_test",
    },
  };
}

describe("OpenCut-informed CompositionIR v2", () => {
  it("uses integer ticks and exact rational frame rates", () => {
    expect(MEDIA_TIMEBASE).toBe(120_000);
    expect(millisecondsToMediaTime(1000)).toBe(120_000);
    expect(FRAME_RATE_2997).toEqual({ numerator: 30000, denominator: 1001 });
  });

  it("validates rich composition semantics", () => {
    const report = validateCompositionIR(fixture());
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it("provides deterministic canonical serialization", () => {
    const a = canonicalizeComposition(fixture());
    const b = canonicalizeComposition({
      ...fixture(),
      metadata: { missionId: "mission_test" },
    });
    expect(a).toBe(b);
    expect(a).not.toContain("function");
  });

  it("supports split, move and ripple editing as pure operations", () => {
    const original = fixture();
    const split = splitClip(
      original,
      "video-main",
      "clip-b",
      millisecondsToMediaTime(7_000),
    );
    expect(split.tracks[0].clips.map((clip) => clip.id)).toEqual([
      "clip-a",
      "clip-b:a",
      "clip-b:b",
    ]);

    const moved = moveClip(split, "video-main", "clip-b:b", millisecondsToMediaTime(8_000));
    expect(moved.tracks[0].clips[2].start).toBe(millisecondsToMediaTime(8_000));

    const rippled = rippleDelete(
      original,
      "video-main",
      millisecondsToMediaTime(4_000),
      millisecondsToMediaTime(5_000),
    );
    expect(rippled.tracks[0].clips[1].start).toBe(millisecondsToMediaTime(3_000));
  });

  it("keeps OpenCut behind an explicit experimental admission boundary", () => {
    expect(OpenCutAdapter.admission().productionEligible).toBe(false);
    expect(OpenCutAdapter.capability().status).toBe("EXPERIMENTAL");
    expect(isCapabilitySupported(OpenCutAdapter.capability(), "keyframes")).toBe(true);
    expect(OpenCutAdapter.capability().mcpServer).toBe(false);
    expect(OpenCutAdapter.capability().headlessExecution).toBe(false);

    const document = OpenCutAdapter.toDocument(fixture());
    expect(document.sourceOfTruth).toBe("SHORTFORGE_COMPOSITION_IR");
    expect(document.mapping.editorApi).toBe("ROADMAP");
  });
});
