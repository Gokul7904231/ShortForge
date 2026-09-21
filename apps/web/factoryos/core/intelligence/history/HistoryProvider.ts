/**
 * ShortForge / FactoryOS — HistoryProvider Implementation
 * Aggregates change history from Git, Knowledge Revisions, and Runtime Events.
 */

import { execSync } from "node:child_process";
import { DocumentRevision, HistoryItem, IHistoryProvider } from "./HistoryContracts";
import { KnowledgeStore } from "../knowledge/KnowledgeStore";

export class HistoryProvider implements IHistoryProvider {
  private events: HistoryItem[] = [];
  private knowledgeStore?: KnowledgeStore;

  constructor(knowledgeStore?: KnowledgeStore) {
    this.knowledgeStore = knowledgeStore;
  }

  public async recordEvent(params: Omit<HistoryItem, "id" | "timestamp">): Promise<HistoryItem> {
    const item: HistoryItem = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      entity: params.entity,
      changeType: params.changeType,
      summary: params.summary,
      timestamp: new Date().toISOString(),
      author: params.author || "system",
      source: params.source,
      details: params.details,
    };

    this.events.unshift(item);
    return item;
  }

  public async changes(entity: string, limit: number = 10): Promise<HistoryItem[]> {
    const matched: HistoryItem[] = [];
    const qLower = entity.toLowerCase();

    // 1. Check in-memory event history
    for (const ev of this.events) {
      if (ev.entity.toLowerCase().includes(qLower) || ev.summary.toLowerCase().includes(qLower)) {
        matched.push(ev);
        if (matched.length >= limit) return matched;
      }
    }

    // 2. Query Git history if available
    try {
      const gitOut = execSync(`git log -n ${limit} --oneline --grep="${entity}"`, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });

      const lines = gitOut.trim().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const [hash, ...rest] = line.trim().split(" ");
        matched.push({
          id: hash,
          entity,
          changeType: "COMMITTED",
          summary: rest.join(" "),
          timestamp: new Date().toISOString(),
          source: "GIT",
        });
        if (matched.length >= limit) break;
      }
    } catch {
      // Git not available or repo not initialized, ignore gracefully
    }

    return matched;
  }

  public async versions(documentId: string): Promise<DocumentRevision[]> {
    const revisions: DocumentRevision[] = [];

    // Check knowledge store document
    if (this.knowledgeStore) {
      const doc = this.knowledgeStore.get(documentId);
      if (doc) {
        revisions.push({
          documentId,
          revisionId: "current",
          timestamp: doc.frontmatter.updated_at,
          status: doc.frontmatter.status,
          changeSummary: `Document in state ${doc.frontmatter.status}, created at ${doc.frontmatter.created_at}`,
        });
      }
    }

    // Check recorded events for this document
    for (const ev of this.events) {
      if (ev.entity === documentId) {
        revisions.push({
          documentId,
          revisionId: ev.id,
          timestamp: ev.timestamp,
          status: ev.changeType,
          changeSummary: ev.summary,
        });
      }
    }

    return revisions;
  }

  public async history(entity?: string, timeRange?: { from?: string; to?: string }): Promise<HistoryItem[]> {
    let result = [...this.events];

    if (entity) {
      const q = entity.toLowerCase();
      result = result.filter((e) => e.entity.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q));
    }

    if (timeRange?.from) {
      const fromTime = new Date(timeRange.from).getTime();
      result = result.filter((e) => new Date(e.timestamp).getTime() >= fromTime);
    }

    if (timeRange?.to) {
      const toTime = new Date(timeRange.to).getTime();
      result = result.filter((e) => new Date(e.timestamp).getTime() <= toTime);
    }

    return result;
  }
}
