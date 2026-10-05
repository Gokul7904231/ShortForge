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
  retimeClip,
  splitClip,
} from "../core/timeline/TimelineTransforms";
import { OpenCutAdapter } from "../core/render/OpenCutAdapter";
import {
  isCapabilitySupported,
  validateRendererCapabilityContract,
} from "../core/render/RendererCapabilityContracts";

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

function rippleFixture(): CompositionIR {
  const base = fixture();
  return {
    ...base,
    audio: [
      {
        ...base.audio[0],
        id: "voice-before",
        start: 0,
        duration: millisecondsToMediaTime(2_000),
        waveform: undefined,
      },
      {
        ...base.audio[0],
        id: "voice-after",
        start: millisecondsToMediaTime(3_000),
        duration: millisecondsToMediaTime(7_000),
        waveform: undefined,
      },
    ],
    captions: [
      {
        ...base.captions[0],
        id: "cap-after",
        start: millisecondsToMediaTime(3_000),
        end: millisecondsToMediaTime(4_000),
        words: [{
          word: "after",
          start: millisecondsToMediaTime(3_100),
          end: millisecondsToMediaTime(3_800),
        }],
      },
    ],
    tracks: [{
      ...base.tracks[0],
      clips: [{
        ...base.tracks[0].clips[0],
        duration: millisecondsToMediaTime(2_000),
      }, {
        ...base.tracks[0].clips[1],
        start: millisecondsToMediaTime(3_000),
        duration: millisecondsToMediaTime(7_000),
      }],
    }],
  };
}

