/**
 * ShortForge / FactoryOS — Typed Floor Council Contracts
 *
 * Instructor = knowledge, Advisor = strategy, Auditor = independent examination.
 * These packets are advisory records, not authority grants.
 */

export type CouncilRole = "INSTRUCTOR" | "ADVISOR" | "AUDITOR";

export interface CounselPacket {
  readonly counselId: string;
  readonly floorId: string;
  readonly incidentId?: string;
  readonly ministerRole: CouncilRole;
  readonly recommendation: string;
  readonly supportingEvidence: readonly string[];
  readonly constraints: readonly string[];
  readonly uncertainty: number;
  readonly conflictsWith: readonly string[];
  readonly urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly expectedOutcome?: string;
  readonly rejectionConditions: readonly string[];
  readonly provenance: readonly string[];
  readonly createdAt: string;
}

export interface CouncilBlackboardSnapshot {
  readonly floorId: string;
  readonly verifiedFacts: readonly string[];
  readonly observations: readonly string[];
  readonly hypotheses: readonly string[];
  readonly recommendations: readonly CounselPacket[];
  readonly conflicts: readonly string[];
  readonly constraints: readonly string[];
  readonly candidateActionIds: readonly string[];
  readonly verificationRequirements: readonly string[];
  readonly updatedAt: string;
}

export function isAuditorPacket(packet: CounselPacket): boolean {
  return packet.ministerRole === "AUDITOR";
}
