import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CompositionIR,
  CompositionClip,
  CompositionAudioClip,
  CompositionCaption,
} from "../timeline/CompositionIR";
import {
  canonicalizeComposition,
  mediaTimeToMilliseconds,
  validateCompositionIR,
} from "../timeline/CompositionIR";
import { RenderFabric } from "../fabric/RenderFabric";
import type {
  RenderIntent,
  RenderTrackAsset,
  RenderAudioTrack,
  RenderCaptionCue,
} from "../contracts/RenderIntentContracts";
import { ContentAddressedStore } from "../compute/cas/ContentAddressedStore";
import {
  F07ReleaseGuardian,
  type ReleaseGuardianParams,
} from "../verification/youtube/F07ReleaseGuardian";
import {
  VerificationReceiptVerifier,
  type VerificationReceipt,
} from "../verification/youtube/VerificationReceipt";
import { DurableEditor } from "./DurableEditor";
import { EditorPluginRuntime, type ApplyPluginCommandInput, type EditorPluginDefinition } from "./EditorPluginRuntime";
import type {
  EditorCommandEnvelope,
  EditorDocument,
  EditorMcpReceipt,
  EditorMcpRequest,
  EditorReceipt,
  EditorSession,
  HeadlessCompositionJob,
  ShortForgeEditorAPI,
} from "./EditorContracts";
import type {
  EditorCheckpoint,
} from "./EditorRevisionContracts";

export interface EditorPreviewPlan {
  readonly previewId: string;
  readonly compositionId: string;
  readonly compositionRevision: number;
  readonly compositionHashSha256: string;
  readonly renderIntent: RenderIntent;
  readonly physicalExecution: "NOT_EXECUTED";
  readonly wasmExecution: "NOT_PROVEN";
}

export interface EditorF07ReleaseContext {
  readonly guardianParams: Omit<ReleaseGuardianParams, "localMediaPath" | "artifactSha256" | "artifactCasRef">;
}

export interface EditorExportRequest {
  readonly sessionId: string;
  readonly requestedOutput: HeadlessCompositionJob["requestedOutput"];
  readonly f07: EditorF07ReleaseContext;
  readonly outputDir?: string;
}

export interface EditorExportResult {
  readonly jobId: string;
  readonly compositionRevision: number;
  readonly compositionHashSha256: string;
  readonly renderIntent: RenderIntent;
  readonly renderArtifact: NonNullable<Awaited<ReturnType<RenderFabric["executeRender"]>>["artifact"]>;
  readonly casArtifact: Awaited<ReturnType<ContentAddressedStore["putFile"]>>;
  readonly f07Receipt: VerificationReceipt;
  readonly f07ReceiptVerified: boolean;
  readonly f07ReceiptCasUri: string;
}

export interface EditorRuntimeScript {
  readonly scriptId: string;
  readonly sessionId: string;
  readonly commands: readonly EditorCommandEnvelope[];
}

