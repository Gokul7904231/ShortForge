import fs from "fs";
import path from "path";

/**
 * Reads the delivery receipt the worker writes after F07.
 * Absence of a receipt means "not recorded", never "delivered".
 */

export interface PersistedDelivery {
  deliveryMethod: "GOOGLE_DRIVE" | "LOCAL_OUTBOX";
  verified: boolean;
  driveFileId?: string;
  uploadedAt?: string;
  sha256?: string;
}

// Same boundary rule as the render worker: jobId is used in a filesystem path.
const JOB_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export function readDeliveryReceipt(jobId: string): PersistedDelivery | null {
  if (!JOB_ID_PATTERN.test(jobId)) return null;

  try {
    const file = path.join(process.cwd(), "data", "outbox", `${jobId}_outbox.json`);
    if (!fs.existsSync(file)) return null;

    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    const artifact = record?.deliveryArtifact;
    if (!artifact?.deliveryMethod) return null;

    return {
      deliveryMethod: artifact.deliveryMethod,
      verified: artifact.verified === true,
      driveFileId: artifact.driveFileId,
      uploadedAt: artifact.uploadedAt,
      sha256: artifact.sha256,
    };
  } catch {
    return null;
  }
}
