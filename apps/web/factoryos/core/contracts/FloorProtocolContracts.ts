/**
 * FactoryOS v3 — Canonical Floor Protocol Contracts
 * Defines authenticated command and handoff envelopes for 8-Floor DAG executions.
 */

import type { FloorId } from "../hierarchy/FloorTypes";

export type { FloorId };

export type FloorExecutionStatus =
  | "PENDING"
  | "STARTING"
  | "RUNNING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "REPAIR_REQUIRED"
  | "REPAIRED"
  | "CANCELLED";

export type ExecutionInitiator =
  | "user"
  | "overseer"
  | "guardian"
  | "retry"
  | "healer"
  | "slayer"
  | "system"
  | "manual-admin"
  | "system-recovery";

export interface SecurityContext {
  readonly userId: string;
  readonly jobId: string;
  readonly missionId: string;
  readonly floorId: FloorId | string;
  readonly executionId: string;
  readonly parentExecutionId?: string;
  readonly attempt: number;
  readonly executionToken: string;
  readonly initiatedBy: ExecutionInitiator;
}

export interface FloorCommandEnvelope<T = Record<string, unknown>> {
  readonly commandId: string;
  readonly commandType: "StartFloor" | "CancelFloor" | "RepairFloor";
  readonly security: SecurityContext;
  readonly payload: T;
  readonly timestamp: string;
  readonly nonce: string;
  readonly schemaVersion: string;
  readonly signature?: string;
}

export interface FloorHandoffEnvelope<T = Record<string, unknown>> {
  readonly handoffId: string;
  readonly security: SecurityContext;
  readonly status: "SUCCESS" | "FAILED" | "DEGRADED" | "REPAIR_REQUIRED";
  readonly outputArtifact?: T;
  readonly complianceScore?: number;
  readonly invariants?: Record<string, boolean>;
  readonly errors?: string[];
  readonly executionTimeMs: number;
  readonly timestamp: string;
  readonly nonce: string;
  readonly schemaVersion: string;
  readonly signature?: string;
}
