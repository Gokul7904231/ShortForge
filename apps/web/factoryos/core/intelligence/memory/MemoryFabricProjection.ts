/**
 * ShortForge / FactoryOS — Memory Fabric Agent & Ascalon Projection
 *
 * Read policy is bounded and evidence-aware.
 * Retrieval is delegated to the native hybrid engine so Memory Fabric can
 * evolve from lexical-only reads to semantic/graph/temporal retrieval without
 * introducing a second memory database.
 */
import { MemoryWriter } from "../writer/MemoryWriter";
import type { CandidateMemoryProposal } from "../writer/MemoryWriterContracts";
import type { KnowledgeDocument } from "../knowledge/OKFContracts";
import { KnowledgeStore } from "../knowledge/KnowledgeStore";
import {
  MemoryRetrievalEngine,
  type MemoryRetrievalEngineOptions,
} from "./MemoryRetrievalEngine";
import type {
  MemoryFabricProjection,
  MemoryFabricProjectionItem,
} from "./MemoryFabricContracts";
import type { MemoryAccessContext, MemoryRecallQuery } from "./MemorySemanticsContracts";
import { MemoryProvenanceGuard } from "./MemoryProvenanceGuard";

export class MemoryFabricProjectionService {
  private readonly retrievalEngine: MemoryRetrievalEngine;
  private readonly provenanceGuard = new MemoryProvenanceGuard();

  constructor(
    private readonly knowledgeStore: KnowledgeStore,
    private readonly memoryWriter: MemoryWriter,
    retrievalOptions: MemoryRetrievalEngineOptions = {},
  ) {
    this.retrievalEngine = new MemoryRetrievalEngine(retrievalOptions);
  }

  async projectForAgent(
    query: string,
    maxItems = 12,
    maxChars = 12000,
    accessContext?: MemoryAccessContext,
  ): Promise<MemoryFabricProjection> {
    if (!accessContext) {
      throw new Error("[MemoryFabricProjection] Agent projection requires explicit accessContext");
    }
    if (!accessContext.principalId.trim()) {
      throw new Error("[MemoryFabricProjection] Agent principalId is required");
    }
    return this.project(query, maxItems, maxChars, "AGENT", accessContext);
  }

  async projectForAscalon(
    query = "",
    maxItems = 32,
    maxChars = 24000,
    accessContext?: MemoryAccessContext,
  ): Promise<MemoryFabricProjection> {
    if (!accessContext) {
      throw new Error("[MemoryFabricProjection] Ascalon projection requires explicit accessContext");
    }
    if (!accessContext.principalId.trim()) {
      throw new Error("[MemoryFabricProjection] Ascalon principalId is required");
    }
    if (accessContext.allowedScopeKeys.length === 0 && accessContext.allowGlobalScope !== true) {
      throw new Error("[MemoryFabricProjection] Ascalon projection requires at least one authorized scope");
    }
    return this.project(query, maxItems, maxChars, "ASCALON", accessContext);
  }

  async proposeVerifiedMemory(proposal: CandidateMemoryProposal): Promise<KnowledgeDocument> {
    const result = await this.memoryWriter.proposeAndCommit(proposal);

    return this.knowledgeStore.update(result.frontmatter.id, {
      frontmatter: {
        sf_quality_state: "VALID",
        sf_memory_quality_score: 0.95,
        training_eligible: false,
        sf_memory_type: "OBSERVATION",
      },
    });
  }

  async queryRawKnowledge(
    query: string,
    maxItems = 20,
  ): Promise<readonly KnowledgeDocument[]> {
    return this.knowledgeStore.search(query, { limit: maxItems });
  }

  private async project(
    query: string,
    maxItems: number,
    maxChars: number,
    mode: "AGENT" | "ASCALON",
    accessContext?: MemoryAccessContext,
  ): Promise<MemoryFabricProjection> {
    this.knowledgeStore.reload();

    const now = Date.now();
    const candidateDocs = this.knowledgeStore
      .list({ sf_lifecycle: "active" })
      .filter((doc) => this.isProjectable(doc, mode, now));

    const recallQuery: MemoryRecallQuery = {
      query,
      accessContext,
      maxItems,
      maxChars,
      maxTokens: Math.ceil(maxChars / 4),
      includeStale: false,
      trace: true,
    };

    const result = await this.retrievalEngine.recall(candidateDocs, recallQuery);
    const guarded = mode === "ASCALON"
      ? this.provenanceGuard.guardForAscalon(recallQuery, result.items)
      : this.provenanceGuard.inspect(recallQuery, result.items);
    const items: MemoryFabricProjectionItem[] = guarded.accepted.map((item) => ({
      id: item.memoryId,
      title: item.title,
      type: item.semanticType,
      lifecycle: "active",
      epistemicState: item.verificationState === "VERIFIED" ? "sourced" : "observed",
      verificationState: item.verificationState.toLowerCase(),
      qualityState: item.qualityState as MemoryFabricProjectionItem["qualityState"],
      qualityScore: item.qualityScore,
      occurredAt: item.occurredAt,
      validUntil: item.validUntil,
      provenance: item.provenance,
      evidenceRefs: item.evidenceRefs,
      conflictGroup: this.stringOrUndefined(
        candidateDocs.find((doc) => doc.frontmatter.id === item.memoryId)?.frontmatter.sf_conflict_group,
      ),
      retrievalSignals: {
        semanticScore: item.semanticScore,
        lexicalScore: item.lexicalScore,
        graphScore: item.graphScore,
        temporalScore: item.temporalScore,
        rerankScore: item.rerankScore,
      },
      content: item.content,
    }));

    return {
      generatedAt: result.generatedAt,
      query,
      mode,
      itemCount: items.length,
      estimatedTokens: result.estimatedTokens,
      items,
    };
  }

  private isProjectable(
    doc: KnowledgeDocument,
    mode: "AGENT" | "ASCALON",
    nowMs: number,
  ): boolean {
    const fm = doc.frontmatter;
    const lifecycle = String(fm.sf_lifecycle || "").toLowerCase();
    const verification = String(fm.sf_verification_state || fm.verification || "").toLowerCase();
    const quality = String(fm.sf_quality_state || "VALID").toUpperCase();
    const staleAfter = fm.stale_after || fm.sf_valid_until;

    if (lifecycle !== "active") return false;
    if (verification !== "verified") return false;
    if (["QUARANTINED", "CONTRADICTORY", "INCOMPLETE"].includes(quality)) return false;
    if (staleAfter && Date.parse(String(staleAfter)) <= nowMs) return false;
    if (mode === "ASCALON" && fm.training_eligible !== true) return false;

    return true;
  }

  private stringOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
  }
}
