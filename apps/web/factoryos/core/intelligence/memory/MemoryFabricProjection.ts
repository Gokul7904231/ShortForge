/**
 * ShortForge / FactoryOS — Memory Fabric Agent & Ascalon Projection
 *
 * Read policy is bounded and evidence-aware.
 * Write policy always terminates at MemoryWriter; this service never mutates
 * runtime state, Mongo operational collections, Guardian state, or .okf law.
 */

import { MemoryWriter } from "../writer/MemoryWriter";
import type { CandidateMemoryProposal } from "../writer/MemoryWriterContracts";
import type { KnowledgeDocument } from "../knowledge/OKFContracts";
import { KnowledgeStore } from "../knowledge/KnowledgeStore";
import type {
  MemoryFabricProjection,
  MemoryFabricProjectionItem,
} from "./MemoryFabricContracts";

export class MemoryFabricProjectionService {
  constructor(
    private readonly knowledgeStore: KnowledgeStore,
    private readonly memoryWriter: MemoryWriter,
  ) {}

  async projectForAgent(
    query: string,
    maxItems = 12,
    maxChars = 12000,
  ): Promise<MemoryFabricProjection> {
    return this.project(query, maxItems, maxChars, "AGENT");
  }

  async projectForAscalon(
    query = "",
    maxItems = 32,
    maxChars = 24000,
  ): Promise<MemoryFabricProjection> {
    return this.project(query, maxItems, maxChars, "ASCALON");
  }

  async proposeVerifiedMemory(proposal: CandidateMemoryProposal): Promise<KnowledgeDocument> {
    const result = await this.memoryWriter.proposeAndCommit(proposal);

    return this.knowledgeStore.update(result.frontmatter.id, {
      frontmatter: {
        sf_quality_state: "VALID",
        sf_memory_quality_score: 0.95,
        training_eligible: false,
      },
    });
  }

  async queryRawKnowledge(
    query: string,
    maxItems = 20,
  ): Promise<readonly KnowledgeDocument[]> {
    return this.knowledgeStore.search(query, { limit: maxItems });
  }

  private project(
    query: string,
    maxItems: number,
    maxChars: number,
    mode: "AGENT" | "ASCALON",
  ): MemoryFabricProjection {
    // Obsidian/human edits occur outside the process; refresh the semantic store before every bounded read.
    this.knowledgeStore.reload();

    const now = Date.now();
    const candidateDocs = this.knowledgeStore
      .list({ sf_lifecycle: "active" })
      .filter((doc) => this.isProjectable(doc, mode, now))
      .filter((doc) => this.matchesQuery(doc, query));

    const sorted = candidateDocs.sort((a, b) => {
      const scoreA = this.scoreDocument(a, query);
      const scoreB = this.scoreDocument(b, query);
      return scoreB - scoreA;
    });

    const items: MemoryFabricProjectionItem[] = [];
    let usedChars = 0;

    for (const doc of sorted.slice(0, Math.max(1, maxItems))) {
      const content = this.trimToBudget(doc.content, Math.max(250, maxChars - usedChars));
      if (!content) continue;

      const item: MemoryFabricProjectionItem = {
        id: doc.frontmatter.id,
        title: doc.frontmatter.title || doc.frontmatter.id,
        type: doc.frontmatter.type || "reference",
        lifecycle: String(doc.frontmatter.sf_lifecycle || "active"),
        epistemicState: String(doc.frontmatter.sf_epistemic_state || "sourced"),
        verificationState: String(doc.frontmatter.sf_verification_state || "verified"),
        qualityState: String(doc.frontmatter.sf_quality_state || "VALID") as MemoryFabricProjectionItem["qualityState"],
        qualityScore: this.numberOrDefault(doc.frontmatter.sf_memory_quality_score, 0.9),
        occurredAt: this.stringOrUndefined(doc.frontmatter.sf_occurred_at || doc.frontmatter.occurred_at),
        validUntil: this.stringOrUndefined(doc.frontmatter.sf_valid_until || doc.frontmatter.valid_until),
        provenance: this.provenanceLabel(doc),
        evidenceRefs: Array.isArray(doc.frontmatter.evidence_refs)
          ? doc.frontmatter.evidence_refs.filter((ref): ref is string => typeof ref === "string")
          : undefined,
        conflictGroup: this.stringOrUndefined(doc.frontmatter.sf_conflict_group),
        retrievalSignals: {
          lexicalScore: this.lexicalOverlapScore(doc, query),
          temporalScore: this.temporalFreshnessScore(doc, now),
          rerankScore: this.scoreDocument(doc, query),
        },
        content,
      };

      items.push(item);
      usedChars += content.length;
      if (usedChars >= maxChars) break;
    }

    const generatedAt = new Date().toISOString();
    return {
      generatedAt,
      query,
      mode,
      itemCount: items.length,
      estimatedTokens: Math.ceil(usedChars / 4),
      items,
    };
  }