export interface EditorRuntimeScriptResult {
  readonly scriptId: string;
  readonly receipts: readonly EditorReceipt[];
  readonly finalDocument: EditorDocument;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function ticksToSeconds(ticks: number): number {
  return mediaTimeToMilliseconds(ticks) / 1000;
}

function compositionKind(composition: CompositionIR): RenderIntent["compositionType"] {
  const hasText = composition.tracks.some((track) =>
    track.clips.some((clip) => clip.kind === "TEXT"),
  );
  if (hasText || composition.captions.some((caption) => caption.style.animation === "KINETIC_WORD")) {
    return "KINETIC_TEXT";
  }
  return "DYNAMIC_CANVAS";
}

function clipToRenderAsset(clip: CompositionClip): RenderTrackAsset {
  if (!clip.src) {
    throw new Error(`EDITOR_RENDER_SOURCE_REQUIRED:${clip.id}`);
  }

  if (!["VIDEO", "IMAGE", "MOTION_CANVAS"].includes(clip.kind)) {
    throw new Error(`EDITOR_RENDER_CLIP_KIND_UNSUPPORTED:${clip.kind}`);
  }

  const scaleX = clip.transform?.scaleX;
  const scaleY = clip.transform?.scaleY;
  const scale =
    scaleX !== undefined && scaleY !== undefined
      ? (scaleX + scaleY) / 2
      : scaleX ?? scaleY;

  return {
    id: clip.id,
    type: clip.kind === "MOTION_CANVAS" ? "HTML_CANVAS" : clip.kind,
    src: clip.src,
    startSeconds: ticksToSeconds(clip.start),
    durationSeconds: ticksToSeconds(clip.duration),
    zIndex: clip.zIndex,
    transform:
      scale !== undefined ||
      clip.transform?.opacity !== undefined ||
      clip.transform?.x !== undefined ||
      clip.transform?.y !== undefined
        ? {
            ...(scale !== undefined ? { scale } : {}),
            ...(clip.transform?.opacity !== undefined ? { opacity: clip.transform.opacity } : {}),
            ...(clip.transform?.x !== undefined ? { x: clip.transform.x } : {}),
            ...(clip.transform?.y !== undefined ? { y: clip.transform.y } : {}),
          }
        : undefined,
  };
}

function audioToRenderTrack(audio: CompositionAudioClip): RenderAudioTrack {
  if (!audio.src) throw new Error(`EDITOR_RENDER_AUDIO_SOURCE_REQUIRED:${audio.id}`);
  return {
    id: audio.id,
    type:
      audio.kind === "VOICE"
        ? "VOICE"
        : audio.kind === "MUSIC"
          ? "BGM"
          : "SFX",
    src: audio.src,
    volume: audio.volume,
    startSeconds: ticksToSeconds(audio.start),
    durationSeconds: ticksToSeconds(audio.duration),
    fadeInSeconds: audio.fadeIn !== undefined ? ticksToSeconds(audio.fadeIn) : undefined,
    fadeOutSeconds: audio.fadeOut !== undefined ? ticksToSeconds(audio.fadeOut) : undefined,
  };
}

function captionToRenderCue(caption: CompositionCaption): RenderCaptionCue {
  const animation =
    caption.style.animation === "KINETIC_WORD"
      ? "POP"
      : caption.style.animation === "POP_IN"
        ? "POP"
        : caption.style.animation === "FADE"
          ? "FADE"
          : "NONE";
  return {
    text: caption.text,
    startMs: mediaTimeToMilliseconds(caption.start),
    endMs: mediaTimeToMilliseconds(caption.end),
    style: {
      fontSize: caption.style.fontSize,
      fontColor: caption.style.primaryColor,
      highlightColor: caption.style.highlightColor,
      animation,
    },
  };
}

export function compileCompositionToRenderIntent(
  composition: CompositionIR,
  revision: number,
  requestedOutput: HeadlessCompositionJob["requestedOutput"],
): RenderIntent {
  const report = validateCompositionIR(composition);
  if (!report.valid) {
    throw new Error(`EDITOR_RENDER_INVALID_COMPOSITION:${report.errors.join("; ")}`);
  }
  if (requestedOutput.format !== "MP4") {
    throw new Error("EDITOR_HEADLESS_FORMAT_UNSUPPORTED: only MP4 is currently routed through canonical F06");
  }
  if (
    requestedOutput.width !== composition.canvas.width ||
    requestedOutput.height !== composition.canvas.height
  ) {
    throw new Error("EDITOR_HEADLESS_OUTPUT_MISMATCH");
  }

  const compositionHashSha256 = sha256(canonicalizeComposition(composition));
  const stableJobSeed = sha256(
    canonicalizeComposition({
      compositionId: composition.compositionId,
      revision,
      compositionHashSha256,
      missionId: composition.metadata.missionId,
    }),
  );
  const jobId = `editor_render_${stableJobSeed.slice(0, 24)}`;
  const intentId = `editor_intent_${stableJobSeed.slice(24, 48)}`;

  const visualAssets = composition.tracks
    .flatMap((track) => track.clips.map((clip) => clipToRenderAsset(clip)));

  const audioTracks = composition.audio.map(audioToRenderTrack);
  const captions = composition.captions.map(captionToRenderCue);

  if (audioTracks.length === 0 || !audioTracks.some((track) => track.type === "VOICE")) {
    throw new Error("EDITOR_RENDER_VOICE_REQUIRED");
  }

  return {
    intentId,
    jobId,
    missionId: composition.metadata.missionId,
    compositionType: compositionKind(composition),
    durationSeconds: ticksToSeconds(composition.canvas.duration),
    fps: composition.canvas.frameRate.numerator / composition.canvas.frameRate.denominator,
    resolution: {
      width: requestedOutput.width,
      height: requestedOutput.height,
    },
    tracks: {
      visualAssets,
      audioTracks,
      captions,
    },
    preferredCompiler: "FFMPEG",
    constraints: {
      hardwareAccel: false,
      strictSyncToleranceMs: 40,
    },
    createdAt: new Date().toISOString(),
    sourceCompositionId: composition.compositionId,
    sourceCompositionHashSha256: compositionHashSha256,
    sourceCompositionSchemaVersion: composition.schemaVersion,
    sourceCompositionCanonicalJson: canonicalizeComposition(composition),
  };
}

export class EditorRuntime implements ShortForgeEditorAPI {
  readonly plugins: EditorPluginRuntime;
  private readonly renderFabric: RenderFabric;
  private readonly cas: ContentAddressedStore;
  private readonly f07: F07ReleaseGuardian;

