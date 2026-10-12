import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";

import { ArtifactResolver } from "../rendering/ArtifactResolver";
import { ContentAddressedStore } from "../compute/cas/ContentAddressedStore";
import {
  millisecondsToMediaTime,
  validateCompositionIR,
  type AnimationTrack,
  type CompositionAudioClip,
  type CompositionCaption,
  type CompositionClip,
  type CompositionIR,
  type EffectNode,
  type MaskNode,
  type TransitionNode,
} from "../timeline/CompositionIR";
import type {
  RenderAnimationTrack,
  RenderAudioTrack,
  RenderCaptionCue,
  RenderIntent,
  RenderTrackAsset,
} from "../contracts/RenderIntentContracts";

export interface EditorSourcePackageAsset {
  readonly assetId: string;
  readonly originalAssetId: string;
  readonly sha256: string;
  readonly artifactId: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly roles: readonly ("VISUAL" | "AUDIO")[];
  readonly sceneId?: string;
}

export interface EditorSourcePackageRecord {
  readonly schemaVersion: "shortforge.editor-source.v1";
  readonly sourceKind: "COMPOSITION_PACKAGE";
  readonly sourceJobId: string;
  readonly ownerId: string;
  readonly compositionId: string;
  readonly compositionArtifactId: string;
  readonly compositionSha256: string;
  readonly compositionByteLength: number;
  readonly compositionHashSha256: string;
  readonly sourceAssetSha256s: readonly string[];
  readonly sourceAssets: readonly EditorSourcePackageAsset[];
  readonly renderIntentId: string;
  readonly timelineFingerprint: string;
  readonly createdAt: string;
}

export interface BuildEditorSourcePackageInput {
  readonly jobId: string;
  readonly ownerId: string;
  readonly renderIntent: RenderIntent;
  /** Scenes are supplied in the same ordered array used to compile the render intent. */
  readonly scenes?: readonly Record<string, unknown>[];
  readonly quizData?: unknown;
  readonly cas?: ContentAddressedStore;
  readonly resolver?: ArtifactResolver;
}

interface ResolvedSource {
  readonly src: string;
  readonly localPath: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly sha256: string;
  readonly isTempDownload: boolean;
  readonly cleanup?: () => Promise<void>;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function toMediaTime(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("EDITOR_SOURCE_TIME_INVALID");
  return millisecondsToMediaTime(Math.round(seconds * 1000));
}

function frameRate(fps: number) {
  if (fps === 23.976) return { numerator: 24000, denominator: 1001 };
  if (fps === 29.97) return { numerator: 30000, denominator: 1001 };
  if (fps === 59.94) return { numerator: 60000, denominator: 1001 };
  if (Number.isInteger(fps) && fps > 0) return { numerator: fps, denominator: 1 };
  throw new Error("EDITOR_SOURCE_FPS_UNSUPPORTED");
}

function mapAnimations(tracks: readonly RenderAnimationTrack[] | undefined): AnimationTrack[] | undefined {
  if (!tracks?.length) return undefined;
  return tracks.map((track) => ({
    property: track.property,
    keyframes: track.keyframes.map((keyframe) => ({
      time: toMediaTime(keyframe.timeSeconds),
      value: keyframe.value,
      interpolation: keyframe.interpolation || "LINEAR",
      inHandle: keyframe.inHandle,
      outHandle: keyframe.outHandle,
    })),
  }));
}

function mapVisualTransform(asset: RenderTrackAsset): CompositionClip["transform"] {
  const transform = asset.transform;
  if (!transform) return undefined;
  return {
    x: transform.x,
    y: transform.y,
    scaleX: transform.scaleX ?? transform.scale ?? 1,
    scaleY: transform.scaleY ?? transform.scale ?? 1,
    rotationDeg: transform.rotationDeg ?? 0,
    opacity: transform.opacity ?? 1,
  };
}

function sourceExtension(src: string): string {
  try {
    const pathname = /^https?:\/\//i.test(src) ? new URL(src).pathname : src.split(/[?#]/, 1)[0] || src;
    return path.extname(pathname).toLowerCase();
  } catch {
    return "";
  }
}

function mimeTypeForSource(src: string, role: "VISUAL" | "AUDIO", mediaType: string): string {
  const ext = sourceExtension(src);
  if (role === "VISUAL") {
    if (mediaType === "IMAGE") {
      const map: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".avif": "image/avif",
      };
      if (map[ext]) return map[ext]!;
    }
    if (mediaType === "VIDEO") {
      const map: Record<string, string> = {
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
      };
      if (map[ext]) return map[ext]!;
    }
  } else {
    const map: Record<string, string> = {
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg",
      ".m4a": "audio/mp4",
      ".aac": "audio/aac",
      ".ogg": "audio/ogg",
      ".opus": "audio/opus",
      ".flac": "audio/flac",
    };
    if (map[ext]) return map[ext]!;
  }
  throw new Error("EDITOR_SOURCE_MEDIA_TYPE_UNPROVEN");
}

