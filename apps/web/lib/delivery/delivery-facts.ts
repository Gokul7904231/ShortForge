import { readDeliveryReceipt } from "./outbox-record";

/**
 * Delivery facts are read from the durable job document first and only then
 * from the worker's local outbox file. The job document is what survives a
 * worker restart, a container replacement or an outbox cleanup.
 */

export type DeliveryMethod = "GOOGLE_DRIVE" | "LOCAL_OUTBOX";

export interface DurableDeliveryDocument {
  deliveryMethod?: string | null;
  deliveryVerified?: boolean | null;
  driveFileId?: string | null;
  deliveryStatus?: string | null;
  deliveryArtifact?: {
    deliveryMethod?: string;
    verified?: boolean;
    driveFileId?: string;
    uploadedAt?: string;
  } | null;
}

export interface ResolvedDeliveryFacts {
  deliveryMethod?: DeliveryMethod;
  verified?: boolean;
  driveFileId?: string;
  deliveryStatus?: string;
  uploadedAt?: string;
  source: "job-document" | "outbox" | "none";
}

export function resolveDeliveryFacts(
  jobId: string,
  job: DurableDeliveryDocument | null | undefined
): ResolvedDeliveryFacts {
  const receipt = readDeliveryReceipt(jobId);
  const artifact = job?.deliveryArtifact;

  const method = job?.deliveryMethod ?? artifact?.deliveryMethod ?? receipt?.deliveryMethod;
  const verified = job?.deliveryVerified ?? artifact?.verified ?? receipt?.verified;
  const driveFileId = job?.driveFileId ?? artifact?.driveFileId ?? receipt?.driveFileId;

  const hasDurableMethod = Boolean(job?.deliveryMethod || artifact?.deliveryMethod);

  return {
    deliveryMethod: method === "GOOGLE_DRIVE" || method === "LOCAL_OUTBOX" ? method : undefined,
    verified: typeof verified === "boolean" ? verified : undefined,
    driveFileId: driveFileId ?? undefined,
    deliveryStatus: job?.deliveryStatus ?? undefined,
    uploadedAt: artifact?.uploadedAt ?? receipt?.uploadedAt,
    source: hasDurableMethod ? "job-document" : receipt ? "outbox" : "none",
  };
}
