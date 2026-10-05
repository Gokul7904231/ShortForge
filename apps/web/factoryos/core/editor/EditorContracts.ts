import type {
  CompositionIR,
  EffectNode,
  MaskNode,
  MediaTime,
  RippleScope,
  TransitionNode,
} from "../timeline/CompositionIR";

export type EditorActor =
  | { readonly kind: "HUMAN"; readonly id: string }
  | { readonly kind: "AGENT"; readonly id: string }
  | { readonly kind: "SYSTEM"; readonly id: string };

export type EditorCommand =
  | {
      readonly type: "SPLIT_CLIP";
      readonly trackId: string;
      readonly clipId: string;
      readonly splitTime: MediaTime;
    }
  | {
      readonly type: "TRIM_CLIP";
      readonly trackId: string;
      readonly clipId: string;
      readonly start: MediaTime;
      readonly end: MediaTime;
    }
  | {
      readonly type: "MOVE_CLIP";
      readonly trackId: string;
      readonly clipId: string;
      readonly start: MediaTime;
    }
  | {
      readonly type: "RIPPLE_DELETE";
      readonly trackId: string;
      readonly start: MediaTime;
      readonly end: MediaTime;
      readonly scope?: RippleScope;
      readonly linkedTrackIds?: readonly string[];
      readonly includeAudio?: boolean;
      readonly includeCaptions?: boolean;
    }
  | {
      readonly type: "RETIME_CLIP";
      readonly trackId: string;
      readonly clipId: string;
      readonly duration: MediaTime;
    }
  | {
      readonly type: "ADD_EFFECT";
      readonly trackId: string;
      readonly clipId: string;
      readonly effect: EffectNode;
    }
  | {
      readonly type: "ADD_MASK";
      readonly trackId: string;
      readonly clipId: string;
      readonly mask: MaskNode;
    }
  | {
      readonly type: "SET_TRANSITION";
      readonly trackId: string;
      readonly clipId: string;
      readonly edge: "IN" | "OUT";
      readonly transition: TransitionNode | undefined;
    };

export interface EditorCommandEnvelope {
  readonly commandId: string;
  readonly sessionId: string;
  readonly actor: EditorActor;
  readonly expectedRevision: number;
  readonly command: EditorCommand;
  readonly traceId?: string;
}

export interface EditorReceipt {
  readonly commandId: string;
  readonly accepted: boolean;
  readonly revision: number;
  readonly compositionHash: string;
  readonly changedClipIds: readonly string[];
  readonly commandDigestSha256?: string;
  readonly error?: string;
}

export interface EditorSession {
  readonly sessionId: string;
  readonly compositionId: string;
  readonly revision: number;
  readonly mode: "EDIT" | "READ_ONLY" | "REVIEW";
  readonly actor: EditorActor;
}

export interface EditorDocument {
  readonly composition: CompositionIR;
  readonly revision: number;
  readonly compositionHash: string;
}

export interface ShortForgeEditorAPI {
  open(session: EditorSession, composition: CompositionIR): Promise<EditorDocument>;
  apply(input: EditorCommandEnvelope): Promise<EditorReceipt>;
  getDocument(sessionId: string): Promise<EditorDocument>;
}

export type EditorPluginCapability =
  | "EFFECT"
  | "MASK"
  | "TRANSITION"
  | "CAPTION_STYLE"
  | "MEDIA_IMPORT"
  | "PREVIEW_RENDERER"
  | "RENDER_COMPILER";

export interface EditorPluginManifest {
  readonly pluginId: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: "1.0.0";
  readonly capabilities: readonly EditorPluginCapability[];
  readonly permissions: readonly (
    | "READ_COMPOSITION"
    | "WRITE_COMPOSITION"
    | "READ_MEDIA_METADATA"
    | "REGISTER_RENDERER"
  )[];
  readonly deterministic: boolean;
  readonly sandbox: "IN_PROCESS" | "ISOLATED";
}

export interface EditorPluginAdmission {
  readonly pluginId: string;
  readonly admitted: boolean;
  readonly authority: "SHORTFORGE_OKF";
  readonly reason?: string;
}

export type EditorMcpToolName =
  | "editor.inspect"
  | "editor.apply"
  | "editor.validate"
  | "editor.preview"
  | "editor.export";

export interface EditorMcpRequest {
  readonly tool: EditorMcpToolName;
  readonly sessionId: string;
  readonly arguments: Record<string, unknown>;
  readonly traceId?: string;
}

export interface EditorMcpReceipt {
  readonly accepted: boolean;
  readonly tool: EditorMcpToolName;
  readonly commandId?: string;
  readonly revision?: number;
  readonly compositionHash?: string;
  readonly error?: string;
}

export interface HeadlessCompositionJob {
  readonly jobId: string;
  readonly compositionId: string;
  readonly composition: CompositionIR;
  readonly requestedOutput: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly format: "MP4" | "WEBM";
  };
  readonly rendererPreference?: string;
  readonly requireF07: true;
}
