/**
 * ShortForge / FactoryOS — History & Change Contracts
 * Tracks entity changes, knowledge document revisions, and git provenance.
 */

export interface HistoryItem {
  readonly id: string;
  readonly entity: string;
  readonly changeType: "ADDED" | "MODIFIED" | "DELETED" | "SUPERSEDED" | "COMMITTED";
  readonly summary: string;
  readonly timestamp: string;
  readonly author?: string;
  readonly source: "GIT" | "KNOWLEDGE_REVISION" | "RUNTIME_EVENT";
  readonly details?: Record<string, unknown>;
}

export interface DocumentRevision {
  readonly documentId: string;
  readonly revisionId: string;
  readonly timestamp: string;
  readonly status: string;
  readonly changeSummary: string;
}

export interface IHistoryProvider {
  changes(entity: string, limit?: number): Promise<HistoryItem[]>;
  versions(documentId: string): Promise<DocumentRevision[]>;
  history(entity?: string, timeRange?: { from?: string; to?: string }): Promise<HistoryItem[]>;
  recordEvent(item: Omit<HistoryItem, "id" | "timestamp">): Promise<HistoryItem>;
}
