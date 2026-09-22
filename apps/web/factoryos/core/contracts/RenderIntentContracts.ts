/**
 * FactoryOS Frontier v3 — Structured RenderIntent Contracts
 * Compiler-agnostic intermediate representation produced by Floor 05 Timeline Composition.
 */

export interface RenderTrackAsset {
  readonly id: string;
  readonly type: "IMAGE" | "VIDEO" | "AUDIO" | "HTML_CANVAS" | "SHAPE";
  readonly src: string;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly zIndex: number;
  readonly transform?: {
    readonly scale?: number;
    readonly opacity?: number;
    readonly x?: number;
    readonly y?: number;
  };
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
}

export interface RenderIntent {
  readonly intentId: string;
  readonly jobId: string;
  readonly missionId: string;
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
  readonly preferredCompiler: "FFMPEG" | "HYPERFRAMES" | "AI_VIDEO" | "AUTO";
  readonly constraints: {
    readonly maxBitrateKbps?: number;
    readonly hardwareAccel?: boolean;
    readonly strictSyncToleranceMs?: number;
  };
  readonly createdAt: string;
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
  readonly provider?: "LOCAL" | "AZURE_VM" | "DISTRIBUTED";
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

