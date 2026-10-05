import { describe, expect, it, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { DurableEditor } from "../core/editor/DurableEditor";
import { DiskEditorRevisionStore } from "../core/editor/EditorRevisionStore";
import {
  EditorRuntime,
  type EditorF07ReleaseContext,
} from "../core/editor/EditorRuntime";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { F07ReleaseGuardian } from "../core/verification/youtube/F07ReleaseGuardian";
import { VerificationReceiptVerifier } from "../core/verification/youtube/VerificationReceipt";
import type { CompositionIR } from "../core/timeline/CompositionIR";
import { millisecondsToMediaTime } from "../core/timeline/CompositionIR";

function makeComposition(sourcePath: string): CompositionIR {
  const duration = millisecondsToMediaTime(2_000);
  return {
    compositionId: "editor-runtime-proof",
    schemaVersion: "2.0.0",
    canvas: {
      width: 1080,
      height: 1920,
      frameRate: { numerator: 30, denominator: 1 },
      duration,
    },
    tracks: [{
      id: "video",
      kind: "VIDEO",
      zIndex: 0,
      clips: [{
        id: "clip",
        kind: "VIDEO",
        src: sourcePath,
        start: 0,
        duration,
        zIndex: 0,
      }],
    }],
    audio: [{
      id: "voice",
      kind: "VOICE",
      src: sourcePath,
      start: 0,
      duration,
      volume: 1,
    }],
    captions: [{
      id: "caption",
      text: "Physics explained",
      start: 0,
      end: millisecondsToMediaTime(1_500),
      style: {
        fontFamily: "Inter",
        fontSize: 72,
        primaryColor: "#FFFFFF",
        animation: "POP_IN",
      },
    }],
    metadata: {
      missionId: "editor-runtime-proof-mission",
    },
  };
}

const releaseContext: EditorF07ReleaseContext = {
  guardianParams: {
    video: {
      videoId: "editor-runtime-proof-video",
      title: "The Physics of Superconductors Explained",
      description: "An educational explanation of superconductors and quantum levitation.",
      tags: ["physics", "superconductors", "science"],
      contentEngine: "Coding",
      genome: {
        topic: "Superconductors",
        thesis: "BCS electron-pair coupling enables resistance-free electron flow.",
        storyType: "engineering-breakdown",
        hookType: "curiosity-gap",
        narrativeStructure: "three-layer-breakdown",
        durationSeconds: 2,
        narrationSpeedWpm: 150,
        visualGrammar: "isometric-diagrammatic",
        captionGrammar: "kinetic-emphasis",
        audioGrammar: "narration-plus-light-bed",
        sourceSetHash: "editor-runtime-proof-source",
        scriptHash: "editor-runtime-proof-script",
        variationProfile: "editor-runtime-proof-variation",
        originalityProfile: "editor-runtime-proof-originality",
        contentGenomeVersion: 2,
        generatedAt: "2026-09-21T11:00:00Z",
        contentEngine: "Coding",
      },
      measurements: {
        fileExists: true,
        byteLength: 1,
        hasFtypBox: true,
        decodeSmokePassed: true,
        width: 1080,
        height: 1920,
        videoCodec: "h264",
        audioCodec: "aac",
        videoDuration: 2,
        audioDuration: 2,
        syncDriftMs: 0,
        pixelFormat: "yuv420p",
        fps: 30,
        bitrateKbps: 1000,
        streamCount: 2,
        audioSampleRate: 48000,
        audioChannels: 2,
      },
      assets: [{
        assetId: "generated-proof-source",
        type: "VIDEO",
        role: "SOURCE",
        source: "LOCAL_TEST_FIXTURE",
        isCommercialSafe: true,
        isOriginalSynthesis: true,
      }],
      scriptText: "Superconductivity is not just low resistance; it is a quantum state that excludes magnetic flux.",
      scenes: [{ sceneId: "scene-01" }],
    },
    channel: {
      channelId: "editor-runtime-proof-channel",
      yppStatus: "CURRENTLY_MONETIZING",
      isTwoStepVerificationEnabled: true,
      hasAdvancedFeaturesAccess: true,
      hasLinkedAdSense: true,
      activeCommunityGuidelinesStrikes: 0,
      subscriberCount: 200_000,
      validWatchHoursLast365Days: 60_000,
      shortsViewsLast90Days: 15_000_000,
      coverage: "SHORTFORGE_ONLY",
    },
    publicationIntentAt: "2026-09-21T12:00:00Z",
  },
};

function makePhysicalSource(tempDir: string): string {
  const ffmpeg = process.env.FACTORYOS_FFMPEG_PATH || "ffmpeg";
  const source = path.join(tempDir, "source.mp4");
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f", "lavfi",
    "-i", "color=c=black:s=1080x1920:r=30:d=2",
    "-f", "lavfi",
    "-i", "sine=frequency=440:sample_rate=48000:duration=2",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-shortest",
    "-y",
    source,
  ]);
  return source;
}

