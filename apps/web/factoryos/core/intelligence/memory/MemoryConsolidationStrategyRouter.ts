import type { MemoryScope } from "./MemorySemanticsContracts";

export interface MemoryConsolidationStrategyRule {
  readonly tags: readonly string[];
  readonly tagsMatch?: "all" | "exact";
}

export interface MemoryConsolidationStrategy {
  readonly id: string;
  readonly scopes: readonly MemoryConsolidationStrategyRule[];
  readonly observationsMission?: string;
  readonly maxObservationsPerScope?: number;
  readonly sourceFactsMaxTokens?: number;
  readonly sourceFactsMaxTokensPerObservation?: number;
}

export interface ResolvedMemoryConsolidationStrategy {
  readonly strategyId: string;
  readonly matchedRule?: MemoryConsolidationStrategyRule;
  readonly observationsMission?: string;
  readonly maxObservationsPerScope?: number;
  readonly sourceFactsMaxTokens?: number;
  readonly sourceFactsMaxTokensPerObservation?: number;
}

export class MemoryConsolidationStrategyRouter {
  constructor(
    private readonly strategies: readonly MemoryConsolidationStrategy[],
  ) {}

  /** First matching strategy wins as a whole. */
  public resolve(scope: MemoryScope): ResolvedMemoryConsolidationStrategy | null {
    for (const strategy of this.strategies) {
      for (const rule of strategy.scopes) {
        if (this.matches(rule, scope.tags ?? [])) {
          return {
            strategyId: strategy.id,
            matchedRule: rule,
            observationsMission: strategy.observationsMission,
            maxObservationsPerScope: strategy.maxObservationsPerScope,
            sourceFactsMaxTokens: strategy.sourceFactsMaxTokens,
            sourceFactsMaxTokensPerObservation: strategy.sourceFactsMaxTokensPerObservation,
          };
        }
      }
    }
    return null;
  }

  private matches(rule: MemoryConsolidationStrategyRule, tags: readonly string[]): boolean {
    const required = [...rule.tags];
    const actual = [...tags];
    const mode = rule.tagsMatch ?? "all";

    if (mode === "exact") {
      return required.length === actual.length && required.every((pattern) =>
        actual.some((tag) => this.matchPattern(pattern, tag)),
      );
    }

    return required.every((pattern) =>
      actual.some((tag) => this.matchPattern(pattern, tag)),
    );
  }

  private matchPattern(pattern: string, value: string): boolean {
    const escaped = pattern
      .replace(/[.+?^()|[\\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp("^" + escaped + "$").test(value);
  }
}
