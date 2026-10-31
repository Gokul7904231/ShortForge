import type { AEROutcomeReceipt } from "./EpistemicContracts";

/**
 * Trusted adapter to the authoritative evidence/receipt store.
 *
 * Implementations must resolve verificationRef, every evidenceRef, and any
 * necessityAssessment evidenceRefs. Checking that strings are non-empty is
 * not verification. There is intentionally no permissive default adapter.
 */
export interface AEROutcomeEvidenceVerifier {
  verifyOutcome(receipt: AEROutcomeReceipt): boolean;
}

export interface AEROutcomeAdmissionResult {
  readonly admitted: boolean;
  readonly reason?: string;
}
