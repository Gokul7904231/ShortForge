import { createHash, randomUUID } from "node:crypto";
import type {
  MemoryConsolidationInput,
  MemoryConsolidationReport,
  MemoryHistoryEntry,
  MemoryObservation,
} from "./MemorySemanticsContracts";

export interface MemoryObservationStore {
  list(scopeKey?: string): readonly MemoryObservation[];
  get(observationId: string): MemoryObservation | undefined;
  upsert(observation: MemoryObservation): void;
}

export class InMemoryMemoryObservationStore implements MemoryObservationStore {
  private readonly observations = new Map<string, MemoryObservation>();

  public list(scopeKey?: string): readonly MemoryObservation[] {
    const all = [...this.observations.values()];
    return scopeKey ? all.filter((item) => item.scope.key === scopeKey) : all;
  }

  public get(observationId: string): MemoryObservation | undefined {
    return this.observations.get(observationId);
  }

  public upsert(observation: MemoryObservation): void {
    this.observations.set(observation.observationId, observation);
  }
}

export interface MemoryConsolidationOptions {
  readonly dedupSimilarity?: number;
  readonly now?: string;
}

export class MemoryObservationConsolidator {
  private readonly dirty = new Map<string, { since: string; reason: string }>();

  constructor(private readonly store: MemoryObservationStore) {}

  public markDirty(scopeKey: string, reason: string, at = new Date().toISOString()): void {
    const existing = this.dirty.get(scopeKey);
    if (!existing || at < existing.since) this.dirty.set(scopeKey, { since: at, reason });
  }

  public dirtyScopes(): ReadonlyMap<string, { since: string; reason: string }> {
    return new Map(this.dirty);
  }

  public clearDirty(scopeKey: string): void {
    this.dirty.delete(scopeKey);
  }

