/**
 * FactoryOS Frontier v3 — Structured RenderIntent Contracts
 * Compiler-agnostic intermediate representation produced by Floor 05 Timeline Composition.
 */

export interface RenderAnimationKeyframe {
  readonly timeSeconds: number;
  readonly value: number;
  readonly interpolation?: "LINEAR" | "HOLD" | "BEZIER";
  readonly inHandle?: { readonly x: number; readonly y: number };
  readonly outHandle?: { readonly x: number; readonly y: number };
}

export interface RenderAnimationTrack {
  readonly property: "x" | "y" | "scaleX" | "scaleY" | "rotationDeg" | "opacity";
  readonly keyframes: readonly RenderAnimationKeyframe[];
}

export interface RenderEffectOperation {
  readonly effectId: string;
  readonly kind: string;
  readonly scope: "CLIP" | "TRACK" | "SCENE" | "TIMELINE";
  readonly params: Readonly<Record<string, unknown>>;
  readonly enabled?: boolean;
  readonly animations?: readonly RenderAnimationTrack[];
}

export interface RenderMaskOperation {
  readonly maskId: string;
  readonly kind: "RECTANGLE" | "ELLIPSE" | "STAR" | "HEART" | "DIAMOND" | "SPLIT" | "CINEMATIC_BARS";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
  readonly feather: number;
  readonly stroke?: number;
  readonly inverted?: boolean;
  readonly animations?: readonly RenderAnimationTrack[];
}

export interface RenderTransitionOperation {
  readonly transitionId: string;
  readonly kind: string;
  readonly durationSeconds: number;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface RenderTrackAsset {
  readonly id: string;
  readonly type: "IMAGE" | "VIDEO" | "AUDIO" | "HTML_CANVAS" | "SHAPE";
  readonly src: string;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly zIndex: number;
  readonly sourceInSeconds?: number;
  readonly sourceDurationSeconds?: number;
  readonly playbackRate?: number;
  readonly transform?: {
    readonly scale?: number;
    readonly scaleX?: number;
    readonly scaleY?: number;
    readonly opacity?: number;
    readonly x?: number;
    readonly y?: number;
    readonly rotationDeg?: number;
  };
  readonly animations?: readonly RenderAnimationTrack[];
  readonly effects?: readonly RenderEffectOperation[];
  readonly masks?: readonly RenderMaskOperation[];
  readonly transitionIn?: RenderTransitionOperation;
  readonly transitionOut?: RenderTransitionOperation;
}

export interface RenderCaptionCue {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly style?: {
    readonly fontSize?: number;
    readonly fontColor?: string;
    readonly highlightColor?: string;
    readonly animation?: "FADE" | "POP" | "SLIDE" | "NONE";
  };
}

export interface RenderAudioTrack {
  readonly id: string;
  readonly type: "VOICE" | "BGM" | "SFX";
  readonly src: string;
  readonly volume: number; // 0.0 to 1.0
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly fadeInSeconds?: number;
  readonly fadeOutSeconds?: number;
  readonly sourceInSeconds?: number;
  readonly sourceDurationSeconds?: number;
  readonly playbackRate?: number;
}

export interface RenderBackground {
  readonly kind: "SOLID" | "GRADIENT" | "BLUR";
  readonly value: string | Readonly<Record<string, unknown>>;
}

export interface SurgicalRenderScope {
  readonly mode: "SURGICAL_SCENE";
  readonly repairId: string;
  readonly forceSceneIds: readonly string[];
  readonly affectedFrameRange?: {
    readonly startFrame: number;
    readonly endFrame: number;
  };
}

export interface RenderIntent {
  readonly intentId: string;
  readonly jobId: string;
  readonly missionId: string;
  /** Originating Overseer command identity; required when an economic permit is used. */
  readonly overseerCommandId?: string;
  readonly compositionType: "FACTS_SHORTS" | "QUIZ_SHORTS" | "MOTIVATIONAL" | "KINETIC_TEXT" | "DYNAMIC_CANVAS";
  readonly durationSeconds: number;
  readonly fps: number;
  readonly resolution: {
    readonly width: number;  // 1080
    readonly height: number; // 1920
  };
  readonly tracks: {
    readonly visualAssets: RenderTrackAsset[];
    readonly audioTracks: RenderAudioTrack[];
    readonly captions: RenderCaptionCue[];
  };
  readonly background?: RenderBackground;
  readonly preferredCompiler: "FFMPEG" | "HYPERFRAMES" | "AI_VIDEO" | "AUTO";
  readonly constraints: {
    readonly maxBitrateKbps?: number;
    readonly hardwareAccel?: boolean;
    readonly strictSyncToleranceMs?: number;
  };
  readonly createdAt: string;
  /**
   * Optional canonical editor provenance. Renderers must preserve this identity
   * through the compute manifest and may not replace it with a provider-defined model.
   */
  readonly sourceCompositionId?: string;
  readonly sourceCompositionHashSha256?: string;
  readonly sourceCompositionSchemaVersion?: "2.0.0";
  readonly sourceCompositionCanonicalJson?: string;
  /** Optional ReMaker scope. Full renders remain the default. */
  readonly repairScope?: SurgicalRenderScope;
}

export type ArtifactLocation =
  | { readonly kind: "LOCAL"; readonly path: string }
  | { readonly kind: "REMOTE"; readonly uri: string; readonly provider: string }
  | { readonly kind: "OBJECT_STORAGE"; readonly uri: string; readonly provider: string; readonly bucket?: string; readonly key?: string };

export interface RenderArtifact {
  readonly artifactId: string;
  readonly jobId: string;
  readonly missionId?: string;
  readonly location: ArtifactLocation;
  readonly sha256: string;
  readonly mimeType: "video/mp4" | "video/webm";
  readonly byteLength: number;
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly videoCodec: string;
  readonly audioCodec?: string;
  readonly pixelFormat?: string;
  readonly audioSampleRate?: number;
  readonly audioChannels?: number;
  readonly audioDuration?: number;
  readonly bitrateKbps?: number;
  readonly streamCount?: number;
  readonly syncDriftMs?: number;
  readonly producedAt?: string;
  readonly compiler?: "FFMPEG" | "HYPERFRAMES";
  readonly compilerVersion?: string;
  readonly provider?: "LOCAL" | "DISTRIBUTED";
  readonly executionClass?: "PRODUCTION" | "PROTOTYPE" | "UNVERIFIED";
}

export type RemoteRenderState =
  | "QUEUED"
  | "DISPATCHED"
  | "LEASED"
  | "RUNNING"
  | "ARTIFACT_READY"
  | "VALIDATING"
  | "COMPLETED"
  | "FAILED"
  | "RETRYABLE"
  | "STALE"
  | "CANCELLED";
