import type { KnowledgeDocument } from "../knowledge/OKFContracts";
import {
  MemoryObservationConsolidator,
  InMemoryMemoryObservationStore,
  type MemoryObservationStore,
} from "./MemoryObservationConsolidator";
import { MemoryRetrievalEngine } from "./MemoryRetrievalEngine";
import { MemoryProvenanceGuard } from "./MemoryProvenanceGuard";
import { MemoryReflectionEngine } from "./MemoryReflectionEngine";
import { MemoryMentalModelManager } from "./MemoryMentalModelManager";
import type {
  MemoryConsolidationInput,
  MemoryConsolidationReport,
  MemoryMentalModel,
  MemoryRecallQuery,
  MemoryRecallResult,
  MemoryReflectionRequest,
  MemoryReflectionResult,
} from "./MemorySemanticsContracts";

export class MemoryLifecycleService {
  private readonly observationConsolidator: MemoryObservationConsolidator;
  private readonly retrievalEngine: MemoryRetrievalEngine;
  private readonly provenanceGuard = new MemoryProvenanceGuard();
  private readonly reflectionEngine = new MemoryReflectionEngine();
  private readonly mentalModels = new MemoryMentalModelManager();

  constructor(
    private readonly documentSource: () => readonly KnowledgeDocument[],
    observationStore: MemoryObservationStore = new InMemoryMemoryObservationStore(),
    retrievalEngine = new MemoryRetrievalEngine(),
  ) {
    this.observationConsolidator = new MemoryObservationConsolidator(observationStore);
    this.retrievalEngine = retrievalEngine;
  }

  public retain(input: MemoryConsolidationInput): MemoryConsolidationInput {
    if (!input.memoryId.trim()) throw new Error("[MemoryLifecycle] memoryId is required");
    if (!input.scope.key.trim()) throw new Error("[MemoryLifecycle] scope key is required");
    if (!input.statement.trim()) throw new Error("[MemoryLifecycle] statement is required");
    // Retain is intentionally permissive: retention records experience/evidence;
    // verification happens later at the existing MemoryWriter/promotion boundary.
    this.observationConsolidator.markDirty(input.scope.key, "memory_retained", input.occurredAt);
    return input;
  }

  public async consolidate(
    inputs: readonly MemoryConsolidationInput[],
  ): Promise<readonly MemoryConsolidationReport[]> {
    return this.observationConsolidator.consolidate(inputs);
  }

  public async recall(query: MemoryRecallQuery): Promise<MemoryRecallResult> {
    const raw = await this.retrievalEngine.recall(this.documentSource(), query);
    const guarded = this.provenanceGuard.inspect(query, raw.items);
    const accepted = guarded.accepted;
    return {
      ...raw,
      stale: accepted.some((item) => item.stale),
      staleReason: accepted.find((item) => item.stale)?.freshness.reason,
      items: accepted,
    };
  }

  public reflect(
    request: MemoryReflectionRequest,
    models: readonly MemoryMentalModel[],
    observations: MemoryRecallResult,
    rawEvidence: MemoryRecallResult,
  ): MemoryReflectionResult {
    return this.reflectionEngine.buildContext(
      request,
      models,
      observations.items,
      rawEvidence.items,
    );
  }

  public getMentalModelManager(): MemoryMentalModelManager {
    return this.mentalModels;
  }

  public getObservationConsolidator(): MemoryObservationConsolidator {
    return this.observationConsolidator;
  }
}