  private isProjectable(
    doc: KnowledgeDocument,
    mode: "AGENT" | "ASCALON",
    nowMs: number,
  ): boolean {
    const fm = doc.frontmatter;
    const lifecycle = String(fm.sf_lifecycle || "");
    const verification = String(fm.sf_verification_state || fm.verification || "");
    const quality = String(fm.sf_quality_state || "VALID");
    const staleAfter = fm.stale_after || fm.sf_valid_until;

    if (lifecycle !== "active") return false;
    if (verification !== "verified") return false;
    if (["QUARANTINED", "CONTRADICTORY", "STALE", "INCOMPLETE"].includes(quality)) return false;

    if (staleAfter && Date.parse(String(staleAfter)) <= nowMs) return false;

    if (mode === "ASCALON") {
      return fm.training_eligible === true;
    }

    return true;
  }

  private matchesQuery(doc: KnowledgeDocument, query: string): boolean {
    const trimmed = query.trim();
    if (!trimmed) return true;

    const haystack = [
      doc.frontmatter.id,
      doc.frontmatter.title || "",
      JSON.stringify(doc.frontmatter.tags || []),
      doc.content,
    ]
      .join(" ")
      .toLowerCase();

    return trimmed
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter(Boolean)
      .every((token) => haystack.includes(token));
  }

  private scoreDocument(doc: KnowledgeDocument, query: string): number {
    const quality = this.numberOrDefault(doc.frontmatter.sf_memory_quality_score, 0.8);
    const lexical = this.lexicalOverlapScore(doc, query);
    const freshness = this.temporalFreshnessScore(doc, Date.now());
    return quality * 70 + lexical * 25 + freshness * 5;
  }

  private lexicalOverlapScore(doc: KnowledgeDocument, query: string): number {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return 1;
    const haystack = [
      doc.frontmatter.id,
      doc.frontmatter.title || "",
      JSON.stringify(doc.frontmatter.tags || []),
      doc.content,
    ].join(" ").toLowerCase();
    const tokens = trimmed.split(/[^a-z0-9_-]+/).filter(Boolean);
    if (tokens.length === 0) return 0;
    const hits = tokens.filter((token) => haystack.includes(token)).length;
    return hits / tokens.length;
  }

  private temporalFreshnessScore(doc: KnowledgeDocument, nowMs: number): number {
    const occurredAt = this.stringOrUndefined(
      doc.frontmatter.sf_occurred_at || doc.frontmatter.occurred_at,
    );
    if (!occurredAt) return 0.5;
    const ageMs = Math.max(0, nowMs - Date.parse(occurredAt));
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return Math.exp(-ageMs / thirtyDays);
  }

  private provenanceLabel(doc: KnowledgeDocument): string {
    const p = doc.frontmatter.sf_provenance || doc.frontmatter.provenance;
    if (!p) return "UNSPECIFIED";

    return p.source_type + ":" + p.source_id;
  }

  private trimToBudget(content: string, budget: number): string {
    if (budget <= 0) return "";
    if (content.length <= budget) return content;
    return content.slice(0, Math.max(0, budget - 64)) + "\n\n[BOUNDED_PROJECTION_TRUNCATED]";
  }

  private numberOrDefault(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  private stringOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
  }
}
