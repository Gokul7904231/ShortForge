/**
 * Machine-readable F07 pre-training admission contract.
 *
 * This gate consumes evidence from the repository's actual verification lanes.
 * It never manufactures evidence and it does not grant runtime authority.
 */

export interface F07PreTrainingEvidence {
  readonly topologyCanonical: boolean;
  readonly physicalProbeIndependent: boolean;
  readonly casBoundArtifactRequired: boolean;
  readonly policySnapshotIntervalBound: boolean;
  readonly policySourcesFresh: boolean;
  readonly receiptCryptographicallySigned: boolean;
  readonly authorizationDurable: boolean;
  readonly replayProtectionVerified: boolean;
  readonly noSyntheticProductionSuccess: boolean;
  readonly lineageInvalidationVerified: boolean;
  readonly testSuitesPassed: boolean;
}

export interface F07PreTrainingAdmissionResult {
  readonly admitted: boolean;
  readonly blockingChecks: readonly string[];
}

export class F07PreTrainingAdmission {
  public static evaluate(evidence: F07PreTrainingEvidence): F07PreTrainingAdmissionResult {
    const blockingChecks: string[] = [];

    for (const [key, value] of Object.entries(evidence)) {
      if (!value) blockingChecks.push(key);
    }

    return Object.freeze({
      admitted: blockingChecks.length === 0,
      blockingChecks: Object.freeze(blockingChecks),
    });
  }
}
