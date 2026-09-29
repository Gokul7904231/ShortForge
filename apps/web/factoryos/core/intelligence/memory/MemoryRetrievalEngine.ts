import type { KnowledgeDocument } from "../knowledge/OKFContracts";
import type {
  MemoryRecallQuery,
  MemoryRecallResult,
  MemoryRetrievalCandidate,
  MemoryRetrievalTrace,
  MemorySemanticType,
} from "./MemorySemanticsContracts";

export interface MemorySemanticRetriever {
  score(query: string, candidate: KnowledgeDocument): number | Promise<number>;
}

export interface MemoryReranker {
  score(query: string, candidate: MemoryRetrievalCandidate): number | Promise<number>;
}

export interface MemoryRetrievalEngineOptions {
  readonly semanticRetriever?: MemorySemanticRetriever;
  readonly reranker?: MemoryReranker;
  readonly relations?: readonly {
    relationId: string;
    fromMemoryId: string;
    toMemoryId: string;
    type: string;
    scopeKey: string;
    createdAt: string;
    evidenceRefs: readonly string[];
    weight?: number;
  }[];
  readonly fusionConstant?: number;
}

const DEFAULT_RRF_K = 60;

export class MemoryRetrievalEngine {
  private readonly semanticRetriever?: MemorySemanticRetriever;
  private readonly reranker?: MemoryReranker;
  private readonly relations: MemoryRetrievalEngineOptions["relations"];
  private readonly fusionConstant: number;

  constructor(options: MemoryRetrievalEngineOptions = {}) {
    this.semanticRetriever = options.semanticRetriever;
    this.reranker = options.reranker;
    this.relations = options.relations ?? [];
    this.fusionConstant = Math.max(1, options.fusionConstant ?? DEFAULT_RRF_K);
  }

