import type { CompositionIR } from "../timeline/CompositionIR";
import type {
  EditorActor,
  EditorCommand,
  EditorReceipt,
} from "./EditorContracts";

export type EditorRevisionKind =
  | "ROOT"
  | "COMMAND"
  | "UNDO"
  | "REDO"
  | "RESTORE";

export interface EditorHistoryState {
  readonly cursorRevisionId: string;
  readonly redoStackRevisionIds: readonly string[];
}

export interface EditorOperationRecord {
  readonly operationId: string;
  readonly compositionId: string;
  readonly revisionId: string;
  readonly parentRevisionId?: string;
  readonly kind: EditorRevisionKind;
  readonly actor: EditorActor;
  readonly commandId?: string;
  readonly commandDigestSha256?: string;
  readonly command?: EditorCommand;
  readonly restoreFromRevisionId?: string;
  readonly createdAt: string;
}

export interface EditorRevisionNode {
  readonly revisionId: string;
  readonly compositionId: string;
  readonly revision: number;
  readonly parentRevisionId?: string;
  readonly kind: EditorRevisionKind;
  readonly actor: EditorActor;
  readonly commandId?: string;
  readonly commandDigestSha256?: string;
  readonly command?: EditorCommand;
  readonly restoreFromRevisionId?: string;
  readonly composition: CompositionIR;
  readonly compositionHashSha256: string;
  readonly history: EditorHistoryState;
  readonly operationId: string;
  readonly createdAt: string;
}

export interface AppendEditorRevisionInput {
  readonly compositionId: string;
  readonly parentRevisionId?: string;
  readonly parentRevision: number;
  readonly kind: EditorRevisionKind;
  readonly actor: EditorActor;
  readonly commandId?: string;
  readonly commandDigestSha256?: string;
  readonly command?: EditorCommand;
  readonly restoreFromRevisionId?: string;
  readonly composition: CompositionIR;
  readonly compositionHashSha256: string;
  readonly history: EditorHistoryState;
  readonly operationId: string;
  readonly revisionId: string;
  readonly createdAt: string;
}

export interface EditorCheckpoint {
  readonly checkpointId: string;
  readonly compositionId: string;
  readonly revisionId: string;
  readonly revision: number;
  readonly composition: CompositionIR;
  readonly compositionHashSha256: string;
  readonly reason?: string;
  readonly createdAt: string;
}

export interface EditorRevisionStore {
  initialize(
    composition: CompositionIR,
    actor: EditorActor,
  ): Promise<EditorRevisionNode>;
  getHead(compositionId: string): Promise<EditorRevisionNode | null>;
  getRevision(revisionId: string): Promise<EditorRevisionNode | null>;
  getRevisionByNumber(
    compositionId: string,
    revision: number,
  ): Promise<EditorRevisionNode | null>;
  getChildren(revisionId: string): Promise<EditorRevisionNode[]>;
  findCommand(
    compositionId: string,
    commandId: string,
  ): Promise<EditorRevisionNode | null>;
  appendRevision(
    input: AppendEditorRevisionInput,
  ): Promise<EditorRevisionNode>;
  listRevisions(compositionId: string): Promise<EditorRevisionNode[]>;
  listOperations(compositionId: string): Promise<EditorOperationRecord[]>;
  saveCheckpoint(checkpoint: EditorCheckpoint): Promise<void>;
  getCheckpoint(
    compositionId: string,
    checkpointId: string,
  ): Promise<EditorCheckpoint | null>;
  listCheckpoints(compositionId: string): Promise<EditorCheckpoint[]>;
}

export interface EditorReplayReport {
  readonly valid: boolean;
  readonly compositionId: string;
  readonly revisionCount: number;
  readonly replayedThroughRevisionId?: string;
  readonly finalComposition?: CompositionIR;
  readonly finalCompositionHashSha256?: string;
  readonly error?: string;
  readonly checkedRevisionIds: readonly string[];
}

export interface DurableEditorHistoryAPI {
  undo(sessionId: string): Promise<EditorReceipt>;
  redo(sessionId: string): Promise<EditorReceipt>;
  checkpoint(
    sessionId: string,
    reason?: string,
  ): Promise<EditorCheckpoint>;
  restore(
    sessionId: string,
    checkpointId: string,
  ): Promise<EditorReceipt>;
  replay(compositionId: string): Promise<EditorReplayReport>;
  listHistory(sessionId: string): Promise<EditorRevisionNode[]>;
  listOperations(sessionId: string): Promise<EditorOperationRecord[]>;
  listCheckpoints(sessionId: string): Promise<EditorCheckpoint[]>;
}
