import type { KnowledgeDocument } from "../knowledge/OKFContracts";
import { KnowledgeStore } from "../knowledge/KnowledgeStore";
import type { MemoryObservationStore } from "./MemoryObservationConsolidator";
import type { MemoryObservation, MemoryScope } from "./MemorySemanticsContracts";

export class KnowledgeStoreObservationAdapter implements MemoryObservationStore {
  constructor(private readonly store: KnowledgeStore) {}

  public list(scopeKey?: string): readonly MemoryObservation[] {
    return this.store
      .list({ sf_lifecycle: "candidate" })
      .concat(this.store.list({ sf_lifecycle: "active" }))
      .filter((document, index, documents) =>
        documents.findIndex((candidate) => candidate.frontmatter.id === document.frontmatter.id) === index,
      )
      .filter((document) => String(document.frontmatter.sf_memory_type || "").toUpperCase() === "OBSERVATION")
      .map((document) => this.fromDocument(document))
      .filter((observation) => !scopeKey || observation.scope.key === scopeKey);
  }

  public get(observationId: string): MemoryObservation | undefined {
    const document = this.store.get(observationId);
    if (!document || String(document.frontmatter.sf_memory_type || "").toUpperCase() !== "OBSERVATION") {
      return undefined;
    }
    return this.fromDocument(document);
  }

  public async upsert(observation: MemoryObservation): Promise<void> {
    const frontmatter = {
      type: "observation" as const,
      title: "Observation: " + observation.facetKey,
      status: observation.verificationState === "VERIFIED" ? "stable" as const : "draft" as const,
      sf_lifecycle: observation.verificationState === "VERIFIED" ? "active" as const : "candidate" as const,
      sf_memory_type: "OBSERVATION",
      sf_observation_scope: observation.scope.key,
      scope_key: observation.scope.key,
      sf_quality_state:
        observation.verificationState === "VERIFIED"
          ? "VALID" as const
          : observation.verificationState === "DISPUTED"
            ? "CONTRADICTORY" as const
            : "UNVERIFIED" as const,
      sf_memory_quality_score: observation.verificationState === "VERIFIED" ? 0.95 : 0.55,
      sf_epistemic_state: observation.verificationState === "VERIFIED" ? "sourced" as const : "observed" as const,
      sf_verification_state:
        observation.verificationState === "VERIFIED"
          ? "verified" as const
          : observation.verificationState === "DISPUTED"
            ? "disputed" as const
            : "unverified" as const,
      sf_proof_count: observation.proofCount,
      sf_supporting_memory_ids: [...observation.supportingMemoryIds],
      sf_contradicting_memory_ids: [...observation.contradictingMemoryIds],
      sf_memory_history: observation.history.map((entry) => ({ ...entry })),
      sf_authority_class: observation.authority,
      sf_occurred_at: observation.createdAt,
      evidence_refs: [...observation.evidenceRefs],
      entity_refs: [...(observation.entityRefs ?? [])],
      sf_source_hash: observation.sourceHash,
      created_at: observation.createdAt,
      updated_at: observation.updatedAt,
    };

    const existing = this.store.get(observation.observationId);
    if (existing) {
      await this.store.update(observation.observationId, {
        frontmatter,
        content: this.contentFor(observation),
      });
      return;
    }

    await this.store.create({
      frontmatter: {
        ...frontmatter,
        id: observation.observationId,
        sf_id: observation.observationId,
        sf_provenance: {
          source_type: "AGENT_OBSERVATION",
          source_id: observation.observationId,
          captured_at: observation.createdAt,
        },
        provenance: {
          source_type: "AGENT_OBSERVATION",
          source_id: observation.observationId,
          captured_at: observation.createdAt,
        },
      },
      content: this.contentFor(observation),
      subDir: "obsidian/observations",
    });
  }

  private fromDocument(document: KnowledgeDocument): MemoryObservation {
    const fm = document.frontmatter;
    const scope: MemoryScope = {
      kind: "CUSTOM",
      key: String(fm.sf_observation_scope || fm.scope_key || "GLOBAL"),
    };
    const verificationRaw = String(fm.sf_verification_state || fm.verification || "unverified").toUpperCase();
    const verificationState =
      verificationRaw === "VERIFIED" ? "VERIFIED" as const
        : verificationRaw === "SUPPORTED" ? "SUPPORTED" as const
          : verificationRaw === "DISPUTED" ? "DISPUTED" as const
            : verificationRaw === "INFERRED" ? "INFERRED" as const
              : "UNVERIFIED" as const;

    const history = Array.isArray(fm.sf_memory_history)
      ? fm.sf_memory_history.filter(
          (entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"),
        ).map((entry, index) => ({
          version: typeof entry.version === "number" ? entry.version : index + 1,
          statement: String(entry.statement || document.content),
          changedAt: String(entry.changedAt || fm.updated_at || document.frontmatter.created_at || new Date().toISOString()),
          changeType: (String(entry.changeType || "REINFORCED") as MemoryObservation["history"][number]["changeType"]),
          evidenceRefs: Array.isArray(entry.evidenceRefs)
            ? entry.evidenceRefs.filter((value): value is string => typeof value === "string")
            : [],
        }))
      : [];

    return {
      observationId: document.frontmatter.id,
      scope,
      facetKey: String(fm.title || "unknown"),
      statement: document.content.replace(/^#.*\n+/m, "").trim(),
      semanticType: "OBSERVATION",
      verificationState,
      authority:
        String(fm.sf_authority_class || "UNKNOWN").toUpperCase() === "MODEL_ADVISORY"
          ? "MODEL_ADVISORY"
          : verificationState === "VERIFIED"
            ? "VERIFIED_SYSTEM"
            : "UNKNOWN",
      sourceMemoryIds: this.stringArray(fm.sf_supporting_memory_ids),
      evidenceRefs: this.stringArray(fm.evidence_refs),
      supportingMemoryIds: this.stringArray(fm.sf_supporting_memory_ids),
      contradictingMemoryIds: this.stringArray(fm.sf_contradicting_memory_ids),
      relationIds: this.stringArray(fm.relation_ids),
      proofCount: this.number(fm.sf_proof_count, this.stringArray(fm.evidence_refs).length),
      version: history.length ? Math.max(...history.map((entry) => entry.version)) : 1,
      history,
      freshness: {
        state: fm.sf_dirty_since ? "STALE" : "FRESH",
        reason: typeof fm.sf_dirty_since === "string" ? "derived_memory_dirty_since_last_refresh" : undefined,
        checkedAt: new Date().toISOString(),
        dirtySince: typeof fm.sf_dirty_since === "string" ? fm.sf_dirty_since : undefined,
      },
      createdAt: String(fm.created_at || new Date().toISOString()),
      updatedAt: String(fm.updated_at || new Date().toISOString()),
      entityRefs: this.stringArray(fm.entity_refs),
      sourceHash: typeof fm.sf_source_hash === "string" ? fm.sf_source_hash : undefined,
    };
  }

  private contentFor(observation: MemoryObservation): string {
    return [
      "# Observation",
      "",
      observation.statement,
      "",
      "## Evidence lineage",
      ...observation.evidenceRefs.map((ref) => "- " + ref),
      "",
      "## Evolution",
      ...observation.history.map(
        (entry) => "- v" + entry.version + " " + entry.changeType + ": " + entry.statement,
      ),
    ].join("\n");
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  }

  private number(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
}