  constructor(
    private readonly editor: DurableEditor,
    renderFabric = new RenderFabric(),
    cas = ContentAddressedStore.getInstance(),
    f07 = F07ReleaseGuardian.getInstance(),
  ) {
    this.renderFabric = renderFabric;
    this.cas = cas;
    this.f07 = f07;
    this.plugins = new EditorPluginRuntime(editor);
  }

  async open(session: EditorSession, composition: CompositionIR): Promise<EditorDocument> {
    return this.editor.open(session, composition);
  }

  async apply(input: EditorCommandEnvelope): Promise<EditorReceipt> {
    return this.editor.apply(input);
  }

  async getDocument(sessionId: string): Promise<EditorDocument> {
    return this.editor.getDocument(sessionId);
  }

  async validate(sessionId: string): Promise<{ valid: boolean; errors: readonly string[]; warnings: readonly string[] }> {
    const document = await this.editor.getDocument(sessionId);
    const report = validateCompositionIR(document.composition);
    return {
      valid: report.valid,
      errors: report.errors,
      warnings: report.warnings,
    };
  }

  async preview(sessionId: string): Promise<EditorPreviewPlan> {
    const document = await this.editor.getDocument(sessionId);
    const renderIntent = compileCompositionToRenderIntent(
      document.composition,
      document.revision,
      {
        width: document.composition.canvas.width,
        height: document.composition.canvas.height,
        fps: document.composition.canvas.frameRate.numerator / document.composition.canvas.frameRate.denominator,
        format: "MP4",
      },
    );
    return Object.freeze({
      previewId: `preview_${sha256(renderIntent.intentId).slice(0, 24)}`,
      compositionId: document.composition.compositionId,
      compositionRevision: document.revision,
      compositionHashSha256: document.compositionHash,
      renderIntent,
      physicalExecution: "NOT_EXECUTED",
      wasmExecution: "NOT_PROVEN",
    });
  }

  async export(request: EditorExportRequest): Promise<EditorExportResult> {
    const document = await this.editor.getDocument(request.sessionId);
    const renderIntent = compileCompositionToRenderIntent(
      document.composition,
      document.revision,
      request.requestedOutput,
    );

    const renderResult = await this.renderFabric.executeRender(renderIntent, {
      outputDir: request.outputDir,
    });
    const renderArtifact = renderResult.artifact;
    if (!renderArtifact) throw new Error("EDITOR_RENDER_MISSING_ARTIFACT");

    const location = renderArtifact.location;
    if (location.kind !== "LOCAL") {
      throw new Error("EDITOR_RENDER_ARTIFACT_NOT_LOCALLY_RESOLVABLE");
    }
    if (!fs.existsSync(location.path)) {
      throw new Error("EDITOR_RENDER_OUTPUT_NOT_FOUND");
    }

    const casArtifact = await this.cas.putFile(
      location.path,
      "editor_render_output",
      renderArtifact.mimeType,
      {
        jobId: renderResult.jobId,
        compositionId: document.composition.compositionId,
        compositionRevision: document.revision,
        compositionHashSha256: document.compositionHash,
        sourceCompositionHashSha256: renderIntent.sourceCompositionHashSha256,
      },
    );

    const casRef = `cas://${casArtifact.sha256}`;
    const receipt = await this.f07.verifyRelease({
      ...request.f07.guardianParams,
      artifactSha256: casArtifact.sha256,
      artifactCasRef: casRef,
    });

    const f07ReceiptVerified = VerificationReceiptVerifier.verify(receipt).valid;
    if (!f07ReceiptVerified) {
      throw new Error("EDITOR_F07_RECEIPT_CRYPTOGRAPHIC_VERIFICATION_FAILED");
    }

    const f07ReceiptCasUri = await VerificationReceiptVerifier.persistToCas(receipt);

    return {
      jobId: renderResult.jobId,
      compositionRevision: document.revision,
      compositionHashSha256: document.compositionHash,
      renderIntent,
      renderArtifact,
      casArtifact,
      f07Receipt: receipt,
      f07ReceiptVerified,
      f07ReceiptCasUri,
    };
  }

