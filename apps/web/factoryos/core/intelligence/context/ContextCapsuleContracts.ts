/**
 * ShortForge / FactoryOS — Context Capsule Contracts
 * Strictly bounded evidence package generated for agent consumption.
 */

import { EvidenceItem } from "../retrieval/RetrievalContracts";

export interface ContextBudgetPolicy {
  readonly maxTokens: number;
  readonly targetLatencyMs?: number;
  readonly prioritizeSource?: "STRUCTURAL" | "KNOWLEDGE" | "RUNTIME" | "HISTORY";
  readonly compactSummaries?: boolean;
}

export interface ContextCapsule {
  readonly taskId: string;
  readonly query: string;
  readonly currentState: Record<string, unknown>;
  readonly relevantEntities: string[];
  readonly keyFacts: string[];
  readonly decisions: string[];
  readonly lessons: string[];
  readonly recentChanges: string[];
  readonly evidence: EvidenceItem[];
  readonly conflicts: string[];
  readonly unknowns: string[];
  readonly provenance: string[];
  readonly budget: {
    readonly maxTokens: number;
    readonly estimatedTokens: number;
    readonly wasTruncated: boolean;
  };
  readonly compiledAt: string;
}

export interface IContextCompiler {
  compile(params: {
    taskId: string;
    query: string;
    evidenceItems: EvidenceItem[];
    currentState?: Record<string, unknown>;
    budgetPolicy?: Partial<ContextBudgetPolicy>;
  }): ContextCapsule;
}
