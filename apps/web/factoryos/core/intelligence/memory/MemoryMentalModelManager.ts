import { createHash } from "node:crypto";
import type {
  MemoryMentalModel,
  MemoryMentalModelRefreshPlan,
  MemoryObservation,
  MemoryRefreshMode,
  MemoryScope,
  MemorySemanticType,
} from "./MemorySemanticsContracts";
import { InMemoryMemoryMentalModelStore, type MemoryMentalModelStore } from "./MemoryMentalModelStore";

export interface CreateMentalModelInput {
  readonly key?: string;
  readonly question: string;
  readonly scope: MemoryScope;
  readonly semanticType?: "MENTAL_MODEL" | "KNOWLEDGE_PAGE";
  readonly content?: string;
  readonly sourceObservationIds?: readonly string[];
  readonly evidenceRefs?: readonly string[];
  readonly refreshMode?: MemoryRefreshMode;
  readonly refreshAfterConsolidation?: boolean;
  readonly refreshCron?: string;
  readonly minRefreshIntervalSeconds?: number;
  readonly sourceFactTypes?: readonly MemorySemanticType[];
  readonly excludeSiblingModels?: boolean;
  readonly recallMaxTokens?: number;
}

export class MemoryMentalModelManager {
  constructor(
    private readonly store: MemoryMentalModelStore = new InMemoryMemoryMentalModelStore(),
  ) {}

  public async create(input: CreateMentalModelInput): Promise<MemoryMentalModel> {
    if (input.refreshAfterConsolidation && input.refreshCron) {
      throw new Error("[MemoryMentalModel] refreshAfterConsolidation and refreshCron are mutually exclusive");
    }

    const now = new Date().toISOString();
    const modelId =
      input.key ||
      "mm_" +
        createHash("sha256")
          .update(input.scope.key + "::" + input.question)
          .digest("hex")
          .slice(0, 20);

    if (this.store.get(modelId)) {
      throw new Error("[MemoryMentalModel] model already exists: " + modelId);
    }

    const model: MemoryMentalModel = {
      modelId,
      key: modelId,
      question: input.question,
      scope: input.scope,
      semanticType: input.semanticType ?? "MENTAL_MODEL",
      content: input.content ?? "",
      sourceObservationIds: [...(input.sourceObservationIds ?? [])],
      evidenceRefs: [...(input.evidenceRefs ?? [])],
      verificationState: input.evidenceRefs?.length ? "SUPPORTED" : "UNVERIFIED",
      authority: "MODEL_ADVISORY",
      refreshMode: input.refreshMode ?? "FULL",
      refreshAfterConsolidation: input.refreshAfterConsolidation ?? false,
      refreshCron: input.refreshCron,
      minRefreshIntervalSeconds: Math.max(0, input.minRefreshIntervalSeconds ?? 3600),
      sourceFactTypes: [...(input.sourceFactTypes ?? ["OBSERVATION", "WORLD_FACT", "EXPERIENCE"])],
      excludeSiblingModels: input.excludeSiblingModels ?? true,
      recallMaxTokens: Math.max(64, input.recallMaxTokens ?? 1200),
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.upsert(model);
    return model;
  }

  public get(modelId: string): MemoryMentalModel | undefined {
    return this.store.get(modelId);
  }

  public list(scopeKey?: string): readonly MemoryMentalModel[] {
    return this.store.list(scopeKey);
  }

  public async markDirty(modelId: string, reason: string, at = new Date().toISOString()): Promise<MemoryMentalModel> {
    const model = this.require(modelId);
    return this.update(modelId, {
      dirtySince: model.dirtySince && model.dirtySince < at ? model.dirtySince : at,
      dirtyReason: reason,
    });
  }

  public shouldRefresh(modelId: string, nowMs = Date.now()): boolean {
    const model = this.require(modelId);
    if (!model.dirtySince) return false;
    if (!model.lastRefreshedAt) return true;
    const nextEligibleAt = Date.parse(model.lastRefreshedAt) + model.minRefreshIntervalSeconds * 1000;
    return nowMs >= nextEligibleAt;
  }

  public buildRefreshPlan(
    modelId: string,
    observations: readonly MemoryObservation[],
    nowMs = Date.now(),
  ): MemoryMentalModelRefreshPlan {
    const model = this.require(modelId);
    if (!model.dirtySince) {
      return {
        modelId,
        eligible: false,
        reason: "model_not_dirty",
        mode: model.refreshMode,
        sourceObservationIds: model.sourceObservationIds,
        sourceFactTypes: model.sourceFactTypes,
        excludeSiblingModels: model.excludeSiblingModels,
        maxTokens: model.recallMaxTokens,
      };
    }
    if (!this.shouldRefresh(modelId, nowMs)) {
      return {
        modelId,
        eligible: false,
        reason: "refresh_throttled_by_min_interval",
        mode: model.refreshMode,
        sourceObservationIds: model.sourceObservationIds,
        sourceFactTypes: model.sourceFactTypes,
        excludeSiblingModels: model.excludeSiblingModels,
        maxTokens: model.recallMaxTokens,
      };
    }

    const scoped = observations
      .filter((observation) => observation.scope.key === model.scope.key)
      .filter((observation) => model.sourceFactTypes.includes(observation.semanticType));

    return {
      modelId,
      eligible: true,
      reason: "dirty_scope_is_refresh_eligible",
      mode: model.refreshMode,
      sourceObservationIds: scoped.map((observation) => observation.observationId),
      sourceFactTypes: model.sourceFactTypes,
      excludeSiblingModels: model.excludeSiblingModels,
      maxTokens: model.recallMaxTokens,
    };
  }

  public async applyRefresh(input: {
    readonly modelId: string;
    readonly content: string;
    readonly sourceObservationIds: readonly string[];
    readonly evidenceRefs: readonly string[];
    readonly now?: string;
  }): Promise<MemoryMentalModel> {
    if (!input.content.trim()) throw new Error("[MemoryMentalModel] refresh content is required");
    const model = this.require(input.modelId);
    const now = input.now ?? new Date().toISOString();
    return this.update(input.modelId, {
      content: input.content,
      sourceObservationIds: [...new Set(input.sourceObservationIds)],
      evidenceRefs: [...new Set(input.evidenceRefs)],
      verificationState: input.evidenceRefs.length ? "SUPPORTED" : "UNVERIFIED",
      version: model.version + 1,
      lastRefreshedAt: now,
      dirtySince: undefined,
      dirtyReason: undefined,
    });
  }

  public sourceSetForRefresh(modelId: string, observations: readonly MemoryObservation[]): readonly MemoryObservation[] {
    const model = this.require(modelId);
    return observations
      .filter((observation) => observation.scope.key === model.scope.key)
      .filter((observation) => model.sourceFactTypes.includes(observation.semanticType));
  }

  private async update(modelId: string, patch: Partial<MemoryMentalModel>): Promise<MemoryMentalModel> {
    const current = this.require(modelId);
    const next: MemoryMentalModel = {
      ...current,
      ...patch,
      modelId: current.modelId,
      key: current.key,
      question: current.question,
      scope: current.scope,
      semanticType: current.semanticType,
      authority: "MODEL_ADVISORY",
      updatedAt: new Date().toISOString(),
    };
    await this.store.upsert(next);
    return next;
  }

  private require(modelId: string): MemoryMentalModel {
    const model = this.store.get(modelId);
    if (!model) throw new Error("[MemoryMentalModel] unknown model: " + modelId);
    return model;
  }
}
