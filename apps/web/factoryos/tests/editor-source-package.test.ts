import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { buildEditorSourcePackage } from "../core/editor/EditorSourcePackage";
import { ArtifactResolver } from "../core/rendering/ArtifactResolver";
import type { RenderIntent } from "../core/contracts/RenderIntentContracts";

let root = "";

function makeTempRoot() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-editor-package-"));
  fs.mkdirSync(path.join(root, "inputs"), { recursive: true });
  return root;
}

function writeTinyWav(filePath: string) {
  const pcmBytes = 8;
  const bytes = Buffer.alloc(44 + pcmBytes);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(pcmBytes, 40);
  fs.writeFileSync(filePath, bytes);
}

function renderIntent(
  imagePath: string,
  audioPath: string,
  sceneId = "quiz-question-1",
  audioSha256?: string,
): RenderIntent {
  return {
    intentId: "intent-editor-package-test",
    jobId: "job-editor-package-test",
    missionId: "mission-editor-package-test",
    compositionType: "QUIZ_SHORTS",
    durationSeconds: 1,
    fps: 30,
    resolution: { width: 1080, height: 1920 },
    tracks: {
      visualAssets: [{
        id: sceneId,
        type: "IMAGE",
        src: imagePath,
        startSeconds: 0,
        durationSeconds: 1,
        zIndex: 1,
      }],
      audioTracks: [{
        id: "voice-question-1",
        type: "VOICE",
        src: audioPath,
        volume: 1,
        startSeconds: 0,
        durationSeconds: 1,
        ...(audioSha256 ? {
          sourceProvenance: {
            sha256: audioSha256,
            mimeType: "audio/wav",
            sourceAssetId: "voice-fixture-" + audioSha256.slice(0, 12),
            provider: "voice-fixture",
            license: "GENERATED_CONTENT",
            author: "ShortForge test fixture",
            sourceUrl: "shortforge://test/audio",
            attributionRequired: false,
            provenanceKind: "GENERATED" as const,
          },
        } : {}),
      }],
      captions: [{
        sceneId,
        text: "Which city is the capital of Tamil Nadu?",
        startMs: 0,
        endMs: 900,
        style: { fontSize: 42, fontColor: "#ffffff", animation: "POP" },
      }],
    },
    preferredCompiler: "FFMPEG",
    constraints: { strictSyncToleranceMs: 1000 },
    createdAt: "2026-10-12T00:00:00.000Z",
  };
}

afterEach(() => {
  if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  root = "";
});