describe("OpenCut-informed CompositionIR v2", () => {
  it("uses integer ticks and exact rational frame rates", () => {
    expect(MEDIA_TIMEBASE).toBe(120_000);
    expect(millisecondsToMediaTime(1000)).toBe(120_000);
    expect(FRAME_RATE_2997).toEqual({ numerator: 30000, denominator: 1001 });
  });

  it("validates rich composition semantics and rejects duplicate identities", () => {
    const report = validateCompositionIR(fixture());
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);

    const duplicate = {
      ...fixture(),
      tracks: [fixture().tracks[0], fixture().tracks[0]],
    };
    const invalid = validateCompositionIR(duplicate);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.some((error) => error.includes("Duplicate composition track id"))).toBe(true);
  });

  it("provides deterministic serialization and a stable cryptographic payload", () => {
    const a = canonicalizeComposition(fixture());
    const b = canonicalizeComposition({
      ...fixture(),
      metadata: { missionId: "mission_test" },
    });
    expect(a).toBe(b);
    expect(a).not.toContain("function");
  });

  it("moves nested animation state with the clip", () => {
    const original = fixture();
    const animated: CompositionIR = {
      ...original,
      tracks: [{
        ...original.tracks[0],
        clips: [{
          ...original.tracks[0].clips[0],
          animations: [{
            property: "x",
            keyframes: [
              { time: millisecondsToMediaTime(1_000), value: 0 },
              { time: millisecondsToMediaTime(2_000), value: 10 },
            ],
          }],
        }, original.tracks[0].clips[1]],
      }],
    };

    const moved = moveClip(
      animated,
      "video-main",
      "clip-a",
      millisecondsToMediaTime(1_000),
    );

    expect(moved.tracks[0].clips[0].animations?.[0].keyframes.map((frame) => frame.time)).toEqual([
      millisecondsToMediaTime(2_000),
      millisecondsToMediaTime(3_000),
    ]);
  });

  it("partitions keyframe state and source timing on split", () => {
    const animated = fixture();
    const source = {
      ...animated.tracks[0].clips[1],
      animations: [{
        property: "opacity" as const,
        keyframes: [
          { time: millisecondsToMediaTime(5_000), value: 1 },
          { time: millisecondsToMediaTime(7_000), value: 0.5 },
          { time: millisecondsToMediaTime(9_000), value: 0 },
        ],
      }],
    };

    const split = splitClip({
      ...animated,
      tracks: [{ ...animated.tracks[0], clips: [animated.tracks[0].clips[0], source] }],
    }, "video-main", "clip-b", millisecondsToMediaTime(7_000));

    expect(split.tracks[0].clips[1].id).toBe("clip-b:a");
    expect(split.tracks[0].clips[2].id).toBe("clip-b:b");
    expect(split.tracks[0].clips[1].animations?.[0].keyframes.map((frame) => frame.time)).toEqual([
      millisecondsToMediaTime(5_000),
      millisecondsToMediaTime(7_000),
    ]);
    expect(split.tracks[0].clips[2].animations?.[0].keyframes.map((frame) => frame.time)).toEqual([
      millisecondsToMediaTime(7_000),
      millisecondsToMediaTime(9_000),
    ]);
  });

  it("retimes the clip without lying about source span", () => {
    const original = fixture();
    const withSource = {
      ...original,
      tracks: [{
        ...original.tracks[0],
        clips: [{
          ...original.tracks[0].clips[0],
          animations: [{
            property: "scaleX" as const,
            keyframes: [
              { time: millisecondsToMediaTime(1_000), value: 1 },
              { time: millisecondsToMediaTime(2_000), value: 2 },
            ],
          }],
          sourceDuration: millisecondsToMediaTime(4_000),
        }, original.tracks[0].clips[1]],
      }],
    };

    const retimed = retimeClip(
      withSource,
      "video-main",
      "clip-a",
      millisecondsToMediaTime(2_000),
    );
    const clip = retimed.tracks[0].clips[0];

    expect(clip.playbackRate).toBe(2);
    expect(clip.sourceDuration).toBe(millisecondsToMediaTime(4_000));
    expect(clip.animations?.[0].keyframes.map((frame) => frame.time)).toEqual([
      millisecondsToMediaTime(500),
      millisecondsToMediaTime(1_000),
    ]);
  });

  it("supports scoped ripple editing and preserves synchronized auxiliary tracks", () => {
    const local = rippleDelete(
      fixture(),
      "video-main",
      millisecondsToMediaTime(8_000),
      millisecondsToMediaTime(9_000),
      { scope: "LOCAL_TRACK" },
    );
    expect(local.canvas.duration).toBe(millisecondsToMediaTime(10_000));

    const whole = rippleDelete(
      rippleFixture(),
      "video-main",
      millisecondsToMediaTime(2_000),
      millisecondsToMediaTime(3_000),
      { scope: "WHOLE_COMPOSITION" },
    );

    expect(whole.canvas.duration).toBe(millisecondsToMediaTime(9_000));
    expect(whole.audio.find((audio) => audio.id === "voice-after")?.start)
      .toBe(millisecondsToMediaTime(2_000));
    expect(whole.captions[0].start).toBe(millisecondsToMediaTime(2_000));
    expect(whole.captions[0].words?.[0].start).toBe(millisecondsToMediaTime(2_100));
  });

  it("keeps OpenCut behind an explicit experimental admission boundary", () => {
    expect(OpenCutAdapter.admission().productionEligible).toBe(false);
    expect(OpenCutAdapter.capability().status).toBe("EXPERIMENTAL");
    expect(isCapabilitySupported(OpenCutAdapter.capability(), "keyframes")).toBe(true);
    expect(OpenCutAdapter.capability().executionModes).toEqual([]);
    expect(OpenCutAdapter.capability().integrationTargets).toEqual([
      "EDITOR",
      "WASM_PREVIEW",
      "HEADLESS",
      "MCP",
    ]);
    expect(validateRendererCapabilityContract(OpenCutAdapter.capability())).toEqual([]);
    expect(OpenCutAdapter.capability().mcpServer).toBe(false);
    expect(OpenCutAdapter.capability().headlessExecution).toBe(false);

    const document = OpenCutAdapter.toDocument(fixture());
    expect(document.sourceOfTruth).toBe("SHORTFORGE_COMPOSITION_IR");
    expect(document.mapping.editorApi).toBe("ROADMAP");
  });
});
