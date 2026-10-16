import { describe, expect, it } from "vitest";
import {
  mergeEditorSceneSources,
  replaceVerifiedEditorSceneSources,
} from "../core/editor/EditorSceneSourceBridge";

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

  it("replaces media only on the exact unique scene ID with complete retrieved provenance", () => {
    const provenance = {
      sha256: "c".repeat(64),
      mimeType: "image/jpeg",
      sourceAssetId: "retrieved-asset-42",
      provider: "wikimedia",
      license: "CC-BY-4.0",
      author: "Verified Artist",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:verified.jpg",
      attributionRequired: true,
      provenanceKind: "RETRIEVED",
    };
    const canonical = [
      { sceneId: "scene-a", text: "Keep A", imageUrl: "/api/images/placeholder-a.jpg" },
      { sceneId: "scene-b", text: "Replace B", assetId: "logical-b", durationSeconds: 6 },
    ];
    const updated = replaceVerifiedEditorSceneSources(canonical, [
      {
        sceneId: "scene-b",
        imageUrl: "/data/editor-source-assets/verified.jpg",
        mediaType: "IMAGE",
        sourceProvenance: provenance,
      },
    ]);

    expect(updated[0]).toEqual(canonical[0]);
    expect(updated[1]).toMatchObject({
      sceneId: "scene-b",
      text: "Replace B",
      assetId: "logical-b",
      durationSeconds: 6,
      imageUrl: "/data/editor-source-assets/verified.jpg",
      mediaType: "IMAGE",
      sourceProvenance: provenance,
    });
  });

  it("does not overwrite ambiguous scene IDs or accept incomplete rights metadata", () => {
    const canonical = [
      { sceneId: "duplicate", text: "A", imageUrl: "/api/images/a.jpg" },
      { sceneId: "duplicate", text: "B", imageUrl: "/api/images/b.jpg" },
      { sceneId: "scene-c", text: "C", imageUrl: "/api/images/c.jpg" },
    ];
    const replacement = {
      sceneId: "duplicate",
      imageUrl: "/data/should-not-be-used.jpg",
      mediaType: "IMAGE",
      sourceProvenance: {
        sha256: "d".repeat(64),
        mimeType: "image/jpeg",
        sourceAssetId: "asset",
        provider: "wikimedia",
        license: "CC-BY-4.0",
        author: "Artist",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:ambiguous.jpg",
        attributionRequired: true,
        provenanceKind: "RETRIEVED",
      },
    };
    const incomplete = {
      sceneId: "scene-c",
      imageUrl: "/data/incomplete.jpg",
      mediaType: "IMAGE",
      sourceProvenance: { sha256: "e".repeat(64), provenanceKind: "RETRIEVED" },
    };

    const updated = replaceVerifiedEditorSceneSources(canonical, [replacement, incomplete]);
    expect(updated).toEqual(canonical);
  });

  it("rejects non-HTTPS and root-only source URLs from verified source overlays", () => {
    const canonical = [{ sceneId: "scene-a", text: "A" }];
    const updated = replaceVerifiedEditorSceneSources(canonical, [{
      sceneId: "scene-a",
      imageUrl: "/data/unverified.jpg",
      mediaType: "IMAGE",
      sourceProvenance: {
        sha256: "f".repeat(64),
        mimeType: "image/jpeg",
        sourceAssetId: "asset",
        provider: "wikimedia",
        license: "CC-BY-4.0",
        author: "Artist",
        sourceUrl: "https://commons.wikimedia.org/",
        attributionRequired: true,
        provenanceKind: "RETRIEVED",
      },
    }]);
    expect(updated).toEqual(canonical);
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
