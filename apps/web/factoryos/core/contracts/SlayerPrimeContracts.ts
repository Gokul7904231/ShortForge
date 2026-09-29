/**
 * FactoryOS — Slayer Prime contracts.
 *
 * Prime is the enforcement control plane beneath Guardian authorization.
 * Durable leadership epochs prevent split-brain; action fencing prevents stale
 * replicas from mutating newer leases; intent identities prevent duplicate actions.
 */

import type { AnomalyObservation } from "./SlayerContracts";

export type SlayerPrimeIncidentState =
  | "OBSERVED" | "ANOMALOUS" | "CONFIRMING" | "INCIDENT_OPEN"
  | "INVESTIGATING" | "CORRELATED" | "ACTION_ELIGIBLE"
  | "AUTHORIZATION_PENDING" | "AUTHORIZED" | "ACTION_RESERVED"
  | "CONTAINING" | "CONTAINED" | "HANDOFF" | "VERIFYING" | "CLOSED"
  | "UNKNOWN" | "CONFLICTED" | "STALE" | "DENIED" | "QUARANTINED"
  | "ACTION_FAILED" | "VERIFICATION_FAILED" | "ESCALATED";

export type SlayerPrimeAction =
  | "OBSERVE" | "PROTECT" | "CONTAIN" | "FENCE" | "REVOKE_LEASE"
  | "ISOLATE" | "TERMINATE" | "FLOOR_HALT" | "FACTORY_HALT";

export type SlayerPrimeScope =
  | "WORKER" | "TASK" | "QUEUE" | "RESOURCE_POOL" | "PROVIDER"
  | "FLOOR" | "FACTORY";

export type SlayerEvidenceClass =
  | "HEARTBEAT" | "LEASE" | "RUNTIME_STATE" | "TELEMETRY" | "TRACE"
  | "ARTIFACT" | "KERNEL" | "AUTHORITY";

export type SlayerEvidenceTrust = "TRUSTED" | "DEGRADED" | "UNTRUSTED";

export interface SlayerPrimeEvidence {
  readonly evidenceId: string;
  readonly evidenceClass: SlayerEvidenceClass;
  readonly sourceId: string;
  readonly subjectId: string;
  readonly observedAt: string;
  readonly expiresAt?: string;
  readonly trust: SlayerEvidenceTrust;
  readonly trustScore: number;
  readonly independenceKey: string;
  readonly value: Record<string, unknown>;
  readonly notes?: string;
}

export interface SlayerEvidenceQuorumPolicy {
  readonly action: SlayerPrimeAction;
  readonly requiredEvidenceClasses: SlayerEvidenceClass[];
  readonly minIndependentClasses: number;
  readonly minTrustScore: number;
  readonly maxEvidenceAgeMs: number;
}

export interface SlayerIncident {
  readonly incidentId: string;
  readonly fingerprint: string;
  readonly state: SlayerPrimeIncidentState;
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly floorId: string;
  readonly targetId: string;
  readonly category: string;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly observationIds: string[];
  readonly evidence: SlayerPrimeEvidence[];
  readonly relatedCaseIds: string[];
  readonly suggestedAction?: SlayerPrimeAction;
  readonly suggestedScope?: SlayerPrimeScope;
  readonly actionIntentIds: string[];
  readonly notes: string[];
  /** Highest Prime leadership epoch whose writer committed this incident state. */
  readonly persistenceEpoch?: number;
}

export interface SlayerActionIntent {
  readonly intentId: string;
  /** Stable cross-replica identity for the same logical action proposal. */
  readonly dedupeKey: string;
  readonly incidentId: string;
  readonly action: SlayerPrimeAction;
  readonly scope: SlayerPrimeScope;
  readonly targetId: string;
  readonly proposedBy: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly parameters: Record<string, unknown>;
}

export type SlayerAuthorizationRole = "GUARDIAN" | "HUMAN_AUTHORITY";

export interface SlayerAuthorizationGrant {
  readonly grantId: string;
  readonly incidentId: string;
  readonly action: SlayerPrimeAction;
  readonly scope: SlayerPrimeScope;
  readonly targetId: string;
  readonly authorizedBy: string;
  readonly authorizedRole: SlayerAuthorizationRole;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly fencingEpoch?: number;
  readonly evidenceRefs: string[];
  readonly reason: string;
}

export interface SlayerActionLease {
  readonly actionLeaseId: string;
  readonly intentId: string;
  readonly incidentId: string;
  readonly action: SlayerPrimeAction;
  readonly targetId: string;
  readonly holderId: string;
  /** Monotonic action fence. Never reused after a new reservation. */
  readonly fencingToken: number;
  /** Prime leadership generation present when the action was reserved. */
  readonly leadershipEpoch?: number;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly status: "ACTIVE" | "RELEASED" | "EXPIRED";
}

export interface SlayerContainmentProof {
  readonly proofId: string;
  readonly actionLeaseId: string;
  readonly action: SlayerPrimeAction;
  readonly targetId: string;
  readonly expectedPostcondition: string;
  readonly observedPostcondition: Record<string, unknown>;
  readonly verified: boolean;
  readonly verifiedAt: string;
  readonly verifier: string;
}

export interface SlayerEnforcementReceipt {
  readonly receiptId: string;
  readonly intentId: string;
  readonly incidentId: string;
  readonly action: SlayerPrimeAction;
  readonly scope: SlayerPrimeScope;
  readonly targetId: string;
  readonly actionLeaseId?: string;
  readonly fencingToken?: number;
  readonly leadershipEpoch?: number;
  readonly status:
    | "AUTHORIZED" | "REJECTED" | "STALE_ACTION" | "EXECUTED"
    | "EXECUTING" | "UNKNOWN" | "VERIFIED" | "FAILED" | "VERIFICATION_FAILED";
  readonly reason: string;
  readonly executionStartedAt: string;
  readonly executionFinishedAt: string;
  readonly details: Record<string, unknown>;
  readonly containmentProof?: SlayerContainmentProof;
}

export interface SlayerEnforcementAdapter {
  readonly adapterId: string;
  supports(action: SlayerPrimeAction): boolean;
  execute(
    intent: SlayerActionIntent,
    authorization: SlayerAuthorizationGrant,
    lease: SlayerActionLease
  ): Promise<Record<string, unknown>>;
  verify(
    intent: SlayerActionIntent,
    authorization: SlayerAuthorizationGrant,
    lease: SlayerActionLease,
    executionDetails: Record<string, unknown>
  ): Promise<{
    verified: boolean;
    reason: string;
    observedPostcondition: Record<string, unknown>;
  }>;
}

export interface SlayerPrimeOptions {
  readonly instanceId?: string;
  readonly actionLeaseTtlMs?: number;
  readonly incidentTtlMs?: number;
  readonly maxIncidents?: number;
  readonly maxEvidencePerIncident?: number;
  readonly adapters?: SlayerEnforcementAdapter[];
  readonly stateStore?: import("../slayers/prime/SlayerPrimeStateStore").SlayerPrimeStateStore;
  readonly leadershipLeaseTtlMs?: number;
  readonly leadershipRenewIntervalMs?: number;
}

export interface SlayerPrimeObservationInput {
  readonly observation: AnomalyObservation;
  readonly sourceId?: string;
  readonly evidence?: SlayerPrimeEvidence[];
  readonly relatedCaseId?: string;
}
