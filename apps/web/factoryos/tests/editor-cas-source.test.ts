import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  compileCompositionToRenderIntent,
} from "../core/editor/EditorRuntime";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import {
  millisecondsToMediaTime,
  type CompositionIR,
} from "../core/timeline/CompositionIR";

let tempRoot = "";

function makeComposition(sourceUri: string): CompositionIR {
  const duration = millisecondsToMediaTime(1_000);
  return {
    compositionId: "editor-cas-source-test",
    schemaVersion: "2.0.0",
    canvas: {
      width: 1080,
      height: 1920,
      frameRate: { numerator: 30, denominator: 1 },
      duration,
      background: { kind: "SOLID", value: "#000000" },
    },
    tracks: [{
      id: "video",
      kind: "VIDEO",
      zIndex: 0,
      clips: [{
        id: "source-clip",
        kind: "VIDEO",
        src: sourceUri,
        start: 0,
        duration,
        sourceIn: 0,
        sourceDuration: duration,
        zIndex: 0,
      }],
    }],
    audio: [{
      id: "source-audio",
      kind: "VOICE",
      src: sourceUri,
      start: 0,
      duration,
      sourceIn: 0,
      sourceDuration: duration,
      volume: 1,
      playbackRate: 1,
    }],
    captions: [],
    metadata: { missionId: "editor-cas-source-test-mission" },
  };
}

function setupCas() {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-editor-cas-"));
  const sourcePath = path.join(tempRoot, "fixture.mp4");
  fs.writeFileSync(sourcePath, Buffer.from("fixture media bytes for source hashing"));
  return {
    cas: new ContentAddressedStore(path.join(tempRoot, "cas")),
    sourcePath,
  };
}

afterEach(() => {
  if (tempRoot && fs.existsSync(tempRoot)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  tempRoot = "";
});

describe("CompositionIR CAS source resolution", () => {
  it("lowers owner-safe CAS URIs to verified local paths for the render adapter", async () => {
    const { cas, sourcePath } = setupCas();
    const artifact = await cas.putFile(sourcePath, "test-video", "video/mp4");
    const intent = compileCompositionToRenderIntent(
      makeComposition("cas://" + artifact.sha256),
      0,
      { width: 1080, height: 1920, fps: 30, format: "MP4" },
      cas,
    );

    expect(intent.tracks.visualAssets[0]?.src).toBe(artifact.uri);
    expect(intent.tracks.audioTracks[0]?.src).toBe(artifact.uri);
  });

  it("fails closed when the bytes behind a CAS digest have changed", async () => {
    const { cas, sourcePath } = setupCas();
    const artifact = await cas.putFile(sourcePath, "test-video", "video/mp4");
    const tampered = fs.readFileSync(artifact.uri);
    tampered[0] = tampered[0]! ^ 0xff;
    fs.writeFileSync(artifact.uri, tampered);

    expect(() =>
      compileCompositionToRenderIntent(
        makeComposition("cas://" + artifact.sha256),
        0,
        { width: 1080, height: 1920, fps: 30, format: "MP4" },
        cas,
      ),
    ).toThrow("EDITOR_SOURCE_CAS_DIGEST_MISMATCH");
  });
});
