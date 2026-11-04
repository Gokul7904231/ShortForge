import type { DeliveryArtifact } from "../../factoryos/core/production/ProductionJob";
import { saveJobManifest } from "../jobs-history";

/**
 * Writes the delivery result into the durable job document.
 * The local outbox file remains a worker-side fallback, not the source of truth.
 */
export async function persistDeliveryReceipt(
  jobId: string,
  artifact: DeliveryArtifact,
  status: "PENDING" | "UPLOADING" | "UPLOADED" | "FAILED"
): Promise<void> {
  try {
    await saveJobManifest(jobId, {
      deliveryMethod: artifact.deliveryMethod,
      deliveryVerified: artifact.verified === true,
      driveFileId: artifact.driveFileId,
      deliveryStatus: status,
      deliveredAt: artifact.uploadedAt,
      deliveryArtifact: artifact,
    });
  } catch (err: any) {
    console.warn(`[DeliveryReceipt] Could not persist delivery for ${jobId}: ${err?.message ?? err}`);
  }
}