describe("Editor runtime -> F06 RenderFabric -> CAS -> F07 proof", () => {
  beforeEach(() => {
    F07ReleaseGuardian.resetInstance();
  });

  it("executes editor, MCP, plugin, headless export and cryptographic F07 verification", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-editor-proof-"));
    const journalDir = path.join(tempDir, "journal");
    const casDir = path.join(tempDir, "cas");
    fs.mkdirSync(journalDir, { recursive: true });
    fs.mkdirSync(casDir, { recursive: true });

    const sourcePath = makePhysicalSource(tempDir);
    const cas = ContentAddressedStore.resetInstanceForTesting(casDir);
    const store = new DiskEditorRevisionStore(journalDir);
    const editor = new DurableEditor(store);
    const runtime = new EditorRuntime(editor, undefined, cas, F07ReleaseGuardian.getInstance());

    const composition = makeComposition(sourcePath);

    await runtime.open({
      sessionId: "editor-runtime-proof-session",
      compositionId: composition.compositionId,
      revision: 0,
      mode: "EDIT",
      actor: { kind: "HUMAN", id: "proof-user" },
    }, composition);

    const inspected = await runtime.handleMcp({
      tool: "editor.inspect",
      sessionId: "editor-runtime-proof-session",
      arguments: {},
    });
    expect(inspected.accepted).toBe(true);
    expect(inspected.revision).toBe(0);

    const pluginAdmission = runtime.registerPlugin({
      manifest: {
        pluginId: "proof-effect-plugin",
        name: "Proof Effect",
        version: "1.0.0",
        apiVersion: "1.0.0",
        capabilities: ["EFFECT"],
        permissions: ["READ_COMPOSITION", "WRITE_COMPOSITION"],
        deterministic: true,
        sandbox: "IN_PROCESS",
      },
      createCommand: ({ document }) => ({
        type: "ADD_EFFECT",
        trackId: document.composition.tracks[0]!.id,
        clipId: document.composition.tracks[0]!.clips[0]!.id,
        effect: {
          effectId: "proof-effect",
          kind: "OPACITY",
          scope: "CLIP",
          params: { opacity: 1 },
          enabled: true,
        },
      }),
    });
    expect(pluginAdmission.admitted).toBe(true);

    const pluginReceipt = await runtime.applyPlugin({
      sessionId: "editor-runtime-proof-session",
      commandId: "plugin-command-1",
      expectedRevision: 0,
      actor: { kind: "HUMAN", id: "proof-user" },
      pluginId: "proof-effect-plugin",
      arguments: {},
    });
    expect(pluginReceipt.accepted).toBe(true);
    expect(pluginReceipt.revision).toBe(1);

    const preview = await runtime.preview("editor-runtime-proof-session");
    expect(preview.wasmExecution).toBe("NOT_PROVEN");
    expect(preview.compositionHashSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.renderIntent.sourceCompositionHashSha256).toBe(preview.compositionHashSha256);

    const validation = await runtime.handleMcp({
      tool: "editor.validate",
      sessionId: "editor-runtime-proof-session",
      arguments: {},
    });
    expect(validation.accepted).toBe(true);

    const checkpoint = await runtime.handleMcp({
      tool: "editor.checkpoint",
      sessionId: "editor-runtime-proof-session",
      arguments: { reason: "runtime-proof" },
    });
    expect(checkpoint.accepted).toBe(true);
    expect(checkpoint.data?.checkpointId).toBeTruthy();

    const undo = await runtime.handleMcp({
      tool: "editor.undo",
      sessionId: "editor-runtime-proof-session",
      arguments: {},
    });
    expect(undo.accepted, JSON.stringify(undo)).toBe(true);

    const redo = await runtime.handleMcp({
      tool: "editor.redo",
      sessionId: "editor-runtime-proof-session",
      arguments: {},
    });
    expect(redo.accepted, JSON.stringify(redo)).toBe(true);

    const replay = await runtime.handleMcp({
      tool: "editor.replay",
      sessionId: "editor-runtime-proof-session",
      arguments: { compositionId: composition.compositionId },
    });
    expect(replay.accepted).toBe(true);
    expect(replay.data?.checkedRevisionCount).toBeGreaterThan(0);

    const history = await runtime.handleMcp({
      tool: "editor.history",
      sessionId: "editor-runtime-proof-session",
      arguments: {},
    });
    expect(history.accepted).toBe(true);

    const approvedRenderDir = path.join(process.cwd(), "data", "renders", "editor-runtime-proof");
    fs.mkdirSync(approvedRenderDir, { recursive: true });

    const exportResult = await runtime.export({
      sessionId: "editor-runtime-proof-session",
      requestedOutput: {
        width: 1080,
        height: 1920,
        fps: 30,
        format: "MP4",
      },
      outputDir: approvedRenderDir,
      f07: releaseContext,
    });

    expect(fs.existsSync(exportResult.renderArtifact.location.kind === "LOCAL"
      ? exportResult.renderArtifact.location.path
      : "")).toBe(true);
    expect(exportResult.renderArtifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(exportResult.casArtifact.sha256).toBe(exportResult.f07Receipt.artifactSha256);
    expect(exportResult.f07Receipt.artifactCasRef).toBe(`cas://${exportResult.casArtifact.sha256}`);
    expect(exportResult.f07Receipt.technicalForensics.artifactExists).toBe(true);
    expect(exportResult.f07Receipt.technicalForensics.sha256Valid).toBe(true);
    expect(exportResult.f07Receipt.technicalForensics.decodeSmokePassed).toBe(true);
    expect(exportResult.f07Receipt.evidenceRefs?.some((ref) => ref.evidenceType === "CAS_ARTIFACT")).toBe(true);
    expect(exportResult.f07ReceiptVerified).toBe(true);
    expect(VerificationReceiptVerifier.verify(exportResult.f07Receipt).valid).toBe(true);
    expect(exportResult.f07ReceiptCasUri).toBeTruthy();
    fs.rmSync(approvedRenderDir, { recursive: true, force: true });
  });
});