  public consolidate(
    inputs: readonly MemoryConsolidationInput[],
    options: MemoryConsolidationOptions = {},
  ): MemoryConsolidationReport[] {
    const grouped = new Map<string, MemoryConsolidationInput[]>();
    for (const input of inputs) {
      const groupKey = input.scope.key + "::" + input.facetKey;
      const list = grouped.get(groupKey) ?? [];
      list.push(input);
      grouped.set(groupKey, list);
      this.markDirty(input.scope.key, "new_memory_retained", input.occurredAt);
    }

    const reports: MemoryConsolidationReport[] = [];
    const threshold = Math.max(0.5, Math.min(1, options.dedupSimilarity ?? 0.9));

    for (const [groupKey, group] of grouped.entries()) {
      const scopeKey = group[0].scope.key;
      let createdCount = 0;
      let updatedCount = 0;
      let contradictedCount = 0;
      let mergedNearDuplicates = 0;
      const observationIds: string[] = [];

      for (const input of [...group].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
        let observation = input.relationToExisting?.observationId
          ? this.store.get(input.relationToExisting.observationId)
          : undefined;

        if (!observation) {
          const sameFacet = this.store
            .list(scopeKey)
            .find((candidate) =>
              candidate.facetKey === input.facetKey &&
              this.similarity(candidate.statement, input.statement) >= threshold,
            );
          observation = sameFacet;
          if (sameFacet) mergedNearDuplicates += 1;
        }

        if (!observation) {
          const now = options.now ?? input.occurredAt;
          const id = "obs_" + createHash("sha256")
            .update(scopeKey + "::" + input.facetKey + "::" + input.statement)
            .digest("hex")
            .slice(0, 20);
          observation = {
            observationId: id,
            scope: input.scope,
            facetKey: input.facetKey,
            statement: input.statement,
            semanticType: "OBSERVATION",
            verificationState: this.observationVerification(input.verificationState),
            authority: this.observationAuthority(input.authority),
            sourceMemoryIds: [input.memoryId],
            evidenceRefs: input.evidenceRefs.map((item) => item.id),
            supportingMemoryIds:
              input.relationToExisting?.type === "CONTRADICTS" ? [] : [input.memoryId],
            contradictingMemoryIds:
              input.relationToExisting?.type === "CONTRADICTS" ? [input.memoryId] : [],
            relationIds: [],
            proofCount: new Set(input.evidenceRefs.map((item) => item.id)).size,
            version: 1,
            history: [{
              version: 1,
              statement: input.statement,
              changedAt: now,
              changeType: "CREATED",
              evidenceRefs: input.evidenceRefs.map((item) => item.id),
            }],
            freshness: {
              state: "FRESH",
              checkedAt: now,
              dirtySince: this.dirty.get(scopeKey)?.since,
              sourceWatermark: input.occurredAt,
            },
            createdAt: now,
            updatedAt: now,
            entityRefs: input.entityRefs,
            sourceHash: input.sourceHash,
          };
          this.store.upsert(observation);
          createdCount += 1;
          observationIds.push(observation.observationId);
          continue;
        }

        const relation = input.relationToExisting?.type ?? "SUPPORTS";
        const sourceIds = new Set(observation.sourceMemoryIds);
        sourceIds.add(input.memoryId);
        const evidenceIds = new Set(observation.evidenceRefs);
        input.evidenceRefs.forEach((evidence) => evidenceIds.add(evidence.id));
        const history: MemoryHistoryEntry[] = [...observation.history];

        let statement = observation.statement;
        let changeType: MemoryHistoryEntry["changeType"] = "REINFORCED";
        let supporting = new Set(observation.supportingMemoryIds);
        let contradicting = new Set(observation.contradictingMemoryIds);

        if (relation === "CONTRADICTS") {
          contradicting.add(input.memoryId);
          contradictedCount += 1;
          changeType = "CONTRADICTED";
          statement = observation.statement + " [later evidence: " + input.statement + "]";
        } else if (relation === "EXTENDS") {
          supporting.add(input.memoryId);
          changeType = "EXTENDED";
          statement = observation.statement + "; " + input.statement;
        } else if (relation === "SUPERSEDES") {
          supporting = new Set([input.memoryId]);
          changeType = "SUPERSEDED";
          statement = input.statement + " (supersedes the prior observation)";
        } else {
          supporting.add(input.memoryId);
          statement = observation.statement;
        }

        const updatedAt = options.now ?? input.occurredAt;
        const next: MemoryObservation = {
          ...observation,
          statement,
          verificationState: this.observationVerification(
            relation === "CONTRADICTS" ? "SUPPORTED" : input.verificationState,
          ),
          sourceMemoryIds: [...sourceIds],
          evidenceRefs: [...evidenceIds],
          supportingMemoryIds: [...supporting],
          contradictingMemoryIds: [...contradicting],
          proofCount: evidenceIds.size,
          version: observation.version + 1,
          history: [
            ...history,
            {
              version: observation.version + 1,
              statement,
              changedAt: updatedAt,
              changeType,
              evidenceRefs: input.evidenceRefs.map((item) => item.id),
            },
          ],
          freshness: {
            state: "FRESH",
            checkedAt: updatedAt,
            sourceWatermark: input.occurredAt,
          },
          updatedAt,
          entityRefs: [...new Set([...(observation.entityRefs ?? []), ...(input.entityRefs ?? [])])],
          sourceHash: input.sourceHash ?? observation.sourceHash,
        };
        this.store.upsert(next);
        updatedCount += 1;
        observationIds.push(next.observationId);
      }

      this.clearDirty(scopeKey);
      reports.push({
        scopeKey,
        inputCount: group.length,
        createdCount,
        updatedCount,
        contradictedCount,
        mergedNearDuplicates,
        observationIds: [...new Set(observationIds)],
      });
    }

    return reports;
  }

  private similarity(left: string, right: string): number {
    const a = new Set(this.tokens(left));
    const b = new Set(this.tokens(right));
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) if (b.has(token)) intersection += 1;
    return intersection / new Set([...a, ...b]).size;
  }

  private tokens(text: string): string[] {
    return text.toLowerCase().split(/[^a-z0-9_:-]+/).filter((token) => token.length >= 2);
  }

  private observationVerification(
    state: MemoryConsolidationInput["verificationState"],
  ): MemoryObservation["verificationState"] {
    if (state === "VERIFIED") return "VERIFIED";
    if (state === "SUPPORTED") return "SUPPORTED";
    if (state === "DISPUTED") return "DISPUTED";
    return state === "INFERRED" ? "INFERRED" : "UNVERIFIED";
  }

  private observationAuthority(
    authority: MemoryConsolidationInput["authority"],
  ): MemoryObservation["authority"] {
    return authority;
  }
}
