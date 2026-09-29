import type { EpistemicBudget, EpistemicUsage } from "./EpistemicContracts";

export class EpistemicBudgetController {
  constructor(private readonly budget: EpistemicBudget) {
    if (budget.maxEpistemicTimeMs < 0) throw new Error("[AER] maxEpistemicTimeMs cannot be negative.");
    if (budget.maxDeepCalls < 0 || budget.maxMicroCalls < 0) {
      throw new Error("[AER] cognition call limits cannot be negative.");
    }
    if (budget.maxProbeCount < 0 || budget.maxCostUnits < 0) {
      throw new Error("[AER] probe budget cannot be negative.");
    }
  }

  public getBudget(): EpistemicBudget {
    return this.budget;
  }

  public isWithinBudget(usage: EpistemicUsage): boolean {
    return (
      usage.elapsedMs <= this.budget.maxEpistemicTimeMs &&
      usage.deepCalls <= this.budget.maxDeepCalls &&
      usage.microCalls <= this.budget.maxMicroCalls &&
      usage.probesExecuted <= this.budget.maxProbeCount &&
      usage.costUnits <= this.budget.maxCostUnits
    );
  }

  public canUseDeep(usage: EpistemicUsage): boolean {
    return this.isWithinBudget(usage) && usage.deepCalls < this.budget.maxDeepCalls;
  }

  public canUseMicro(usage: EpistemicUsage): boolean {
    return this.isWithinBudget(usage) && usage.microCalls < this.budget.maxMicroCalls;
  }

  public canRunProbe(usage: EpistemicUsage, probeCostUnits: number): boolean {
    return (
      this.isWithinBudget(usage) &&
      usage.probesExecuted < this.budget.maxProbeCount &&
      usage.costUnits + probeCostUnits <= this.budget.maxCostUnits
    );
  }

  public assertWithinBudget(usage: EpistemicUsage, reason = "AER budget exceeded"): void {
    if (!this.isWithinBudget(usage)) throw new Error(`[AER] ${reason}.`);
  }
}
