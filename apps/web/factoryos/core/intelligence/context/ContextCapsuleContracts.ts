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

export interface ContextCapsuleV2 {
  readonly contextId: string;
  readonly contextVersion: number;
  readonly contextHash: string; // SHA-256 of canonical serialized payload
  readonly stateVersion: string;
  readonly stateFingerprint: string;
  readonly sourceVersions: Record<string, string>;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly estimatedTokens: number;
  readonly actualTokens?: number;
  readonly truncated: boolean;
  readonly redactionState: "CLEAN" | "REDACTED";
  readonly payload: Record<string, unknown>;
}

export interface IContextCompiler {
  compile(params: {
    taskId: string;
    query: string;
    evidenceItems: EvidenceItem[];
    currentState?: Record<string, unknown>;
    budgetPolicy?: Partial<ContextBudgetPolicy>;
  }): ContextCapsule;

  compileV2(params: {
    taskId: string;
    query: string;
    evidenceItems: EvidenceItem[];
    currentState?: Record<string, unknown>;
    stateVersion?: string;
    sourceVersions?: Record<string, string>;
    budgetPolicy?: Partial<ContextBudgetPolicy>;
  }): ContextCapsuleV2;
}
