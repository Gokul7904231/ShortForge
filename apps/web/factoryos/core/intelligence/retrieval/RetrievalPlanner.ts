/**
 * ShortForge / FactoryOS — RetrievalPlanner Implementation
 * Normalized multi-factor evidence scoring across StructuralGraph, KnowledgeStore, HistoryProvider, and RuntimeStateProvider.
 *
 * Scoring Formula:
 * FinalScore = w1 * relevance + w2 * authority + w3 * freshness + w4 * verification + w5 * structural_relation
 * (Does not use forced equal quotas; dynamically weights evidence relevance and quality).
 */

import { IStructuralGraphProvider } from "../structural/StructuralContracts";
import { KnowledgeStore } from "../knowledge/KnowledgeStore";
import { IHistoryProvider } from "../history/HistoryContracts";
import { IRuntimeStateProvider } from "../runtime/RuntimeStateContracts";
import {
  EvidenceAuthority,
  EvidenceItem,
  IRetrievalPlanner,
  RetrievalPlan,
  RetrievalResult,
  RetrievalScoringWeights,
  VerificationGrade,
} from "./RetrievalContracts";

export class RetrievalPlanner implements IRetrievalPlanner {
  private structuralGraph?: IStructuralGraphProvider;
  private knowledgeStore?: KnowledgeStore;
  private historyProvider?: IHistoryProvider;
  private runtimeState?: IRuntimeStateProvider;

  public static DEFAULT_WEIGHTS: RetrievalScoringWeights = {
    relevance: 0.40,
    authority: 0.20,
    freshness: 0.15,
    verification: 0.15,
    structuralRelation: 0.10,
  };

  constructor(dependencies: {
    structuralGraph?: IStructuralGraphProvider;
    knowledgeStore?: KnowledgeStore;
    historyProvider?: IHistoryProvider;
    runtimeState?: IRuntimeStateProvider;
  }) {
    this.structuralGraph = dependencies.structuralGraph;
    this.knowledgeStore = dependencies.knowledgeStore;
    this.historyProvider = dependencies.historyProvider;
    this.runtimeState = dependencies.runtimeState;
  }

  public plan(query: string, limit: number = 8): RetrievalPlan {
    const qLower = query.toLowerCase();

    // 1. Multi-Source Synthesis Queries (explicit request for comprehensive, synthesize, full context, or onboarding)
    if (
      qLower.includes("what should") ||
      qLower.includes("new engineer") ||
      qLower.includes("developer onboarding") ||
      qLower.includes("comprehensive") ||
      qLower.includes("synthesize") ||
      qLower.includes("full context") ||
      qLower.includes("overview of")
    ) {
      return {
        query,
        intent: "MULTI_SOURCE_SYNTHESIS",
        targetSources: ["KNOWLEDGE", "STRUCTURAL", "HISTORY", "RUNTIME"],
        limit,
        weights: RetrievalPlanner.DEFAULT_WEIGHTS,
      };
    }

    // 2. Runtime State Queries
    if (
      qLower.includes("blocking") ||
      qLower.includes("running now") ||
      qLower.includes("currently") ||
      qLower.includes("live state") ||
      qLower.includes("worker state") ||
      qLower.includes("queue depth")
    ) {
      return {
        query,
        intent: "RUNTIME_STATUS",
        targetSources: ["RUNTIME"],
        limit,
        weights: { ...RetrievalPlanner.DEFAULT_WEIGHTS, freshness: 0.35, relevance: 0.35 },
      };
    }

    // 2. Code Location / Structural Queries
    if (
      qLower.includes("where is") ||
      qLower.includes("where are") ||
      qLower.includes("which file") ||
      qLower.includes("implemented") ||
      qLower.includes("implements") ||
      qLower.includes("defined") ||
      qLower.includes("source code") ||
      qLower.includes("calls") ||
      qLower.includes("dependency") ||
      qLower.includes("dependents")
    ) {
      return {
        query,
        intent: "CODE_LOCATION",
        targetSources: ["STRUCTURAL"],
        limit,
        weights: { ...RetrievalPlanner.DEFAULT_WEIGHTS, structuralRelation: 0.30, relevance: 0.40 },
      };
    }

    // 3. Temporal / Change Queries
    if (
      qLower.includes("what changed") ||
      qLower.includes("recent change") ||
      qLower.includes("history") ||
      qLower.includes("revisions") ||
      qLower.includes("commit")
    ) {
      return {
        query,
        intent: "TEMPORAL_CHANGE",
        targetSources: ["HISTORY"],
        limit,
        weights: { ...RetrievalPlanner.DEFAULT_WEIGHTS, freshness: 0.30, relevance: 0.40 },
      };
    }

    // 4. Decision / Rationale Queries
    if (
      qLower.includes("why did we") ||
      qLower.includes("why do we") ||
      qLower.includes("decision") ||
      qLower.includes("why choose") ||
      qLower.includes("rejected") ||
      qLower.includes("trade-off") ||
      qLower.includes("lesson")
    ) {
      return {
        query,
        intent: "DECISION_RATIONALE",
        targetSources: ["KNOWLEDGE"],
        limit,
        weights: { ...RetrievalPlanner.DEFAULT_WEIGHTS, authority: 0.30, verification: 0.20, relevance: 0.35 },
      };
    }

    // 5. Multi-Source Synthesis Queries
    return {
      query,
      intent: "MULTI_SOURCE_SYNTHESIS",
      targetSources: ["KNOWLEDGE", "STRUCTURAL", "HISTORY", "RUNTIME"],
      limit,
      weights: RetrievalPlanner.DEFAULT_WEIGHTS,
      policy: "DIVERSITY_REQUIRED",
    };
  }

