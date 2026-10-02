/**
 * FactoryOS Wave 4 — Agent Intercom & Governed Delegation Contracts
 *
 * Durable team-agent communication built on Comms Fabric v2.
 * Intercom carries requests, responses and handoffs; it does not grant execution authority.
 */

import type {
  CommsCapability,
  CommsDelivery,
  CommsDeliveryReceipt,
  CommsEnvelope,
  CommsLane,
  CommsPeerHello,
  CommsPrincipal,
  CommsSessionState,
} from "./CommsFabric";

export type AgentIntercomKind = "MESSAGE" | "DELEGATION_REQUEST" | "DELEGATION_RESPONSE";
export type AgentDelegationState = "REQUESTED" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
export type AgentIntercomDeliveryState =
  | "CREATED"
  | "ADMITTED"
  | "QUEUED"
  | "DISPATCHED"
  | "DELIVERED"
  | "ACKED"
  | "RETRYING"
  | "NACKED"
  | "EXPIRED"
  | "CANCELLED"
  | "DEAD_LETTERED";

export interface AgentIntercomPayload {
  readonly kind: AgentIntercomKind;
  readonly text: string;
  readonly taskId?: string;
  readonly delegationId?: string;
  readonly objective?: string;
  readonly requiredCapability?: string;
  readonly context?: Record<string, unknown>;
  readonly responseToDelegationId?: string;
}

export interface AgentIntercomMessage {
  readonly intercomId: string;
  readonly envelope: CommsEnvelope<AgentIntercomPayload>;
  readonly deliveryState: AgentIntercomDeliveryState;
  readonly maxAttempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly receipt: CommsDeliveryReceipt;
}

export interface AgentDelegationRequest {
  readonly delegationId: string;
  readonly missionId: string;
  readonly floorId?: string;
  readonly source: CommsPrincipal;
  readonly target: CommsPrincipal;
  readonly taskId?: string;
  readonly objective: string;
  readonly requiredCapability?: string;
  readonly context?: Record<string, unknown>;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly state: AgentDelegationState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly version: number;
}

export interface AgentIntercomAuth {
  readonly principal: CommsPrincipal;
  readonly allowedMissionIds: readonly string[];
  readonly allowedFloorIds?: readonly string[];
  readonly allowedLanes: readonly CommsLane[];
  readonly allowedKinds: readonly AgentIntercomKind[];
  readonly allowedCapabilities: readonly CommsCapability[];
  readonly allowedTargetPrincipals?: readonly string[];
  readonly allowBroadcast?: boolean;
}

export interface AgentIntercomSendInput {
  readonly missionId: string;
  readonly floorId?: string;
  readonly target: CommsPrincipal;
  readonly text: string;
  readonly taskId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly idempotencyKey?: string;
  readonly delivery?: CommsDelivery;
  readonly priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  readonly ttlMs?: number;
  readonly maxAttempts?: number;
}

export interface AgentDelegationCreateInput {
  readonly missionId: string;
  readonly floorId?: string;
  readonly target: CommsPrincipal;
  readonly objective: string;
  readonly requiredCapability?: string;
  readonly taskId?: string;
  readonly context?: Record<string, unknown>;
  readonly ttlMs?: number;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export interface AgentIntercomSession {
  readonly missionId: string;
  readonly hello: CommsPeerHello;
  readonly state: CommsSessionState;
  readonly lastSeenAt: string;
  readonly version: number;
}

export interface AgentIntercomSnapshot {
  readonly missionId: string;
  readonly messages: AgentIntercomMessage[];
  readonly delegations: AgentDelegationRequest[];
  readonly sessions: AgentIntercomSession[];
  readonly nextReplayCursor?: string;
}

export interface AgentIntercomReplayPage {
  readonly items: AgentIntercomMessage[];
  readonly nextCursor?: string;
}
