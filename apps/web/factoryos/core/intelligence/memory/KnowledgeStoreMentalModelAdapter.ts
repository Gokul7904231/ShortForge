import type { KnowledgeDocument } from "../knowledge/OKFContracts";
import { KnowledgeStore } from "../knowledge/KnowledgeStore";
import type { MemoryMentalModel } from "./MemorySemanticsContracts";
import type { MemoryMentalModelStore } from "./MemoryMentalModelStore";

export class KnowledgeStoreMentalModelAdapter implements MemoryMentalModelStore {
  constructor(private readonly store: KnowledgeStore) {}

  public get(modelId: string): MemoryMentalModel | undefined {
    const document = this.store.get(modelId);
    if (!document || String(document.frontmatter.sf_memory_type || "").toUpperCase() !== "MENTAL_MODEL") {
      return undefined;
    }
    return this.fromDocument(document);
  }

  public list(scopeKey?: string): readonly MemoryMentalModel[] {
    return this.store
      .list({ sf_lifecycle: "active" })
      .filter((document) => String(document.frontmatter.sf_memory_type || "").toUpperCase() === "MENTAL_MODEL")
      .map((document) => this.fromDocument(document))
      .filter((model) => !scopeKey || model.scope.key === scopeKey);
  }

  public async upsert(model: MemoryMentalModel): Promise<void> {
    const frontmatter = {
      type: "reference" as const,
      title: model.question,
      status: "stable" as const,
      sf_lifecycle: "active" as const,
      sf_memory_type: "MENTAL_MODEL",
      sf_mental_model_id: model.modelId,
      sf_mental_model_question: model.question,
      sf_observation_scope: model.scope.key,
      sf_supporting_memory_ids: [...model.sourceObservationIds],
      scope_key: model.scope.key,
      sf_refresh_version: model.version,
      sf_refresh_mode: model.refreshMode,
      sf_refresh_after_consolidation: model.refreshAfterConsolidation,
      sf_refresh_cron: model.refreshCron,
      sf_recall_max_tokens: model.recallMaxTokens,
      sf_min_refresh_interval_seconds: model.minRefreshIntervalSeconds,
      sf_last_refreshed_at: model.lastRefreshedAt,
      sf_dirty_since: model.dirtySince,
      sf_source_fact_types: [...model.sourceFactTypes],
      sf_exclude_sibling_models: model.excludeSiblingModels,
      sf_authority_class: "MODEL_ADVISORY",
      sf_verification_state:
        model.verificationState === "VERIFIED" ? "verified" as const :
          model.verificationState === "DISPUTED" ? "disputed" as const : "unverified" as const,
      sf_epistemic_state: "inferred" as const,
      sf_quality_state: model.dirtySince ? "STALE" as const : "VALID" as const,
      sf_memory_quality_score: 0.8,
      evidence_refs: [...model.evidenceRefs],
      sf_provenance: {
        source_type: "AGENT_OBSERVATION" as const,
        source_id: model.modelId,
        captured_at: model.lastRefreshedAt ?? model.createdAt,
      },
      provenance: {
        source_type: "AGENT_OBSERVATION" as const,
        source_id: model.modelId,
        captured_at: model.lastRefreshedAt ?? model.createdAt,
      },
      created_at: model.createdAt,
      updated_at: model.updatedAt,
      tags: ["shortforge", "memory-fabric", "mental-model"],
    };

    const existing = this.store.get(model.modelId);
    if (existing) {
      await this.store.update(model.modelId, {
        frontmatter,
        content: this.contentFor(model),
      });
      return;
    }

    await this.store.create({
      frontmatter: {
        ...frontmatter,
        id: model.modelId,
        sf_id: model.modelId,
      },
      content: this.contentFor(model),
      subDir: "obsidian/mental-models",
    });
  }

  private fromDocument(document: KnowledgeDocument): MemoryMentalModel {
    const fm = document.frontmatter;
    const verificationRaw = String(fm.sf_verification_state || "unverified").toUpperCase();

    return {
      modelId: String(fm.sf_mental_model_id || fm.id),
      key: String(fm.sf_mental_model_id || fm.id),
      question: String(fm.sf_mental_model_question || fm.title || fm.id),
      scope: { kind: "CUSTOM", key: String(fm.sf_observation_scope || fm.scope_key || "GLOBAL") },
      semanticType: "MENTAL_MODEL",
      content: document.content,
      sourceObservationIds: this.stringArray(fm.sf_supporting_memory_ids),
      evidenceRefs: this.stringArray(fm.evidence_refs),
      verificationState:
        verificationRaw === "VERIFIED" ? "VERIFIED" :
          verificationRaw === "DISPUTED" ? "DISPUTED" :
            verificationRaw === "SUPPORTED" ? "SUPPORTED" : "UNVERIFIED",
      authority: "MODEL_ADVISORY",
      refreshMode: fm.sf_refresh_mode === "DELTA" ? "DELTA" : "FULL",
      refreshAfterConsolidation: false,
      minRefreshIntervalSeconds: this.number(fm.sf_min_refresh_interval_seconds, 3600),
      sourceFactTypes: this.stringArray(fm.sf_source_fact_types) as MemoryMentalModel["sourceFactTypes"],
      excludeSiblingModels: fm.sf_exclude_sibling_models !== false,
      recallMaxTokens: Math.max(64, this.number(fm.sf_recall_max_tokens, 1200)),
      version: Math.max(0, this.number(fm.sf_refresh_version, 0)),
      lastRefreshedAt: this.string(fm.sf_last_refreshed_at),
      dirtySince: this.string(fm.sf_dirty_since),
      dirtyReason: this.string(fm.sf_validity_reason),
      createdAt: String(fm.created_at || new Date().toISOString()),
      updatedAt: String(fm.updated_at || new Date().toISOString()),
    };
  }

  private contentFor(model: MemoryMentalModel): string {
    return [
      "# Mental Model",
      "",
      model.question,
      "",
      model.content,
      "",
      "## Source observations",
      ...model.sourceObservationIds.map((id) => "- " + id),
      "",
      "## Evidence lineage",
      ...model.evidenceRefs.map((id) => "- " + id),
      "",
      "## Authority",
      "- MODEL_ADVISORY",
    ].join("\n");
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
}