  public async recall(
    documents: readonly KnowledgeDocument[],
    query: MemoryRecallQuery,
  ): Promise<MemoryRecallResult> {
    const eligible = documents.filter((document) => this.isEligible(document, query));
    const semantic = await this.semanticChannel(eligible, query);
    const lexical = this.lexicalChannel(eligible, query);
    const graph = this.graphChannel(eligible, query);
    const temporal = this.temporalChannel(eligible, query);

    const channels = { semantic, lexical, graph, temporal } as const;
    const channelRanks: Record<string, Map<string, number>> = {};

    for (const [name, results] of Object.entries(channels)) {
      const ranks = new Map<string, number>();
      results.forEach((entry, index) => ranks.set(entry.id, index + 1));
      channelRanks[name] = ranks;
    }

    const allIds = new Set<string>();
    for (const results of Object.values(channels)) {
      for (const entry of results) allIds.add(entry.id);
    }

    const now = Date.now();
    const candidates: MemoryRetrievalCandidate[] = [];

    for (const id of allIds) {
      const document = eligible.find((entry) => entry.frontmatter.id === id);
      if (!document) continue;

      const lexicalScore = lexical.find((entry) => entry.id === id)?.score ?? 0;
      const semanticScore = semantic.find((entry) => entry.id === id)?.score ?? 0;
      const graphScore = graph.find((entry) => entry.id === id)?.score ?? 0;
      const temporalScore = temporal.find((entry) => entry.id === id)?.score ?? 0;
      const rrf =
        (channelRanks.semantic.get(id) ? 1 / (this.fusionConstant + channelRanks.semantic.get(id)!) : 0) +
        (channelRanks.lexical.get(id) ? 1 / (this.fusionConstant + channelRanks.lexical.get(id)!) : 0) +
        (channelRanks.graph.get(id) ? 1 / (this.fusionConstant + channelRanks.graph.get(id)!) : 0) +
        (channelRanks.temporal.get(id) ? 1 / (this.fusionConstant + channelRanks.temporal.get(id)!) : 0);

      const freshness = this.freshness(document, now);
      const candidate: MemoryRetrievalCandidate = {
        memoryId: id,
        title: document.frontmatter.title || id,
        semanticType: this.semanticType(document),
        scopeKey: this.scopeKey(document),
        content: document.content,
        verificationState: this.verificationState(document),
        authority: this.authority(document),
        qualityState: String(document.frontmatter.sf_quality_state || "VALID"),
        qualityScore: this.number(document.frontmatter.sf_memory_quality_score, 0.8),
        occurredAt: this.string(document.frontmatter.sf_occurred_at || document.frontmatter.occurred_at),
        validUntil: this.string(document.frontmatter.sf_valid_until || document.frontmatter.valid_until),
        stale: freshness.state !== "FRESH",
        freshness,
        evidenceRefs: this.stringArray(document.frontmatter.evidence_refs),
        provenance: this.provenance(document),
        entityRefs: this.stringArray(document.frontmatter.entity_refs),
        relationIds: this.stringArray(document.frontmatter.relation_ids),
        semanticScore,
        lexicalScore,
        graphScore,
        temporalScore,
        // RRF remains the retrieval backbone; quality/freshness are deterministic
        // safety priors that break ties without pretending to be semantic relevance.
        rerankScore: rrf + this.number(document.frontmatter.sf_memory_quality_score, 0.8) * 0.005 +
          (freshness.state === "FRESH" ? 0.002 : freshness.state === "SLIGHTLY_STALE" ? 0.001 : 0),
        channelRanks: {
          semantic: channelRanks.semantic.get(id),
          lexical: channelRanks.lexical.get(id),
          graph: channelRanks.graph.get(id),
          temporal: channelRanks.temporal.get(id),
        },
      };
      candidates.push(candidate);
    }

    let ranked = candidates.sort((a, b) => b.rerankScore - a.rerankScore);
    if (this.reranker) {
      ranked = (
        await Promise.all(
          ranked.map(async (candidate) => ({
            candidate,
            score: await this.reranker!.score(query.query, candidate),
          })),
        )
      )
        .sort((a, b) => b.score - a.score)
        .map(({ candidate, score }) => ({ ...candidate, rerankScore: score }));
    }

    if (query.includeStale !== true) {
      const nonStale = ranked.filter((candidate) => !candidate.stale);
      if (nonStale.length > 0) ranked = nonStale;
    }

    const maxItems = Math.max(1, query.maxItems ?? 12);
    const maxChars = Math.max(250, query.maxChars ?? 12000);
    const maxTokens = Math.max(64, query.maxTokens ?? Math.ceil(maxChars / 4));

    const items: MemoryRetrievalCandidate[] = [];
    let usedChars = 0;
    for (const candidate of ranked) {
      if (items.length >= maxItems) break;
      const remainingChars = Math.min(maxChars - usedChars, maxTokens * 4 - usedChars);
      if (remainingChars <= 0) break;
      const content = this.bound(candidate.content, remainingChars);
      if (!content) continue;
      items.push({ ...candidate, content });
      usedChars += content.length;
    }

    const staleItems = ranked.filter((candidate) => candidate.stale);
    const trace: MemoryRetrievalTrace = {
      query: query.query,
      generatedAt: new Date().toISOString(),
      candidateCount: eligible.length,
      channelCounts: {
        semantic: semantic.length,
        lexical: lexical.length,
        graph: graph.length,
        temporal: temporal.length,
      },
      fusionConstant: this.fusionConstant,
      staleCandidateCount: staleItems.length,
    };

    return {
      query,
      generatedAt: trace.generatedAt,
      stale: items.some((item) => item.stale),
      staleReason: items.find((item) => item.stale)?.freshness.reason,
      estimatedTokens: Math.ceil(usedChars / 4),
      items,
      trace: query.trace ? trace : undefined,
    };
  }

  private async semanticChannel(
    documents: readonly KnowledgeDocument[],
    query: MemoryRecallQuery,
  ): Promise<Array<{ id: string; score: number }>> {
    if (!this.semanticRetriever) return [];
    const scored = await Promise.all(
      documents.map(async (document) => ({
        id: document.frontmatter.id,
        score: this.safeUnit(await this.semanticRetriever!.score(query.query, document)),
      })),
    );
    return scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  }

