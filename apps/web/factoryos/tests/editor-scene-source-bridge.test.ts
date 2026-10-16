import { describe, expect, it } from "vitest";
import { mergeEditorSceneSources } from "../core/editor/EditorSceneSourceBridge";

describe("editor scene source bridge", () => {
  it("preserves source media by stable scene ID while keeping canonical scene order and semantics", () => {
    const planned = [
      { sceneId: "scene-2", assetId: "f03-asset-2", text: "Canonical question 2", durationSeconds: 7 },
      { sceneId: "scene-1", assetId: "f03-asset-1", text: "Canonical question 1", durationSeconds: 5 },
    ];
    const existing = [
      { sceneId: "scene-1", imageUrl: "cas://" + "a".repeat(64), mediaType: "IMAGE", text: "stale text" },
      { sceneId: "scene-2", imageUrl: "file:///tmp/scene-2.mp4", mediaType: "VIDEO" },
    ];

    const merged = mergeEditorSceneSources(planned, existing);

    expect(merged).toEqual([
      {
        sceneId: "scene-2",
        assetId: "f03-asset-2",
        text: "Canonical question 2",
        durationSeconds: 7,
        imageUrl: "file:///tmp/scene-2.mp4",
        mediaType: "VIDEO",
      },
      {
        sceneId: "scene-1",
        assetId: "f03-asset-1",
        text: "Canonical question 1",
        durationSeconds: 5,
        imageUrl: "cas://" + "a".repeat(64),
        mediaType: "IMAGE",
      },
    ]);
  });

  it("does not infer sources from neighboring rows, prompts, or logical asset IDs", () => {
    const merged = mergeEditorSceneSources(
      [{ sceneId: "wanted-scene", assetId: "logical-asset-1", imagePrompt: "a cat" }],
      [{ sceneId: "different-scene", imageUrl: "https://cdn.example.test/other.jpg", mediaType: "IMAGE" }],
    );

    expect(merged[0]).toEqual({
      sceneId: "wanted-scene",
      assetId: "logical-asset-1",
      imagePrompt: "a cat",
    });
  });

  it("fails closed when the existing source rows have duplicate scene IDs", () => {
    const merged = mergeEditorSceneSources(
      [{ sceneId: "scene-1", assetId: "logical-asset-1" }],
      [
        { sceneId: "scene-1", imageUrl: "https://cdn.example.test/first.jpg", mediaType: "IMAGE" },
        { sceneId: "scene-1", imageUrl: "https://cdn.example.test/second.jpg", mediaType: "IMAGE" },
      ],
    );

    expect(merged).toEqual([{ sceneId: "scene-1", assetId: "logical-asset-1" }]);
  });

  it("preserves rights and digest provenance for the exact stable scene ID", () => {
    const provenance = {
      sha256: "a".repeat(64),
      mimeType: "image/jpeg",
      sourceAssetId: "commons-asset-123",
      provider: "wikimedia",
      license: "CC-BY-4.0",
      author: "Artist",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:sample.jpg",
      attributionRequired: true,
      provenanceKind: "RETRIEVED",
    };
    const merged = mergeEditorSceneSources(
      [
        { sceneId: "scene-a", assetId: "logical-a", text: "A" },
        { sceneId: "scene-b", assetId: "logical-b", text: "B" },
      ],
      [
        { sceneId: "scene-b", imageUrl: "/data/scene-b.jpg", mediaType: "IMAGE", sourceProvenance: provenance },
      ],
    );

    expect(merged[0]).toEqual({ sceneId: "scene-a", assetId: "logical-a", text: "A" });
    expect(merged[1]).toMatchObject({
      sceneId: "scene-b",
      assetId: "logical-b",
      imageUrl: "/data/scene-b.jpg",
      mediaType: "IMAGE",
      sourceProvenance: provenance,
    });
  });

  it("prefers an explicitly supplied source on the canonical row", () => {
    const merged = mergeEditorSceneSources(
      [{ sceneId: "scene-1", imageUrl: "cas://" + "b".repeat(64), mediaType: "VIDEO" }],
      [{ sceneId: "scene-1", imageUrl: "https://cdn.example.test/old.png", mediaType: "IMAGE" }],
    );

    expect(merged[0]?.imageUrl).toBe("cas://" + "b".repeat(64));
    expect(merged[0]?.mediaType).toBe("VIDEO");
  });
});