function locationForSource(
  src: string,
  jobId: string,
  ownerId: string,
  cas: ContentAddressedStore,
): { location: { kind: "LOCAL"; path: string } | { kind: "REMOTE"; uri: string; provider: string }; sha256?: string } {
  if (/^cas:\/\/[a-f0-9]{64}$/i.test(src)) {
    const sha = src.slice("cas://".length).toLowerCase();
    const artifact = cas.getByHash(sha);
    if (!artifact?.uri || !fs.existsSync(artifact.uri)) throw new Error("EDITOR_SOURCE_CAS_NOT_FOUND");
    const provenance = artifact.metadata as Record<string, unknown> | undefined;
    if (provenance?.importedBy !== ownerId || provenance?.sourceJobId !== jobId) {
      throw new Error("EDITOR_SOURCE_CAS_OWNER_UNVERIFIED");
    }
    return { location: { kind: "LOCAL", path: artifact.uri }, sha256: sha };
  }
  if (/^https:\/\//i.test(src)) {
    return { location: { kind: "REMOTE", uri: src, provider: "EDITOR_SOURCE_IMPORT" } };
  }
  if (/^http:\/\//i.test(src)) throw new Error("EDITOR_SOURCE_INSECURE_URL");
  if (/^file:\/\//i.test(src)) {
    const parsed = new URL(src);
    return { location: { kind: "LOCAL", path: decodeURIComponent(parsed.pathname) } };
  }

  // Relative app routes such as /api/images/... are not media files and must not
  // be silently treated as project assets. The render job falls back to flat import.
  const candidate = path.isAbsolute(src) ? src : path.resolve(process.cwd(), src);
  if (!fs.existsSync(candidate)) throw new Error("EDITOR_SOURCE_FILE_NOT_FOUND:" + jobId);
  return { location: { kind: "LOCAL", path: candidate } };
}

function assertMediaSignature(filePath: string, mimeType: string): void {
  const fd = fs.openSync(filePath, "r");
  const head = Buffer.alloc(16);
  let length = 0;
  try {
    length = fs.readSync(fd, head, 0, head.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const prefix = head.subarray(0, length);
  const ascii = (start: number, end: number) => prefix.subarray(start, end).toString("ascii");
  const valid = (() => {
    switch (mimeType) {
      case "image/png":
        return prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      case "image/jpeg":
        return prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff;
      case "image/webp":
        return prefix.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
      case "image/avif":
        return prefix.length >= 12 && ascii(4, 8) === "ftyp" && /avif|avis/.test(ascii(8, 12));
      case "video/mp4":
      case "video/quicktime":
      case "audio/mp4":
        return prefix.length >= 12 && ascii(4, 8) === "ftyp";
      case "video/webm":
        return prefix.length >= 4 && prefix[0] === 0x1a && prefix[1] === 0x45 && prefix[2] === 0xdf && prefix[3] === 0xa3;
      case "audio/wav":
        return prefix.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
      case "audio/mpeg":
        return prefix.length >= 3 && (ascii(0, 3) === "ID3" || (prefix[0] === 0xff && (prefix[1]! & 0xe0) === 0xe0));
      case "audio/aac":
        return prefix.length >= 2 && prefix[0] === 0xff && (prefix[1]! & 0xf6) === 0xf0;
      case "audio/ogg":
      case "audio/opus":
        return prefix.length >= 4 && ascii(0, 4) === "OggS";
      case "audio/flac":
        return prefix.length >= 4 && ascii(0, 4) === "fLaC";
      default:
        return false;
    }
  })();
  if (!valid) throw new Error("EDITOR_SOURCE_MEDIA_SIGNATURE_MISMATCH:" + mimeType);
}

function sceneIdAt(scenes: readonly Record<string, unknown>[], index: number, fallback: string): string {
  const scene = scenes[index];
  const value = scene?.sceneId ?? scene?.scene_id ?? scene?.id;
  return typeof value === "string" && value.length ? value : fallback;
}

function captionForCue(cue: RenderCaptionCue, index: number): CompositionCaption {
  const animation = cue.style?.animation === "POP"
    ? "POP_IN"
    : cue.style?.animation === "FADE"
      ? "FADE"
      : "NONE";
  return {
    id: "caption-" + index,
    text: cue.text,
    start: millisecondsToMediaTime(Math.max(0, Math.round(cue.startMs))),
    end: millisecondsToMediaTime(Math.max(1, Math.round(cue.endMs))),
    style: {
      fontFamily: "sans-serif",
      fontSize: cue.style?.fontSize ?? 48,
      primaryColor: cue.style?.fontColor ?? "#FFFFFF",
      highlightColor: cue.style?.highlightColor,
      animation,
    },
    position: "bottom_center",
  };
}

function audioForTrack(track: RenderAudioTrack, source: ResolvedSource): CompositionAudioClip {
  return {
    id: track.id,
    kind: track.type === "BGM" ? "MUSIC" : track.type,
    src: "cas://" + source.sha256,
    start: toMediaTime(track.startSeconds),
    duration: toMediaTime(track.durationSeconds),
    volume: track.volume,
    sourceIn: toMediaTime(track.sourceInSeconds ?? 0),
    sourceDuration: toMediaTime(track.sourceDurationSeconds ?? track.durationSeconds),
    playbackRate: track.playbackRate ?? 1,
    fadeIn: track.fadeInSeconds === undefined ? undefined : toMediaTime(track.fadeInSeconds),
    fadeOut: track.fadeOutSeconds === undefined ? undefined : toMediaTime(track.fadeOutSeconds),
    metadata: { originalAssetId: track.id, editorSourceSha256: source.sha256 },
  };
}

function visualForTrack(
  asset: RenderTrackAsset,
  source: ResolvedSource,
  index: number,
  scenes: readonly Record<string, unknown>[],
): CompositionClip {
  if (asset.type !== "IMAGE" && asset.type !== "VIDEO") {
    throw new Error("EDITOR_SOURCE_VISUAL_KIND_UNSUPPORTED:" + asset.type);
  }
  const sceneId = sceneIdAt(scenes, index, asset.id);
  const transition = (t: RenderTrackAsset["transitionIn"]): TransitionNode | undefined =>
    t ? {
      transitionId: t.transitionId,
      kind: t.kind,
      duration: toMediaTime(t.durationSeconds),
      params: t.params,
    } : undefined;

  const mapEffects = (): EffectNode[] | undefined => asset.effects?.map((effect) => ({
    effectId: effect.effectId,
    kind: effect.kind,
    scope: effect.scope,
    params: effect.params,
    enabled: effect.enabled,
    animations: mapAnimations(effect.animations),
  }));
  const mapMasks = (): MaskNode[] | undefined => asset.masks?.map((mask) => ({
    maskId: mask.maskId,
    kind: mask.kind,
    x: mask.x,
    y: mask.y,
    width: mask.width,
    height: mask.height,
    rotationDeg: mask.rotationDeg,
    feather: mask.feather,
    stroke: mask.stroke,
    inverted: mask.inverted,
    animations: mapAnimations(mask.animations),
  }));

  return {
    id: asset.id,
    kind: asset.type,
    assetId: source.sha256,
    src: "cas://" + source.sha256,
    start: toMediaTime(asset.startSeconds),
    duration: toMediaTime(asset.durationSeconds),
    sourceIn: toMediaTime(asset.sourceInSeconds ?? 0),
    sourceDuration: toMediaTime(asset.sourceDurationSeconds ?? asset.durationSeconds),
    playbackRate: asset.playbackRate ?? 1,
    zIndex: asset.zIndex,
    transform: mapVisualTransform(asset),
    animations: mapAnimations(asset.animations),
    effects: mapEffects(),
    masks: mapMasks(),
    transitionIn: transition(asset.transitionIn),
    transitionOut: transition(asset.transitionOut),
    metadata: {
      sceneId,
      originalAssetId: asset.id,
      sourceSha256: source.sha256,
    },
  };
}

/**
 * Best-effort source-package creation. It intentionally declines unsupported or
 * incomplete sources: the editor can still offer a clearly-labelled flattened import.
 */
export async function buildEditorSourcePackage(
  input: BuildEditorSourcePackageInput,
): Promise<EditorSourcePackageRecord | null> {
  if (
    !input.jobId ||
    !input.ownerId ||
    input.ownerId === "anonymous" ||
    !input.renderIntent.tracks.visualAssets.length ||
    !input.renderIntent.tracks.audioTracks.some((track) => track.type === "VOICE")
  ) return null;

  const cas = input.cas ?? ContentAddressedStore.getInstance();
  const resolver = input.resolver ?? new ArtifactResolver();
  const intent = input.renderIntent;
  if (intent.tracks.visualAssets.length + intent.tracks.audioTracks.length > 128) return null;

  const resolvedBySource = new Map<string, ResolvedSource>();
  const pending: { src: string; role: "VISUAL" | "AUDIO"; mediaType: string }[] = [];
  for (const asset of intent.tracks.visualAssets) {
    pending.push({ src: asset.src, role: "VISUAL", mediaType: asset.type });
  }
  for (const track of intent.tracks.audioTracks) {
    pending.push({ src: track.src, role: "AUDIO", mediaType: track.type });
  }

  const resolvedFiles: ResolvedSource[] = [];
  const sourceRoles = new Map<string, Set<"VISUAL" | "AUDIO">>();
  let totalBytes = 0;

  try {
    for (const source of pending) {
      const key = source.src;
      const mimeType = mimeTypeForSource(source.src, source.role, source.mediaType);
      const roles = sourceRoles.get(key) ?? new Set<"VISUAL" | "AUDIO">();
      roles.add(source.role);
      sourceRoles.set(key, roles);
      if (resolvedBySource.has(key)) continue;

      const location = locationForSource(source.src, input.jobId, input.ownerId, cas);
      const resolved = await resolver.resolve({
        artifactId: "editor-source-" + digest(input.jobId + ":" + key).slice(0, 24),
        jobId: input.jobId,
        location: location.location,
        mimeType,
        sha256: location.sha256,
      });
      const stat = fs.statSync(resolved.localPath);
      if (!stat.isFile() || stat.size <= 0) throw new Error("EDITOR_SOURCE_EMPTY_MEDIA");
      assertMediaSignature(resolved.localPath, mimeType);
      totalBytes += stat.size;
      if (totalBytes > 750 * 1024 * 1024) throw new Error("EDITOR_SOURCE_PACKAGE_TOO_LARGE");
      const record: ResolvedSource = {
        src: key,
        localPath: resolved.localPath,
        byteLength: resolved.byteLength,
        mimeType,
        sha256: resolved.verifiedSha256,
        isTempDownload: resolved.isTempDownload,
        cleanup: resolved.cleanup,
      };
      resolvedBySource.set(key, record);
      resolvedFiles.push(record);
    }

    const sourceAssets: EditorSourcePackageAsset[] = [];
    const shaBySource = new Map<string, string>();
    for (const [src, record] of resolvedBySource) {
      const casArtifact = await cas.putFile(record.localPath, "editor_source_asset", record.mimeType, {
        sourceJobId: input.jobId,
        importedBy: input.ownerId,
        originalAssetId: src,
        roles: Array.from(sourceRoles.get(src) ?? []),
      });
      shaBySource.set(src, casArtifact.sha256);
      sourceAssets.push({
        assetId: casArtifact.sha256,
        originalAssetId: src,
        sha256: casArtifact.sha256,
        artifactId: casArtifact.artifactId,
        byteLength: casArtifact.byteLength,
        mimeType: record.mimeType,
        roles: Array.from(sourceRoles.get(src) ?? []),
      });
    }

    const sourceAssetSha256s = Array.from(new Set(sourceAssets.map((asset) => asset.sha256))).sort();
    const sceneRows = input.scenes ?? [];
    const tracks: CompositionIR["tracks"] = [{
      id: "video-main",
      kind: "VIDEO",
      zIndex: 0,
      clips: intent.tracks.visualAssets.map((asset, index) => {
        const sourceSha = shaBySource.get(asset.src);
        const source = resolvedBySource.get(asset.src);
        if (!sourceSha || !source) throw new Error("EDITOR_SOURCE_ASSET_MAPPING_MISSING");
        const copiedSource: ResolvedSource = { ...source, sha256: sourceSha };
        return visualForTrack(asset, copiedSource, index, sceneRows);
      }),
    }];

    const audio: CompositionAudioClip[] = intent.tracks.audioTracks.map((track) => {
      const sourceSha = shaBySource.get(track.src);
      const source = resolvedBySource.get(track.src);
      if (!sourceSha || !source) throw new Error("EDITOR_SOURCE_AUDIO_MAPPING_MISSING");
      return audioForTrack(track, { ...source, sha256: sourceSha });
    });

    const captions = intent.tracks.captions.map(captionForCue);
    const createdAt = new Date().toISOString();
    const compositionId = "sf-editor-" + digest(input.jobId + ":" + intent.intentId).slice(0, 24);
    const sourceFingerprintSha256 = digest(JSON.stringify({
      renderIntentId: intent.intentId,
      jobId: input.jobId,
      sourceAssets: sourceAssets.map((asset) => asset.sha256).sort(),
      tracks: intent.tracks,
    }));
    const quizData = input.quizData === undefined ? undefined : JSON.parse(JSON.stringify(input.quizData));
    const sceneManifest = sceneRows.map((scene, index) => ({
      sceneId: sceneIdAt(sceneRows, index, "scene-" + index),
      text: typeof scene.text === "string" ? scene.text : undefined,
      durationSeconds: typeof scene.durationSeconds === "number" ? scene.durationSeconds : undefined,
      assetId: typeof scene.assetId === "string" ? scene.assetId : undefined,
    }));
    const composition: CompositionIR = {
      compositionId,
      schemaVersion: "2.0.0",
      canvas: {
        width: intent.resolution.width,
        height: intent.resolution.height,
        frameRate: frameRate(intent.fps),
        duration: toMediaTime(intent.durationSeconds),
        background: intent.background
          ? { kind: intent.background.kind, value: intent.background.value }
          : { kind: "SOLID", value: "#000000" },
      },
      tracks,
      audio,
      captions,
      metadata: {
        missionId: intent.missionId,
        sourceTimelineId: intent.sourceCompositionId || intent.intentId,
        provenanceDigest: sourceFingerprintSha256,
        extensions: {
          ownerId: input.ownerId,
          sourceJobId: input.jobId,
          sourceKind: "COMPOSITION_PACKAGE",
          renderIntentId: intent.intentId,
          compositionType: intent.compositionType,
          quizData,
          sceneManifest,
          sourceAssetSha256s,
        },
      },
    };

    const validation = validateCompositionIR(composition);
    if (!validation.valid) throw new Error("EDITOR_SOURCE_COMPOSITION_INVALID:" + validation.errors.join("; "));
    const compositionHashSha256 = digest(JSON.stringify(composition));

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-editor-source-"));
    const compositionPath = path.join(tempDir, compositionId + ".json");
    try {
      fs.writeFileSync(compositionPath, JSON.stringify(composition), { encoding: "utf8", flag: "wx" });
      const compositionArtifact = await cas.putFile(compositionPath, "editor_source_composition", "application/json", {
        sourceJobId: input.jobId,
        importedBy: input.ownerId,
        compositionId,
        compositionHashSha256,
      });
      return {
        schemaVersion: "shortforge.editor-source.v1",
        sourceKind: "COMPOSITION_PACKAGE",
        sourceJobId: input.jobId,
        ownerId: input.ownerId,
        compositionId,
        compositionArtifactId: compositionArtifact.artifactId,
        compositionSha256: compositionArtifact.sha256,
        compositionByteLength: compositionArtifact.byteLength,
        compositionHashSha256,
        sourceAssetSha256s,
        sourceAssets,
        renderIntentId: intent.intentId,
        timelineFingerprint: sourceFingerprintSha256,
        createdAt,
      };
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  } catch (error) {
    // A partial source package is never advertised. Any already inserted CAS blobs are
    // harmless immutable orphans and can be reclaimed by the CAS garbage collector.
    console.warn("[EditorSourcePackage] Editable package unavailable; keep flattened fallback.", error);
    return null;
  } finally {
    for (const resolved of resolvedFiles) {
      try {
        if (resolved.cleanup) await resolved.cleanup();
        else if (resolved.isTempDownload && fs.existsSync(resolved.localPath)) fs.unlinkSync(resolved.localPath);
      } catch {
        // Best-effort cleanup for resolver-owned temporary files.
      }
    }
  }
}