  private lexicalChannel(
    documents: readonly KnowledgeDocument[],
    query: MemoryRecallQuery,
  ): Array<{ id: string; score: number }> {
    const tokens = this.tokens(query.query);
    if (tokens.length === 0) return documents.map((document) => ({ id: document.frontmatter.id, score: 1 }));

    const texts = documents.map((document) => ({
      id: document.frontmatter.id,
      tokens: this.tokens([
        document.frontmatter.id,
        document.frontmatter.title || "",
        JSON.stringify(document.frontmatter.tags || []),
        document.content,
      ].join(" ")),
    }));

    const docCount = Math.max(1, texts.length);
    const scores = texts.map((document) => {
      const length = Math.max(1, document.tokens.length);
      const avgLength =
        texts.reduce((sum, current) => sum + Math.max(1, current.tokens.length), 0) / docCount;
      const counts = new Map<string, number>();
      document.tokens.forEach((token) => counts.set(token, (counts.get(token) ?? 0) + 1));

      let score = 0;
      for (const token of tokens) {
        const tf = counts.get(token) ?? 0;
        if (!tf) continue;
        const df = texts.filter((candidate) => candidate.tokens.includes(token)).length;
        const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
        const k1 = 1.2;
        const b = 0.75;
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (length / Math.max(1, avgLength)))));
      }
      return { id: document.id, score };
    });

    return scores.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  }

  private graphChannel(
    documents: readonly KnowledgeDocument[],
    query: MemoryRecallQuery,
  ): Array<{ id: string; score: number }> {
    const entityRefs = new Set(query.entityRefs ?? []);
    if (entityRefs.size === 0 || this.relations.length === 0) return [];

    const adjacency = new Map<string, string[]>();
    for (const relation of this.relations) {
      if (query.scopeKey && relation.scopeKey !== query.scopeKey) continue;
      adjacency.set(relation.fromMemoryId, [
        ...(adjacency.get(relation.fromMemoryId) ?? []),
        relation.toMemoryId,
      ]);
      adjacency.set(relation.toMemoryId, [
        ...(adjacency.get(relation.toMemoryId) ?? []),
        relation.fromMemoryId,
      ]);
    }

    const direct = new Set<string>();
    for (const document of documents) {
      const entities = this.stringArray(document.frontmatter.entity_refs);
      if (entities.some((entity) => entityRefs.has(entity))) direct.add(document.frontmatter.id);
    }

    const distances = new Map<string, number>();
    for (const id of direct) {
      distances.set(id, 0);
      const queue = [id];
      while (queue.length) {
        const current = queue.shift()!;
        const distance = distances.get(current)!;
        if (distance >= 2) continue;
        for (const next of adjacency.get(current) ?? []) {
          if (!distances.has(next)) {
            distances.set(next, distance + 1);
            queue.push(next);
          }
        }
      }
    }

    return [...distances.entries()]
      .filter(([id]) => documents.some((document) => document.frontmatter.id === id))
      .map(([id, distance]) => ({ id, score: 1 / (1 + distance) }))
      .sort((a, b) => b.score - a.score);
  }

  private temporalChannel(
    documents: readonly KnowledgeDocument[],
    query: MemoryRecallQuery,
  ): Array<{ id: string; score: number }> {
    const now = Date.parse(query.queryTimestamp ?? new Date().toISOString());
    const start = query.temporalWindow?.startAt ? Date.parse(query.temporalWindow.startAt) : undefined;
    const end = query.temporalWindow?.endAt ? Date.parse(query.temporalWindow.endAt) : undefined;

    const scored = documents
      .map((document) => {
        const occurred = Date.parse(
          String(document.frontmatter.sf_occurred_at || document.frontmatter.occurred_at || ""),
        );
        if (!Number.isFinite(occurred)) return { id: document.frontmatter.id, score: 0 };

        if (start !== undefined && occurred < start) return { id: document.frontmatter.id, score: 0 };
        if (end !== undefined && occurred > end) return { id: document.frontmatter.id, score: 0 };

        const ageSeconds = Math.abs(now - occurred) / 1000;
        return { id: document.frontmatter.id, score: 1 / (1 + ageSeconds / 86400) };
      });

    return scored.filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  }

  private isEligible(document: KnowledgeDocument, query: MemoryRecallQuery): boolean {
    const fm = document.frontmatter;
    const lifecycle = String(fm.sf_lifecycle || "").toLowerCase();
    const verification = this.verificationState(document);
    const quality = String(fm.sf_quality_state || "VALID").toUpperCase();
    const staleAfter = fm.stale_after || fm.sf_valid_until;

    if (lifecycle !== "active") return false;
    if (!query.allowUnverified && verification !== "VERIFIED") return false;
    if (["QUARANTINED", "CONTRADICTORY", "INCOMPLETE"].includes(quality)) return false;
    if (query.scopeKey && this.scopeKey(document) !== query.scopeKey) return false;
    if (query.accessContext) {
      const allowedScopes = new Set(query.accessContext.allowedScopeKeys);
      const scopeKey = this.scopeKey(document);
      const authorized =
        allowedScopes.has(scopeKey) ||
        (query.accessContext.allowGlobalScope === true && scopeKey === "GLOBAL");
      if (!authorized) return false;
    }
    if (staleAfter && Date.parse(String(staleAfter)) <= Date.now() && query.includeStale !== true) return false;

    if (query.types?.length) {
      const type = this.semanticType(document);
      if (!query.types.includes(type)) return false;
    }

    if (query.tags?.length) {
      const tags = this.stringArray(fm.tags);
      const match = query.tagsMatch ?? "any";
      if (match === "all" && !query.tags.every((tag) => tags.includes(tag))) return false;
      if (match === "exact" && (
        tags.length !== query.tags.length ||
        !query.tags.every((tag) => tags.includes(tag))
      )) return false;
      if (match === "any" && !query.tags.some((tag) => tags.includes(tag))) return false;
    }

    return true;
  }

  private freshness(document: KnowledgeDocument, nowMs: number) {
    const fm = document.frontmatter;
    const dirtySince = this.string(fm.sf_dirty_since);
    const lastRefreshedAt = this.string(fm.sf_last_refreshed_at);
    const staleAfter = this.string(fm.stale_after || fm.sf_valid_until);
    if (staleAfter && Date.parse(staleAfter) <= nowMs) {
      return {
        state: "STALE" as const,
        reason: "validity_window_expired",
        checkedAt: new Date(nowMs).toISOString(),
        dirtySince,
      };
    }
    if (dirtySince && (!lastRefreshedAt || Date.parse(dirtySince) > Date.parse(lastRefreshedAt))) {
      return {
        state: "STALE" as const,
        reason: "derived_memory_dirty_since_last_refresh",
        checkedAt: new Date(nowMs).toISOString(),
        dirtySince,
      };
    }
    if (!document.frontmatter.sf_occurred_at && !document.frontmatter.occurred_at) {
      return {
        state: "UNKNOWN" as const,
        reason: "missing_temporal_anchor",
        checkedAt: new Date(nowMs).toISOString(),
      };
    }
    return {
      state: "FRESH" as const,
      checkedAt: new Date(nowMs).toISOString(),
      sourceWatermark: this.string(fm.sf_last_consolidated_at),
    };
  }

  private semanticType(document: KnowledgeDocument): MemorySemanticType {
    const raw = String(
      document.frontmatter.sf_memory_type || document.frontmatter.type || "REFERENCE",
    ).toUpperCase();
    switch (raw) {
      case "WORLD_FACT":
      case "EXPERIENCE":
      case "OBSERVATION":
      case "MENTAL_MODEL":
      case "KNOWLEDGE_PAGE":
      case "EVIDENCE":
        return raw;
      default:
        return "EVIDENCE";
    }
  }

  private verificationState(document: KnowledgeDocument) {
    const raw = String(
      document.frontmatter.sf_verification_state || document.frontmatter.verification || "UNVERIFIED",
    ).toUpperCase();
    if (raw === "VERIFIED") return "VERIFIED" as const;
    if (raw === "SUPPORTED") return "SUPPORTED" as const;
    if (raw === "DISPUTED") return "DISPUTED" as const;
    if (raw === "INFERRED") return "INFERRED" as const;
    return "UNVERIFIED" as const;
  }

  private authority(document: KnowledgeDocument) {
    const raw = String(document.frontmatter.sf_authority_class || "UNKNOWN").toUpperCase();
    if (raw === "F07" || raw === "VERIFIED_SYSTEM" || raw === "HUMAN_AUTHORITY" || raw === "MODEL_ADVISORY") {
      return raw as "F07" | "VERIFIED_SYSTEM" | "HUMAN_AUTHORITY" | "MODEL_ADVISORY";
    }
    return "UNKNOWN" as const;
  }

  private scopeKey(document: KnowledgeDocument): string {
    return String(
      document.frontmatter.sf_observation_scope ||
      document.frontmatter.scope_key ||
      document.frontmatter.mission_id ||
      "GLOBAL",
    );
  }

  private provenance(document: KnowledgeDocument): string {
    const provenance = document.frontmatter.sf_provenance || document.frontmatter.provenance;
    if (!provenance) return "UNSPECIFIED";
    return provenance.source_type + ":" + provenance.source_id;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  }

  private string(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
  }

  private number(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  private tokens(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9_:-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
  }

  private safeUnit(value: unknown): number {
    return Math.max(0, Math.min(1, typeof value === "number" && Number.isFinite(value) ? value : 0));
  }

  private bound(text: string, maxChars: number): string {
    if (maxChars <= 0) return "";
    if (text.length <= maxChars) return text;
    return text.slice(0, Math.max(0, maxChars - 40)) + "\n\n[MEMORY_BOUNDED_TRUNCATION]";
  }
}