  async runScript(script: EditorRuntimeScript): Promise<EditorRuntimeScriptResult> {
    if (!script.scriptId) throw new Error("EDITOR_SCRIPT_ID_REQUIRED");
    const receipts: EditorReceipt[] = [];
    for (const command of script.commands) {
      if (command.sessionId !== script.sessionId) {
        throw new Error("EDITOR_SCRIPT_SESSION_MISMATCH");
      }
      receipts.push(await this.editor.apply(command));
      if (!receipts[receipts.length - 1]?.accepted) break;
    }
    return {
      scriptId: script.scriptId,
      receipts: Object.freeze(receipts),
      finalDocument: await this.editor.getDocument(script.sessionId),
    };
  }

  async undo(sessionId: string): Promise<EditorReceipt> {
    return this.editor.undo(sessionId);
  }

  async redo(sessionId: string): Promise<EditorReceipt> {
    return this.editor.redo(sessionId);
  }

  async checkpoint(sessionId: string, reason?: string): Promise<EditorCheckpoint> {
    return this.editor.checkpoint(sessionId, reason);
  }

  async restore(sessionId: string, checkpointId: string): Promise<EditorReceipt> {
    return this.editor.restore(sessionId, checkpointId);
  }

  async replay(compositionId: string) {
    return this.editor.replay(compositionId);
  }

  async listHistory(sessionId: string) {
    return this.editor.listHistory(sessionId);
  }

  async listOperations(sessionId: string) {
    return this.editor.listOperations(sessionId);
  }

  async listCheckpoints(sessionId: string) {
    return this.editor.listCheckpoints(sessionId);
  }

  registerPlugin(plugin: EditorPluginDefinition) {
    return this.plugins.register(plugin);
  }

  async applyPlugin(input: ApplyPluginCommandInput): Promise<EditorReceipt> {
    return this.plugins.apply(input);
  }

  async handleMcp(request: EditorMcpRequest): Promise<EditorMcpReceipt> {
    try {
      switch (request.tool) {
        case "editor.inspect": {
          const document = await this.getDocument(request.sessionId);
          return {
            accepted: true,
            tool: request.tool,
            revision: document.revision,
            compositionHash: document.compositionHash,
            data: {
              compositionId: document.composition.compositionId,
              schemaVersion: document.composition.schemaVersion,
            },
          };
        }
        case "editor.apply": {
          const envelope = request.arguments as unknown as EditorCommandEnvelope;
          const receipt = await this.apply(envelope);
          return {
            accepted: receipt.accepted,
            tool: request.tool,
            commandId: receipt.commandId,
            revision: receipt.revision,
            compositionHash: receipt.compositionHash,
            error: receipt.error,
          };
        }
        case "editor.validate": {
          const validation = await this.validate(request.sessionId);
          return {
            accepted: validation.valid,
            tool: request.tool,
            revision: (await this.getDocument(request.sessionId)).revision,
            compositionHash: (await this.getDocument(request.sessionId)).compositionHash,
            error: validation.valid ? undefined : validation.errors.join("; "),
          };
        }
        case "editor.preview": {
          const preview = await this.preview(request.sessionId);
          return {
            accepted: true,
            tool: request.tool,
            revision: preview.compositionRevision,
            compositionHash: preview.compositionHashSha256,
            data: {
              previewId: preview.previewId,
              physicalExecution: preview.physicalExecution,
              wasmExecution: preview.wasmExecution,
              renderIntentId: preview.renderIntent.intentId,
              jobId: preview.renderIntent.jobId,
            },
          };
        }
        case "editor.export": {
          const input = request.arguments as unknown as EditorExportRequest;
          const result = await this.export(input);
          return {
            accepted: result.f07Receipt.youtubePolicy.publishAllowed,
            tool: request.tool,
            revision: result.compositionRevision,
            compositionHash: result.compositionHashSha256,
            data: {
              jobId: result.jobId,
              renderArtifactSha256: result.renderArtifact.sha256,
              casArtifactSha256: result.casArtifact.sha256,
              f07ReceiptId: result.f07Receipt.receiptId,
              f07ReceiptVerified: result.f07ReceiptVerified,
              f07ReceiptCasUri: result.f07ReceiptCasUri,
            },
            error: result.f07Receipt.youtubePolicy.publishAllowed
              ? undefined
              : result.f07Receipt.youtubePolicy.publishBlockReason,
          };
        }
      }
    } catch (error) {
      return {
        accepted: false,
        tool: request.tool,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  static isHeadlessJob(input: unknown): input is HeadlessCompositionJob {
    if (!input || typeof input !== "object") return false;
    const candidate = input as Partial<HeadlessCompositionJob>;
    return Boolean(
      candidate.jobId &&
      candidate.compositionId &&
      candidate.composition &&
      candidate.requestedOutput &&
      candidate.requireF07 === true,
    );
  }
}