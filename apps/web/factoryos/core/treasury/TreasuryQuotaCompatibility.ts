/**
 * Treasury quota compatibility boundary.
 *
 * Legacy quota persistence remains available only for historical jobs and
 * migration/projection fallback. New production admission/release decisions
 * belong to TreasuryQuotaAdmission and the Treasury ledger.
 */
import {
  finalizeGenerationSlot,
  releaseGenerationSlot,
} from "../../../lib/quota/quota-service";

export async function finalizeLegacyGenerationSlot(
  userId: string,
  jobId: string,
): Promise<void> {
  await finalizeGenerationSlot(userId, jobId);
}

export async function releaseLegacyGenerationSlot(
  userId: string,
  jobId: string,
): Promise<void> {
  await releaseGenerationSlot(userId, jobId);
}
