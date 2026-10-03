/**
 * ShortForge / FactoryOS — Treasurer Contracts
 *
 * Treasurer is the economic control-plane boundary. These contracts deliberately
 * separate economic permission from capability authorization and physical placement.
 */

export type TreasuryMode = "OPEN" | "DEFENSIVE" | "FROZEN";
export type TreasuryReservationStatus = "ACTIVE" | "SETTLED" | "RELEASED" | "EXPIRED" | "BREACHED";
export type TreasuryPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type TreasuryResourceKind = "COMPUTE" | "INFERENCE" | "STORAGE" | "NETWORK" | "QUOTA";
export type TreasuryLedgerEventType =
  | "TREASURY_COMMAND_ACCEPTED"
  | "RESOURCE_QUOTED"
  | "RESOURCE_RESERVED"
  | "RESERVATION_EXTENDED"
  | "RESOURCE_CONSUMED"
  | "SPEND_RECONCILED"
  | "RESERVATION_RELEASED"
  | "RESERVATION_EXPIRED"
  | "SPEND_DENIED"
  | "BUDGET_BREACH"
  | "TREASURY_FROZEN"
  | "TREASURY_UNFROZEN"
  | "ANOMALY_DETECTED";

export interface TreasuryResourceRequest {
  readonly kind: TreasuryResourceKind;
  readonly quantity?: number;
  readonly unit?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly workloadType?: string;
  readonly requiresGpu?: boolean;
  readonly scarcityUnits?: number;
  readonly verificationRequired?: boolean;
  readonly paidRoute?: boolean;
  readonly metadata?: Record<string, string | number | boolean>;
}

export interface TreasuryBudgetEnvelope {
  readonly maxCostUsd: number;
  readonly maxTokens?: number;
  readonly maxDurationMs?: number;
  readonly maxCapacityUnits?: number;
  readonly maxRetries?: number;
}

export interface TreasuryIssuer {
  readonly authority: "OVERSEER";
  readonly issuerId: string;
}

export interface TreasuryCommand {
  readonly commandId: string;
  readonly overseerCommandId: string;
  readonly issuer: TreasuryIssuer;
  readonly accountId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly floorId?: string;
  readonly taskId?: string;
  readonly attemptId?: string;
  readonly purpose: string;
  readonly resourceRequest: readonly TreasuryResourceRequest[];
  readonly budgetEnvelope: TreasuryBudgetEnvelope;
  readonly priority: TreasuryPriority;
  readonly expiresAt: string;
  readonly idempotencyKey: string;
  readonly scopeDigest: string;
}

export interface TreasuryQuote {
  readonly quoteId: string;
  readonly commandId: string;
  readonly quotedAt: string;
  readonly expiresAt: string;
  readonly upperBoundCostUsd: number;
  readonly upperBoundCapacityUnits: number;
  readonly pricingVersion: string;
  readonly pricingConfidence: "HIGH" | "MEDIUM" | "LOW" | "UNPRICED";
  readonly assumptions: readonly string[];
}

export interface TreasuryReservation {
  readonly reservationId: string;
  readonly commandId: string;
  readonly accountId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly floorId?: string;
  readonly taskId?: string;
  readonly attemptId?: string;
  readonly status: TreasuryReservationStatus;
  readonly reservedCostUsd: number;
  readonly reservedCapacityUnits: number;
  readonly maxTokens?: number;
  readonly maxDurationMs?: number;
  readonly maxRetries?: number;
  readonly verificationRequired: boolean;
  readonly idempotencyKey: string;
  readonly scopeDigest: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly updatedAt: string;
}

export interface TreasuryAccount {
  readonly accountId: string;
  readonly currency: "USD";
  readonly budgetUsd: number;
  readonly availableUsd: number;
  readonly reservedUsd: number;
  readonly settledUsd: number;
  readonly capacityUnits: number;
  readonly availableCapacityUnits: number;
  readonly reservedCapacityUnits: number;
  readonly settledCapacityUnits: number;
  readonly mode: TreasuryMode;
  readonly version: number;
  readonly updatedAt: string;
}

export interface TreasuryConsumption {
  readonly reservationId: string;
  readonly actualCostUsd: number;
  readonly actualCapacityUnits: number;
  readonly actualTokens?: number;
  readonly actualDurationMs?: number;
  readonly executionEvidenceId: string;
  readonly verificationReceiptId?: string;
  readonly verified: boolean;
  readonly measuredAt: string;
}

export interface TreasuryLedgerEvent {
  readonly eventId: string;
  readonly eventType: TreasuryLedgerEventType;
  readonly eventVersion: 1;
  readonly commandId?: string;
  readonly reservationId?: string;
  readonly accountId: string;
  readonly missionId?: string;
  readonly runId?: string;
  readonly floorId?: string;
  readonly taskId?: string;
  readonly amountUsd?: number;
  readonly capacityUnits?: number;
  readonly occurredAt: string;
  readonly actorAuthority: "TREASURER";
  readonly payload: Record<string, unknown>;
}

export interface TreasuryPolicy {
  readonly mode: TreasuryMode;
  readonly maxSingleReservationUsd: number;
  readonly maxSingleCapacityUnits: number;
  readonly defaultReservationTtlMs: number;
  readonly maxReservationTtlMs: number;
  readonly defensiveMaxPriority: TreasuryPriority;
  readonly defensiveMaxReservationUsd: number;
  readonly allowPaidRoutes: boolean;
}

export const DEFAULT_TREASURY_POLICY: TreasuryPolicy = {
  mode: "OPEN",
  maxSingleReservationUsd: 100,
  maxSingleCapacityUnits: 1_000_000,
  defaultReservationTtlMs: 15 * 60 * 1000,
  maxReservationTtlMs: 60 * 60 * 1000,
  defensiveMaxPriority: "NORMAL",
  defensiveMaxReservationUsd: 1,
  allowPaidRoutes: false,
};

export interface TreasuryReport {
  readonly account: TreasuryAccount;
  readonly activeReservations: number;
  readonly recentEvents: readonly TreasuryLedgerEvent[];
  readonly generatedAt: string;
}

export interface TreasuryEconomicPermit {
  readonly permitId: string;
  readonly reservationId: string;
  readonly commandId: string;
  readonly accountId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly floorId?: string;
  readonly taskId?: string;
  readonly attemptId?: string;
  readonly scopeDigest: string;
  readonly maxCostUsd: number;
  readonly maxCapacityUnits: number;
  readonly expiresAt: string;
  readonly issuedAt: string;
  readonly status: "ACTIVE";
}

export interface TreasuryPermitContext {
  readonly jobId: string;
  readonly missionId: string;
  readonly scopeDigest: string;
  readonly accountId: string;
}
