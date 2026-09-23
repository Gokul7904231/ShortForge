/**
 * FactoryOS v1 — Capability & Agent Contracts
 * Defines catalog, request, and result contracts for Slayers, Healers, and Instructor.
 */

import type { ExecutionInitiator } from "./FloorProtocolContracts";

export type CapabilityType =
  | "SLAYER"
  | "HEALER"
  | "INSTRUCTOR"
  | "VALIDATOR"
  | "BROWSER"
  | "RESEARCH"
  | "ANALYSIS"
  | "VOICE"
  | "VISUAL"
  | "RENDER"
  | "CODE"
  | "FORECAST";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SecurityClassification = "PUBLIC" | "INTERNAL" | "RESTRICTED" | "CONFIDENTIAL";

export interface CapabilityPolicyBoundary {
  readonly allowedRoles: string[];
  readonly allowedFloors: string[];
  readonly environments: ("development" | "staging" | "production" | "test")[];
  readonly networkAccess: "NONE" | "RESTRICTED" | "FULL";
  readonly dataAccess: "READ_ONLY" | "READ_WRITE" | "ISOLATED";
  readonly secretRequirements: string[];
  readonly consentRequirements?: string[];
  readonly securityClass: SecurityClassification;
  readonly commercialUsageAllowed: boolean;
  readonly auditPolicy: "LOG_ONLY" | "EVIDENCE_REQUIRED" | "NON_REPUDIATION";
}

export type CapabilityImplementationStatus =
  | "IMPLEMENTED"
  | "PARTIAL"
  | "MOCK"
  | "UNVERIFIED"
  | "BROKEN"
  | "DEPRECATED"
  | "TARGET"
  | "EXTERNAL"
  | "PROTOTYPE";

export interface CapabilityMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly type: CapabilityType;
  readonly targetAnomalies: string[];
  readonly riskLevel: RiskLevel;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly requiresGuardianGate: boolean;
  readonly implementationStatus?: CapabilityImplementationStatus;
  readonly isProductionRoutable?: boolean;
  readonly executionClass?: "PRODUCTION" | "PROTOTYPE" | "UNVERIFIED";
  readonly provider?: string;
  readonly runtime?: "node" | "python" | "browser" | "binary";
  readonly inputSchema?: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
  readonly health?: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly latencyMs?: number;
  readonly costPerInvocationUsd?: number;
  readonly qualityRating?: number;
  readonly fallbackCapabilityId?: string;
  readonly licenseMetadata?: {
    readonly spdx: string;
    readonly copyleft: boolean;
    readonly commercialPermitted: boolean;
  };
  readonly provenance?: {
    readonly sourceRepo?: string;
    readonly adoptionMode: "DIRECT_DEPENDENCY" | "ISOLATED_PROVIDER" | "CLEAN_ROOM_REIMPLEMENTATION" | "CONCEPT_ONLY";
    readonly documentedAt: string;
  };
  readonly policy?: CapabilityPolicyBoundary;
  readonly trainingEligibility?: "ELIGIBLE" | "INELIGIBLE" | "PENDING_REVIEW";
}

export interface CapabilityExecutionRequest<T = Record<string, unknown>> {
  readonly requestExecutionId: string;
  readonly capabilityId: string;
  readonly missionId: string;
  readonly jobId: string;
  readonly floorId?: string;
  readonly anomalyType?: string;
  readonly symptoms?: string[];
  readonly inputData: T;
  readonly initiatedBy: ExecutionInitiator;
  readonly timestamp: string;
  readonly callerRole?: string;
  readonly environment?: "development" | "staging" | "production" | "test";
}

export interface CapabilityExecutionResult<T = Record<string, unknown>> {
  readonly requestExecutionId: string;
  readonly capabilityId: string;
  readonly status: "SUCCESS" | "FAILED" | "RETRYABLE_ERROR" | "REJECTED";
  readonly findings?: string[];
  readonly repairAction?: string;
  readonly outputData?: T;
  readonly guardianCertificateId?: string;
  readonly durationMs: number;
  readonly error?: string;
  readonly policyRejectionReason?: string;
}
