export type ArtifactKind = "WAV_AUDIO" | "MP4_VIDEO" | "PASSPORT" | "RENDER_INTENT";

export type ArtifactConsumptionStatus =
  | "UNCONSUMED"
  | "CONSUMED_DOWNSTREAM"
  | "HASH_MATCHED"
  | "HASH_MISMATCHED"
  | "STALE_ARTIFACT";

export interface PhysicalArtifactRecord {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly localPath: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly existsPhysically: boolean;
  readonly producerFloor: string;
  readonly consumerFloor?: string;
  readonly consumptionStatus?: ArtifactConsumptionStatus;
  readonly formatDetails?: Record<string, unknown>;
  readonly verifiedAt?: string;
}

export interface LineageEdge {
  readonly id?: string;
  readonly producerFloor: string;
  readonly artifactId: string;
  readonly consumerFloor: string;
  readonly artifactKind: ArtifactKind;
  readonly physicalSha256: string;
  readonly consumerReceivedSha256?: string;
  readonly hashMatched: boolean;
  readonly contractMatched: boolean;
  readonly consumptionProven: boolean;
}
