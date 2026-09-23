/**
 * FactoryOS Frontier v2 — Cognitive Decision Context Contracts
 * Encapsulates the runtime decision context, evidence, and bounds for cognitive reasoning.
 * Enhanced for Project Ascalon with verifiable lifecycle states, worldstate sources,
 * and token accounting fidelity.
 */

import type { AnomalySeverity } from "../contracts/CaseContracts";

export type CognitiveComplexityLevel =
  | "DETERMINISTIC"
  | "FAST"
  | "DELIBERATE"
  | "RLM"
  | "MULTI_AGENT";

export type DecisionLifecycleState =
  | "RECOMMENDED"
  | "AUTHORIZED"
  | "EXECUTED"
  | "OBSERVED"
  | "VERIFIED"
  | "COMMITTED";

export type HypothesisStatus =
  | "HYPOTHESIS"
  | "SUPPORTED_HYPOTHESIS"
  | "VERIFIED_ROOT_CAUSE"
  | "UNKNOWN";

export type AccountingMeasurementStatus = "ACTUAL" | "ESTIMATED" | "UNKNOWN";

export interface IncidentContext {
  readonly incidentId: string;
  readonly caseId?: string;
  readonly floorId?: string;
  readonly target?: string;
  readonly category: string;
  readonly severity: AnomalySeverity;
  readonly symptoms: string[];
  readonly observedMetrics: Record<string, unknown>;
  readonly rawLogs?: string[];
  readonly conflictingClaims?: Array<{ agentId: string; claim: string }>;
  readonly candidateActions?: Array<{ actionId: string; title: string; riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }>;
  readonly worldStateSnapshot?: unknown;
}

export interface CognitiveDecisionResponse {
  readonly incidentId: string;
  readonly complexityLevel: CognitiveComplexityLevel;
  readonly recommendedAction: string;
  readonly candidateActionId?: string;
  readonly confidence: number; // 0.0 to 1.0 (uncalibrated unless backed by empirical evidence)
  readonly rootCauseTheory: string;
  readonly hypothesisStatus?: HypothesisStatus;
  readonly lifecycleState?: DecisionLifecycleState;
  readonly worldStateSource?: "AUTHORITATIVE" | "SIMULATION";
  readonly simulationMetadata?: {
    readonly simulationId: string;
    readonly scenarioId?: string;
    readonly seed?: number;
    readonly worldStateVersion?: string;
  };
  readonly rationale: string; // Safe, user-facing summary (never chain-of-thought)
  readonly evidenceIds: string[];
  readonly memoryMatchesCount: number;
  readonly relevantExperience?: Array<{ readonly experienceId: string; readonly title: string; readonly summary: string }>;
  readonly contradictionResolved: boolean;
  readonly simulationEvaluated: boolean;
  readonly rlmActivated: boolean;
  readonly tokensConsumed: number;
  readonly tokenUsageStatus?: AccountingMeasurementStatus;
  readonly costUsd: number;
  readonly costStatus?: AccountingMeasurementStatus;
  readonly durationMs: number;
  readonly fallbackApplied: boolean;
  readonly trainingEligible?: boolean;
}
