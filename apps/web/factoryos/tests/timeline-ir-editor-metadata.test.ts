import { describe, expect, it } from "vitest";

import {
  millisecondsToMediaTime,
  validateCompositionIR,
} from "../core/timeline/CompositionIR";
import {
  type TimelineIR,
  upgradeTimelineIR,
} from "../core/timeline/TimelineIR";

const timeline: TimelineIR = {
  timelineId: "editor-rich-timeline",
  schemaVersion: "1.0.0",
  missionId: "editor-source-handoff",
  compositionType: "QUIZ_SHORTS",
  canvas: {
    width: 1080,
    height: 1920,
    fps: 30,
    aspectRatio: "9:16",
  },
  totalDurationMs: 2000,
  visualTracks: [
    {
      clipId: "clip-question",
      sceneId: "question-scene",
      assetId: "question-visual-v2",
      sourceAssetVersion: "2",
      assetType: "IMAGE",
      src: "cas://" + "a".repeat(64),
      timelineStartMs: 0,
      durationMs: 1200,
      trimStartMs: 100,
      trimEndMs: 900,
      zIndex: 0,
    },
    {
      clipId: "clip-answer",
      sceneId: "answer-scene",
      assetId: "answer-visual-v1",
      sourceAssetVersion: "1",
      assetType: "IMAGE",
      src: "cas://" + "b".repeat(64),
      timelineStartMs: 1000,
      durationMs: 1000,
      zIndex: 0,
    },
  ],
  audioTracks: [
    {
      audioId: "voice",
      sceneId: "question-scene",
      sourceAssetVersion: "voice-v3",
      trackType: "VOICE",
      src: "cas://" + "c".repeat(64),
      timelineStartMs: 0,
      durationMs: 2000,
      sourceInMs: 50,
      sourceDurationMs: 1950,
      volume: 1,
    },
  ],
  subtitleTracks: [
    {
      subtitleId: "caption-question",
      sceneId: "question-scene",
      text: "Which city is the capital of Tamil Nadu?",
      startMs: 0,
      endMs: 1200,
      position: "bottom_center",
      fontStyle: "sans_serif_bold",
      style: {
        fontFamily: "sans_serif_bold",
        fontSize: 48,
        primaryColor: "#FFFFFF",
        animation: "NONE",
      },
    },
  ],
  transitions: [
    {
      transitionId: "transition-question-answer",
      fromSceneId: "question-scene",
      toSceneId: "answer-scene",
      transitionType: "CROSSFADE",
      durationMs: 200,
    },
  ],
  provenanceDigest: "test-fingerprint",
};

describe("TimelineIR editor metadata upgrade", () => {
  it("preserves quiz type, scene identity, source trims, caption metadata and transitions", () => {
    const composition = upgradeTimelineIR(timeline);
    const clips = composition.tracks[0]!.clips;
    const question = clips.find((clip) => clip.id === "clip-question")!;
    const answer = clips.find((clip) => clip.id === "clip-answer")!;
    const voice = composition.audio[0]!;
    const caption = composition.captions[0]!;

    expect(composition.metadata.extensions?.compositionType).toBe("QUIZ_SHORTS");
    expect(question.metadata?.sceneId).toBe("question-scene");
    expect(question.metadata?.sourceAssetVersion).toBe("2");
    expect(question.sourceIn).toBe(millisecondsToMediaTime(100));
    expect(question.sourceDuration).toBe(millisecondsToMediaTime(800));
    expect(question.transitionOut?.transitionId).toBe("transition-question-answer");
    expect(answer.transitionIn?.transitionId).toBe("transition-question-answer");
    expect(voice.sourceIn).toBe(millisecondsToMediaTime(50));
    expect(voice.sourceDuration).toBe(millisecondsToMediaTime(1950));
    expect(voice.metadata?.sceneId).toBe("question-scene");
    expect(caption.position).toBe("bottom_center");
    expect(caption.metadata?.sceneId).toBe("question-scene");
    expect(caption.metadata?.fontStyle).toBe("sans_serif_bold");
    expect(validateCompositionIR(composition).valid).toBe(true);
  });

  it("does not create render transition nodes for cuts", () => {
    const cutTimeline: TimelineIR = {
      ...timeline,
      transitions: [
        {
          transitionId: "hard-cut",
          fromSceneId: "question-scene",
          toSceneId: "answer-scene",
          transitionType: "CUT",
          durationMs: 0,
        },
      ],
    };
    const composition = upgradeTimelineIR(cutTimeline);
    expect(composition.tracks[0]!.clips[0]!.transitionOut).toBeUndefined();
    expect(composition.tracks[0]!.clips[1]!.transitionIn).toBeUndefined();
  });
});