  public async retrieve(
    query: string,
    limit: number = 8,
    customWeights?: Partial<RetrievalScoringWeights>
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    const plan = this.plan(query, limit);
    const weights: RetrievalScoringWeights = {
      ...(plan.weights || RetrievalPlanner.DEFAULT_WEIGHTS),
      ...(customWeights || {}),
    };

    const rawCandidates: EvidenceItem[] = [];

    // 1. Structural Retrieval
    if (plan.targetSources.includes("STRUCTURAL") && this.structuralGraph) {
      const nodes = this.structuralGraph.searchNodes(query, limit);
      const stats = this.structuralGraph.getStats();
      const freshness = (stats as any).generated_at || (stats as any).snapshotGeneratedAt || "2026-09-01T00:00:00.000Z";

      for (const node of nodes) {
        const relevance = this.computeTextRelevance(
          query,
          `${node.label} ${node.sourceFile || ""} ${node.type}`,
          node.label,
          node.id
        );

        rawCandidates.push({
          id: `ev_struct_${node.id}`,
          sourceType: "STRUCTURAL",
          sourceId: node.id,
          titleOrPath: node.sourceFile || node.label,
          relevance,
          authority: "AUTHORITATIVE",
          freshness,
          epistemicStatus: "observed",
          verification: "verified",
          evidenceLocation: `${node.sourceFile || "unknown"}:${node.sourceLocation || "L1"}`,
          snippet: `[AST Node: ${node.label}] Type: ${node.type} | File: ${node.sourceFile || "N/A"} (${node.sourceLocation || "L1"})`,
          metadata: { ...node },
        });
      }
    }

    // 2. Knowledge Vault Retrieval
    if (plan.targetSources.includes("KNOWLEDGE") && this.knowledgeStore) {
      const docs = this.knowledgeStore.search(query, { limit });
      for (const doc of docs) {
        const epistemic = doc.frontmatter.sf_epistemic_state || doc.frontmatter.epistemic_state || "sourced";
        let verif: VerificationGrade = "unknown";
        const rawVerif = doc.frontmatter.sf_verification_state || doc.frontmatter.verification;
        if (rawVerif === "verified") verif = "verified";
        else if (rawVerif === "disputed") verif = "disputed";
        else if (rawVerif === "unverified") verif = "unverified";
        else if (Array.isArray(doc.frontmatter.verified) && doc.frontmatter.verified.length > 0) verif = "verified";
        else verif = "unknown";

        const freshness = doc.frontmatter.updated_at || doc.frontmatter.created_at || "2026-01-01T00:00:00.000Z";
        const relevance = this.computeTextRelevance(
          query,
          `${doc.frontmatter.title} ${doc.frontmatter.description || ""} ${doc.content}`,
          doc.frontmatter.title,
          doc.frontmatter.id
        );

        rawCandidates.push({
          id: `ev_know_${doc.frontmatter.id}`,
          sourceType: "KNOWLEDGE",
          sourceId: doc.frontmatter.id,
          titleOrPath: doc.filePath,
          relevance,
          authority: "AUTHORITATIVE",
          freshness,
          epistemicStatus: epistemic,
          verification: verif,
          evidenceLocation: doc.filePath,
          snippet: doc.content.slice(0, 300).trim(),
          metadata: { frontmatter: doc.frontmatter },
        });
      }
    }

    // 3. Temporal / History Retrieval
    if (plan.targetSources.includes("HISTORY") && this.historyProvider) {
      const changes = await this.historyProvider.changes(query, limit);
      for (const ch of changes) {
        const relevance = this.computeTextRelevance(
          query,
          `${ch.summary} ${ch.entity} ${ch.changeType}`,
          ch.entity,
          ch.id
        );

        rawCandidates.push({
          id: `ev_hist_${ch.id}`,
          sourceType: "HISTORY",
          sourceId: ch.id,
          titleOrPath: ch.entity,
          relevance,
          authority: "DERIVED",
          freshness: ch.timestamp || "2026-01-01T00:00:00.000Z",
          epistemicStatus: "observed",
          verification: "verified",
          evidenceLocation: ch.source,
          snippet: `[${ch.changeType}] ${ch.summary} (${ch.timestamp})`,
          metadata: { ...ch },
        });
      }
    }

    // 4. Runtime State Retrieval
    if (plan.targetSources.includes("RUNTIME") && this.runtimeState) {
      const snap = await this.runtimeState.getSnapshot();
      const relevance = this.computeTextRelevance(
        query,
        `Factory Status: ${snap.factoryStatus} Blockers: ${snap.currentBlockers.join(" ")} Active: ${snap.activeMissions.length}`,
        "FactoryOS Runtime State",
        "live_snapshot"
      );

      rawCandidates.push({
        id: `ev_run_${Date.now()}`,
        sourceType: "RUNTIME",
        sourceId: "live_snapshot",
        titleOrPath: "FactoryOS Runtime State",
        relevance,
        authority: "LIVE",
        freshness: snap.capturedAt,
        epistemicStatus: "observed",
        verification: "verified",
        evidenceLocation: "in_memory_kernel",
        snippet: `Factory Status: ${snap.factoryStatus} | Active Missions: ${snap.activeMissions.length} | Blockers: ${snap.currentBlockers.length > 0 ? snap.currentBlockers.join(", ") : "None"} | Queue Pending: ${snap.queue.pendingCount}`,
        metadata: { ...snap },
      });
    }

    // 5. Score Candidates with Normalized Multi-Factor Formula
    const scoredCandidates: EvidenceItem[] = rawCandidates.map((item) => {
      const compositeScore = this.computeScore(item, weights);
      return {
        ...item,
        finalScore: compositeScore,
      };
    });

    // 6. Evidence Selection: BEST_EVIDENCE vs DIVERSITY_REQUIRED
    let finalItems: EvidenceItem[] = [];
    if (plan.policy === "DIVERSITY_REQUIRED" && plan.targetSources.length > 1) {
      const bySource: Record<string, EvidenceItem[]> = {};
      for (const item of scoredCandidates) {
        if (!bySource[item.sourceType]) bySource[item.sourceType] = [];
        bySource[item.sourceType].push(item);
      }

      for (const src of Object.keys(bySource)) {
        bySource[src].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
      }

      const selected = new Set<string>();
      for (const src of plan.targetSources) {
        const srcItems = bySource[src] || [];
        for (const it of srcItems.slice(0, 1)) {
          if (!selected.has(it.id)) {
            selected.add(it.id);
            finalItems.push(it);
          }
        }
      }

      scoredCandidates.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
      for (const it of scoredCandidates) {
        if (finalItems.length >= limit) break;
        if (!selected.has(it.id)) {
          selected.add(it.id);
          finalItems.push(it);
        }
      }
    } else {
      // Pure ranking by composite score
      scoredCandidates.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
      finalItems = scoredCandidates.slice(0, limit);
    }

    return {
      plan,
      items: finalItems,
      totalItems: finalItems.length,
      durationMs: Date.now() - startTime,
      executionTimestamp: new Date().toISOString(),
    };
  }

