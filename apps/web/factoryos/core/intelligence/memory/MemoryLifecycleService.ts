import type { KnowledgeDocument } from "../knowledge/OKFContracts";
import {
  MemoryObservationConsolidator,
  InMemoryMemoryObservationStore,
  type MemoryObservationStore,
} from "./MemoryObservationConsolidator";
import { MemoryRetrievalEngine } from "./MemoryRetrievalEngine";
import { MemoryProvenanceGuard } from "./MemoryProvenanceGuard";
import { MemoryReflectionEngine } from "./MemoryReflectionEngine";
import { MemoryConsolidationStrategyRouter } from "./MemoryConsolidationStrategyRouter";
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
  private readonly mentalModels: MemoryMentalModelManager;

  constructor(
    private readonly documentSource: () => readonly KnowledgeDocument[],
    observationStore: MemoryObservationStore = new InMemoryMemoryObservationStore(),
    retrievalEngine = new MemoryRetrievalEngine(),
    strategyRouter = new MemoryConsolidationStrategyRouter([]),
    mentalModelManager = new MemoryMentalModelManager(),
  ) {
    this.observationConsolidator = new MemoryObservationConsolidator(observationStore, strategyRouter);
    this.mentalModels = mentalModelManager;
    this.retrievalEngine = retrievalEngine;
  }

  public async retain(input: MemoryConsolidationInput): Promise<MemoryConsolidationInput> {
    this.validateRetention(input);
    if (this.isNonDurable(input)) return input;
    await this.observationConsolidator.consolidate([input]);
    return input;
  }

  public async retainMany(inputs: readonly MemoryConsolidationInput[]): Promise<readonly MemoryConsolidationInput[]> {
    inputs.forEach((input) => this.validateRetention(input));
    const durable = inputs.filter((input) => !this.isNonDurable(input));
    if (durable.length > 0) await this.observationConsolidator.consolidate(durable);
    return durable;
  }

  private validateRetention(input: MemoryConsolidationInput): void {
    if (!input.memoryId.trim()) throw new Error("[MemoryLifecycle] memoryId is required");
    if (!input.scope.key.trim()) throw new Error("[MemoryLifecycle] scope key is required");
    if (!input.statement.trim()) throw new Error("[MemoryLifecycle] statement is required");
  }

  private isNonDurable(input: MemoryConsolidationInput): boolean {
    return input.retentionClass === "DO_NOT_LEARN" || input.retentionClass === "TEMPORARY";
  }

  public async consolidate(
    inputs: readonly MemoryConsolidationInput[],
  ): Promise<readonly MemoryConsolidationReport[]> {
    return this.observationConsolidator.consolidate(inputs);
  }

  public async recall(query: MemoryRecallQuery): Promise<MemoryRecallResult> {
    if (!query.accessContext) {
      throw new Error("[MemoryLifecycle] accessContext is required for trusted recall");
    }
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
