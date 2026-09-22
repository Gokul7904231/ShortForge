/**
 * FactoryOS v1 — Core Event Contracts
 * Defines authoritative event envelopes, topics, and payloads.
 */

export type EventTopic =
  | "FACTORY_STARTED"
  | "FACTORY_STOPPED"
  | "FACTORY_STATE_CHANGED"
  | "WORKER_HEARTBEAT"
  | "WORKER_FAILED"
  | "WORKER_RECOVERED"
  | "ANOMALY_DETECTED"
  | "CASE_CREATED"
  | "CASE_UPDATED"
  | "CASE_TRIAGED"
  | "SLAYER_ASSIGNED"
  | "SLAYER_REPORT_SUBMITTED"
  | "HEALER_DISPATCHED"
  | "HEALER_STARTED"
  | "ROOT_CAUSE_IDENTIFIED"
  | "REPAIR_STARTED"
  | "REPAIR_COMPLETED"
  | "VERIFICATION_STARTED"
  | "VERIFICATION_PASSED"
  | "VERIFICATION_FAILED"
  | "CASE_RESOLVED"
  | "CASE_ESCALATED"
  | "RUN_STARTED"
  | "RUN_CHECKPOINTED"
  | "RUN_FAILED"
  | "RUN_RECOVERED"
  | "RUN_COMPLETED"
  | "GOAL_CREATED"
  | "GOAL_COMPLETED"
  | "MEMORY_UPDATED"
  | "MISSION_CREATED"
  | "MISSION_STARTED"
  | "MISSION_PAUSED"
  | "MISSION_RESUMED"
  | "MISSION_REPLANNING"
  | "MISSION_BLOCKED"
  | "MISSION_COMPLETING"
  | "MISSION_COMPLETED"
  | "MISSION_FAILED"
  | "MISSION_CANCELLED"
  | "MISSION_TERMINATED"
  | "MISSION_BUDGET_EXCEEDED"
  | "WATCHDOG_HEALTH_SWEEP"
  | "AGENT_QUARANTINED"
  | "AGENT_RECOVERED"
  | "LEASE_RECLAIMED"
  | "SLAYER_ZONE_LOST"
  | "SLAYER_INVESTIGATION_STARTED"
  | "SLAYER_CASE_CREATED"
  | "SLAYER_ANOMALY_CORRELATED"
  | "OVERSEER_PRESENCE_STATE"
  | "USER_MESSAGE"
  | "TASK_COMPLETED"
  | "GUARDIAN_REPORT"
  | "WORKER_QUARANTINED"
  | "WORKLOAD_REBALANCED"
  | "QUEUE_CONGESTION"
  | "GUARDIAN_ESCALATION"
  | "GUARDIAN_HEARTBEAT"
  | "FLOOR_STATUS_CHANGED"
  | "TASK_STARTED"
  | "TASK_PROGRESS"
  | "DELIVERY_COMPLETED"
  | "SITUATION_RECORD_DISPATCHED"
  | "SITUATION_RECORD_CONFLICT";


export interface EventEnvelope<T = Record<string, unknown>> {
  readonly eventId: string;
  readonly topic: EventTopic;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly source: string;
  readonly payload: T;
  readonly schemaVersion: string;
  readonly idempotencyKey?: string;
}

export interface EventAck {
  readonly eventId: string;
  readonly consumerId: string;
  readonly status: "ACK" | "NACK" | "RETRY";
  readonly processedAt: string;
  readonly error?: string;
}