  private computeTextRelevance(query: string, textToMatch: string, title?: string, id?: string): number {
    const qLower = query.toLowerCase().trim();
    const idLower = (id || "").toLowerCase();
    const titleLower = (title || "").toLowerCase();
    const textLower = (textToMatch || "").toLowerCase();

    if (idLower && (qLower.includes(idLower) || idLower === qLower)) return 1.0;
    if (titleLower && (titleLower.includes(qLower) || qLower.includes(titleLower))) return 0.95;

    const stopWords = new Set([
      "where", "what", "why", "how", "when", "did", "we", "the", "is", "are",
      "a", "an", "in", "on", "for", "of", "to", "and", "or", "over", "before",
      "after", "should", "know", "only", "give", "me", "this", "that"
    ]);
    const qTokens = qLower.split(/[^a-z0-9_-]+/).filter((t) => t.length >= 3 && !stopWords.has(t));
    if (qTokens.length === 0) return 0.6;

    let hits = 0;
    for (const tok of qTokens) {
      if (idLower.includes(tok) || titleLower.includes(tok) || textLower.includes(tok)) {
        hits++;
      }
    }
    const ratio = hits / qTokens.length;
    return Math.round((0.50 + ratio * 0.45) * 100) / 100;
  }

  /**
   * Deterministic composite scoring formula:
   * Score = w1 * relevance + w2 * authority + w3 * freshness + w4 * verification + w5 * structural_relation
   */
  private computeScore(item: EvidenceItem, weights: RetrievalScoringWeights): number {
    const relScore = item.relevance;

    // Authority mapping
    let authScore = 0.5;
    if (item.authority === "LIVE" || item.authority === "AUTHORITATIVE") authScore = 1.0;
    else if (item.authority === "DERIVED") authScore = 0.8;
    else if (item.authority === "INFERRED") authScore = 0.4;

    // Freshness mapping (decay over time in days)
    let freshScore = 0.8;
    try {
      const ageMs = Date.now() - new Date(item.freshness).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays <= 1) freshScore = 1.0;
      else if (ageDays <= 7) freshScore = 0.9;
      else if (ageDays <= 30) freshScore = 0.75;
      else freshScore = 0.5;
    } catch {
      freshScore = 0.5;
    }

    // Verification grade mapping
    let verifScore = 0.5;
    if (item.verification === "verified") verifScore = 1.0;
    else if (item.verification === "unverified") verifScore = 0.5;
    else if (item.verification === "unknown") verifScore = 0.4;
    else if (item.verification === "disputed") verifScore = 0.1;

    // Structural relation bonus
    const structScore = item.sourceType === "STRUCTURAL" ? 1.0 : 0.4;

    const totalWeight =
      weights.relevance +
      weights.authority +
      weights.freshness +
      weights.verification +
      weights.structuralRelation;

    const weightedSum =
      weights.relevance * relScore +
      weights.authority * authScore +
      weights.freshness * freshScore +
      weights.verification * verifScore +
      weights.structuralRelation * structScore;

    return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 1000) / 1000 : relScore;
  }
}
