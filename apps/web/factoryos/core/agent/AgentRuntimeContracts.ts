/**
 * FactoryOS v3 — Agent Runtime Contracts
 * Assimilates clean-room patterns from Octop (agent workspace / harness),
 * WeKnora (sandboxed execution / tools), and Orca (session / checkpoint / supervision).
 *
 * Enforces strict separation:
 * Control Plane (Overseer/Guardian/Slayer/Healer)
 *       vs.
 * Agent Runtime Harness
 *       vs.
 * Floor Execution Agents (F00-F07)
 */

import type { TraceContext } from "../observability/TraceContext";

export type AgentAuthorityLevel =
  | "LEVEL_0_HUMAN"
  | "LEVEL_1_OVERSEER"
  | "LEVEL_2_GUARDIAN"
  | "LEVEL_2_REGULATOR"
  | "LEVEL_3_WORKER";

export interface AgentIdentity {
  readonly agentId: string;
  readonly name: string;
  readonly role: string;
  readonly authorityLevel: AgentAuthorityLevel;
  readonly assignedFloorId?: string;
  readonly allowedCapabilities: readonly string[];
  readonly version: string;
}

export interface ExecutionBudget {
  readonly maxDurationMs: number;
  readonly maxTokens?: number;
  readonly maxCostUsd?: number;
  readonly maxRetries: number;
  readonly leaseFencingToken?: number;
}

export interface AgentSessionCheckpoint {
  readonly checkpointId: string;
  readonly stepIndex: number;
  readonly stateSnapshot: Record<string, unknown>;
  readonly timestamp: string;
}

export interface AgentSession {
  readonly sessionId: string;
  readonly missionId: string;
  readonly agent: AgentIdentity;
  readonly budget: ExecutionBudget;
  readonly status: "INITIALIZED" | "ACTIVE" | "SUSPENDED" | "COMPLETED" | "TERMINATED";
  readonly checkpoints: AgentSessionCheckpoint[];
  readonly traceContext: TraceContext;
  readonly startedAt: string;
  readonly expiresAt: number;
}

export interface AgentInvocationRequest<TInput = Record<string, unknown>> {
  readonly session: AgentSession;
  readonly taskName: string;
  readonly payload: TInput;
  readonly requiredCapability: string;
}

export interface AgentInvocationResult<TOutput = Record<string, unknown>> {
  readonly status: "SUCCESS" | "FAILED" | "BLOCKED" | "TIMEOUT";
  readonly output?: TOutput;
  readonly error?: string;
  readonly evidenceId?: string;
  readonly durationMs: number;
  readonly traceId: string;
  readonly tokensConsumed?: number;
  readonly costUsd?: number;
}
