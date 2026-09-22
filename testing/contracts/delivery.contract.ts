export type DeliveryState =
  | "PREPARED"
  | "LOCALLY_COMMITTED"
  | "REMOTE_UPLOADED"
  | "REMOTE_VERIFIED"
  | "FAILED"
  | "BLOCKED"
  | "NOT_ATTEMPTED";

export interface DeliveryRecord {
  readonly deliveryId: string;
  readonly jobId: string;
  readonly method: "LOCAL_OUTBOX" | "GOOGLE_DRIVE";
  readonly targetLocation: string;
  readonly localStatus: DeliveryState;
  readonly remoteStatus: DeliveryState;
  readonly localPath?: string;
  readonly remoteLocation?: string;
  readonly verified: boolean;
  readonly sha256: string;
  readonly deliveredAt: string;
  readonly remoteVerificationDetails?: Record<string, unknown>;
}
