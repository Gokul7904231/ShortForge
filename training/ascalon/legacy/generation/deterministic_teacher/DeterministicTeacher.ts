/**
 * Project Ascalon — Deterministic Teacher
 *
 * Uses authoritative system rules, physical invariants, and cryptographic checks
 * to generate candidate golden labels for operational decisions.
 * NEVER fabricates labels when evidence is insufficient.
 */

export interface TeacherLabelResult {
  readonly label: string;
  readonly confidence: number;
  readonly evidenceIds: string[];
  readonly labelSource: "DETERMINISTIC_RULE" | "VERIFIED_OUTCOME" | "UNRESOLVED";
  readonly reasoning: string;
}

export class DeterministicTeacher {
  /**
   * Rule 1: Artifact integrity check
   * If physical file SHA differs from expected SHA -> integrity failure
   */
  public static evaluateArtifactIntegrity(actualSha: string, expectedSha: string): TeacherLabelResult {
    if (!actualSha || !expectedSha) {
      return {
        label: "UNKNOWN",
        confidence: 0.0,
        evidenceIds: [],
        labelSource: "UNRESOLVED",
        reasoning: "Insufficient evidence: missing SHA digests.",
      };
    }

    const match = actualSha.toLowerCase() === expectedSha.toLowerCase();
    return {
      label: match ? "INTEGRITY_VERIFIED" : "INTEGRITY_FAILURE",
      confidence: 1.0,
      evidenceIds: [`sha_${actualSha.substring(0, 8)}`],
      labelSource: "DETERMINISTIC_RULE",
      reasoning: match
        ? `Physical byte SHA-256 matches expected CAS digest: ${actualSha}`
        : `Physical byte SHA-256 mismatch! Actual: ${actualSha}, Expected: ${expectedSha}`,
    };
  }

  /**
   * Rule 2: Worker Lease Expiration
   * If worker lease is in the past -> lease expired
   */
  public static evaluateWorkerLease(leaseExpiresAtIso: string, currentTimeIso: string = new Date().toISOString()): TeacherLabelResult {
    const expiresAt = new Date(leaseExpiresAtIso).getTime();
    const current = new Date(currentTimeIso).getTime();

    if (isNaN(expiresAt) || isNaN(current)) {
      return {
        label: "UNKNOWN",
        confidence: 0.0,
        evidenceIds: [],
        labelSource: "UNRESOLVED",
        reasoning: "Invalid timestamp supplied for lease evaluation.",
      };
    }

    const isExpired = current > expiresAt;
    return {
      label: isExpired ? "LEASE_EXPIRED" : "LEASE_ACTIVE",
      confidence: 1.0,
      evidenceIds: [`lease_check_${current}`],
      labelSource: "DETERMINISTIC_RULE",
      reasoning: isExpired
        ? `Lease expired ${((current - expiresAt) / 1000).toFixed(1)}s ago.`
        : `Lease is active for another ${((expiresAt - current) / 1000).toFixed(1)}s.`,
    };
  }

  /**
   * Rule 3: Fencing Token Monotonicity
   * If incoming fencing token <= active fencing token -> reject action
   */
  public static evaluateFencingToken(incomingToken: number, activeToken: number): TeacherLabelResult {
    const isStale = incomingToken <= activeToken;
    return {
      label: isStale ? "REJECT_STALE_FENCING_TOKEN" : "ACCEPT_FENCING_TOKEN",
      confidence: 1.0,
      evidenceIds: [`fence_${incomingToken}_vs_${activeToken}`],
      labelSource: "DETERMINISTIC_RULE",
      reasoning: isStale
        ? `Incoming fencing token (${incomingToken}) is not strictly greater than active token (${activeToken}).`
        : `Incoming fencing token (${incomingToken}) is monotonically superior to active token (${activeToken}).`,
    };
  }

  /**
   * Rule 4: Capability Authorization
   * If role or floor is not in capability policy boundary -> deny capability
   */
  public static evaluateCapabilityAccess(
    callerRole: string,
    callerFloor: string,
    allowedRoles: string[],
    allowedFloors: string[]
  ): TeacherLabelResult {
    const roleAllowed = allowedRoles.includes(callerRole);
    const floorAllowed = allowedFloors.includes(callerFloor);

    if (roleAllowed && floorAllowed) {
      return {
        label: "ACCESS_GRANTED",
        confidence: 1.0,
        evidenceIds: [`policy_role_${callerRole}`, `policy_floor_${callerFloor}`],
        labelSource: "DETERMINISTIC_RULE",
        reasoning: `Caller role (${callerRole}) and floor (${callerFloor}) authorized by capability policy.`,
      };
    }

    return {
      label: "ACCESS_DENIED",
      confidence: 1.0,
      evidenceIds: [`policy_role_${callerRole}`, `policy_floor_${callerFloor}`],
      labelSource: "DETERMINISTIC_RULE",
      reasoning: `Access denied. Role allowed: ${roleAllowed}, Floor allowed: ${floorAllowed}.`,
    };
  }
}
