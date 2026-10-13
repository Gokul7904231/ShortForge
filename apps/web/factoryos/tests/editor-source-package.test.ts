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

function renderIntent(imagePath: string, audioPath: string): RenderIntent {
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
        id: "asset-question-1",
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
      }],
      captions: [{
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
      renderIntent: renderIntent(imagePath, audioPath),
      scenes: [{ sceneId: "quiz-question-1", text: "Which city is the capital of Tamil Nadu?", durationSeconds: 1 }],
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
      renderIntent: renderIntent("cas://" + image.sha256, "cas://" + audio.sha256),
      scenes: [{ sceneId: "quiz-question-cas", text: "Which city is the capital of Tamil Nadu?", durationSeconds: 1 }],
      cas,
      resolver: new ArtifactResolver(base),
    });

    expect(packageRecord).not.toBeNull();
    expect(packageRecord?.sourceAssetSha256s).toContain(image.sha256);
    expect(packageRecord?.sourceAssetSha256s).toContain(audio.sha256);
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