describe("EditorSourcePackage", () => {
  it("binds source provenance by stable scene ID rather than scene array order", async () => {
    const base = makeTempRoot();
    const imageA = path.join(base, "inputs", "scene-a.png");
    const imageB = path.join(base, "inputs", "scene-b.png");
    const audioPath = path.join(base, "inputs", "narration.wav");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    fs.writeFileSync(imageA, png);
    fs.writeFileSync(imageB, png);
    writeTinyWav(audioPath);

    const cas = new ContentAddressedStore(path.join(base, "cas"));
    const audioSha256 = await ContentAddressedStore.computeFileSha256(audioPath);
    const baseIntent = renderIntent(imageB, audioPath, "scene-b", audioSha256);
    const intent: RenderIntent = {
      ...baseIntent,
      // Two one-second visuals and the narration span two seconds; the canvas
      // must cover the actual timeline or the package correctly fails validation.
      durationSeconds: 2,
      tracks: {
        visualAssets: [
          { id: "scene-b", type: "IMAGE", src: imageB, startSeconds: 0, durationSeconds: 1, zIndex: 1 },
          { id: "scene-a", type: "IMAGE", src: imageA, startSeconds: 1, durationSeconds: 1, zIndex: 1 },
        ],
        audioTracks: [{
          ...baseIntent.tracks.audioTracks[0]!,
          id: "voice",
          durationSeconds: 2,
        }],
        captions: [],
      },
    };
    const scenes = [
      {
        sceneId: "scene-a",
        text: "Scene A",
        sourceProvenance: {
          sha256: await ContentAddressedStore.computeFileSha256(imageA),
          mimeType: "image/png",
          sourceAssetId: "source-a",
          provider: "wikimedia",
          license: "CC-BY-4.0",
          author: "Artist A",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:scene-a.png",
          attributionRequired: true,
          provenanceKind: "RETRIEVED",
        },
      },
      {
        sceneId: "scene-b",
        text: "Scene B",
        sourceProvenance: {
          sha256: await ContentAddressedStore.computeFileSha256(imageB),
          mimeType: "image/png",
          sourceAssetId: "source-b",
          provider: "openverse",
          license: "CC0",
          author: "Artist B",
          sourceUrl: "https://openverse.org/image/scene-b",
          attributionRequired: false,
          provenanceKind: "RETRIEVED",
        },
      },
    ];

    const packageRecord = await buildEditorSourcePackage({
      jobId: "job-editor-source-order",
      ownerId: "user-editor-source-order",
      renderIntent: intent,
      scenes,
      cas,
      resolver: new ArtifactResolver(base),
    });
    expect(packageRecord).not.toBeNull();

    const compositionRef = cas.getByHash(packageRecord!.compositionSha256);
    const composition = JSON.parse(fs.readFileSync(compositionRef!.uri, "utf8"));
    expect(composition.tracks[0].clips[0].metadata.sceneId).toBe("scene-b");
    expect(composition.tracks[0].clips[0].metadata.sourceProvenance.sourceAssetId).toBe("source-b");
    expect(composition.tracks[0].clips[1].metadata.sceneId).toBe("scene-a");
    expect(composition.tracks[0].clips[1].metadata.sourceProvenance.sourceAssetId).toBe("source-a");
    expect(composition.metadata.extensions.sceneManifest.map((scene: any) => scene.sceneId)).toEqual([
      "scene-a",
      "scene-b",
    ]);
    expect(packageRecord!.sourceAssets.some((asset) => asset.sceneId === "scene-a" &&
      asset.sourceProvenance?.license === "CC-BY-4.0")).toBe(true);
    expect(packageRecord!.sourceAssets.some((asset) => asset.sceneId === "scene-b" &&
      asset.sourceProvenance?.license === "CC0")).toBe(true);
  });


  it("persists verified source assets and a canonical editable composition to CAS", async () => {
    const base = makeTempRoot();
    const imagePath = path.join(base, "inputs", "question.png");
    const audioPath = path.join(base, "inputs", "narration.wav");
    fs.writeFileSync(
      imagePath,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    );
    writeTinyWav(audioPath);

    const cas = new ContentAddressedStore(path.join(base, "cas"));
    const packageRecord = await buildEditorSourcePackage({
      jobId: "job-editor-package-test",
      ownerId: "user-editor-package-test",
      renderIntent: renderIntent(imagePath, audioPath, "quiz-question-1", await ContentAddressedStore.computeFileSha256(audioPath)),
      scenes: [{
        sceneId: "quiz-question-1",
        text: "Which city is the capital of Tamil Nadu?",
        durationSeconds: 1,
        sourceProvenance: {
          sha256: await ContentAddressedStore.computeFileSha256(imagePath),
          mimeType: "image/png",
          sourceAssetId: "question-fixture-1",
          provider: "user-fixture",
          license: "USER_PROVIDED_FIXTURE",
          author: "ShortForge test fixture",
          sourceUrl: "shortforge://test/image/question-1",
          attributionRequired: false,
          provenanceKind: "USER_PROVIDED",
        },
      }],
      quizData: { question: "Which city is the capital of Tamil Nadu?", answer: "Chennai" },
      cas,
      resolver: new ArtifactResolver(base),
    });

    expect(packageRecord).not.toBeNull();
    expect(packageRecord?.sourceKind).toBe("COMPOSITION_PACKAGE");
    expect(packageRecord?.ownerId).toBe("user-editor-package-test");
    expect(packageRecord?.sourceAssetSha256s).toHaveLength(2);

    const compositionRef = cas.getByHash(packageRecord!.compositionSha256);
    expect(compositionRef?.uri).toBeTruthy();
    expect(await ContentAddressedStore.computeFileSha256(compositionRef!.uri)).toBe(packageRecord!.compositionSha256);

    const composition = JSON.parse(fs.readFileSync(compositionRef!.uri, "utf8"));
    expect(composition.metadata.extensions.sourceJobId).toBe("job-editor-package-test");
    expect(composition.metadata.extensions.ownerId).toBe("user-editor-package-test");
    expect(composition.metadata.extensions.compositionType).toBe("QUIZ_SHORTS");
    expect(composition.metadata.extensions.quizData.answer).toBe("Chennai");
    expect(composition.tracks[0].clips[0].metadata.sceneId).toBe("quiz-question-1");
    expect(composition.tracks[0].clips[0].src).toMatch(/^cas:\/\/[a-f0-9]{64}$/);
    expect(composition.audio[0].src).toMatch(/^cas:\/\/[a-f0-9]{64}$/);
    expect(composition.captions[0].text).toContain("capital of Tamil Nadu");
    expect(composition.captions[0].metadata.sceneId).toBe("quiz-question-1");
  });

  it("uses declared CAS MIME metadata for already-staged image and audio inputs", async () => {
    const base = makeTempRoot();
    const imagePath = path.join(base, "inputs", "owned-question.png");
    const audioPath = path.join(base, "inputs", "owned-voice.wav");
    fs.writeFileSync(
      imagePath,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    );
    writeTinyWav(audioPath);

    const cas = new ContentAddressedStore(path.join(base, "cas"));
    const ownerId = "user-editor-package-cas";
    const jobId = "job-editor-package-cas";
    const image = await cas.putFile(imagePath, "source-image", "image/png", {
      sourceJobId: jobId,
      importedBy: ownerId,
    });
    const audio = await cas.putFile(audioPath, "source-audio", "audio/wav", {
      sourceJobId: jobId,
      importedBy: ownerId,
    });

    const packageRecord = await buildEditorSourcePackage({
      jobId,
      ownerId,
      renderIntent: renderIntent("cas://" + image.sha256, "cas://" + audio.sha256, "quiz-question-cas", audio.sha256),
      scenes: [{
        sceneId: "quiz-question-cas",
        text: "Which city is the capital of Tamil Nadu?",
        durationSeconds: 1,
        sourceProvenance: {
          sha256: image.sha256,
          mimeType: "image/png",
          sourceAssetId: "user-cas-image",
          provider: "user-provided",
          license: "USER_PROVIDED",
          author: "Test owner",
          sourceUrl: "shortforge://user-upload/question-cas",
          attributionRequired: false,
          provenanceKind: "USER_PROVIDED",
        },
      }],
      cas,
      resolver: new ArtifactResolver(base),
    });

    expect(packageRecord).not.toBeNull();
    expect(packageRecord?.sourceAssetSha256s).toContain(image.sha256);
    expect(packageRecord?.sourceAssetSha256s).toContain(audio.sha256);
  });

  it("declines local physical media without complete digest and rights provenance", async () => {
    const base = makeTempRoot();
    const imagePath = path.join(base, "inputs", "unproven-image.png");
    const audioPath = path.join(base, "inputs", "unproven-voice.wav");
    fs.writeFileSync(
      imagePath,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    );
    writeTinyWav(audioPath);
    const cas = new ContentAddressedStore(path.join(base, "cas"));

    const packageRecord = await buildEditorSourcePackage({
      jobId: "job-editor-unproven-source",
      ownerId: "user-editor-unproven-source",
      renderIntent: renderIntent(imagePath, audioPath),
      scenes: [{ sceneId: "quiz-question-1", text: "An unproven source" }],
      cas,
      resolver: new ArtifactResolver(base),
    });

    expect(packageRecord).toBeNull();
  });

  it("declines source-package creation for missing placeholder media URLs", async () => {
    const base = makeTempRoot();
    const cas = new ContentAddressedStore(path.join(base, "cas"));
    const intent = renderIntent(
      "/api/images/job-editor-package-test_0.jpg",
      "/api/voice/job-editor-package-test.wav",
    );

    const packageRecord = await buildEditorSourcePackage({
      jobId: "job-editor-package-test",
      ownerId: "user-editor-package-test",
      renderIntent: intent,
      cas,
      resolver: new ArtifactResolver(base),
    });

    expect(packageRecord).toBeNull();
  });
});
