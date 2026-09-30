import type { MemoryMentalModel } from "./MemorySemanticsContracts";

export interface MemoryMentalModelStore {
  get(modelId: string): MemoryMentalModel | undefined;
  list(scopeKey?: string): readonly MemoryMentalModel[];
  upsert(model: MemoryMentalModel): void | Promise<void>;
}

export class InMemoryMemoryMentalModelStore implements MemoryMentalModelStore {
  private readonly models = new Map<string, MemoryMentalModel>();

  public get(modelId: string): MemoryMentalModel | undefined {
    return this.models.get(modelId);
  }

  public list(scopeKey?: string): readonly MemoryMentalModel[] {
    const values = [...this.models.values()];
    return scopeKey ? values.filter((model) => model.scope.key === scopeKey) : values;
  }

  public upsert(model: MemoryMentalModel): void {
    this.models.set(model.modelId, model);
  }
}
