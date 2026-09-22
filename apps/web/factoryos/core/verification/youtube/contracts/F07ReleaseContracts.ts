/**
 * FactoryOS YouTube Monetization Guardian — Canonical F07 Release & Capability Contracts
 * Invariants:
 * 1. CLAIM <= EVIDENCE
 * 2. NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION
 * 3. A DETERMINISTIC FACT MUST BE VERIFIED DETERMINISTICALLY
 * 4. UNKNOWN / STALE / MISSING CRITICAL EVIDENCE MUST FAIL CLOSED
 */

import { EvidenceRef } from "../evidence/EvidenceRef";

export type ReleaseStatus =
  | "APPROVED"
  | "REPAIR_REQUIRED"
  | "BLOCKED"
  | "POLICY_STALE"
  | "EXTERNAL_REVIEW"
  | "UNKNOWN";

export type MonetizationReadinessState =
  | "READY"
  | "READY_WITH_EXTERNAL_REVIEW"
  | "REPAIR_REQUIRED"
  | "BLOCKED"
  | "NOT_YET_ELIGIBLE"
  | "POLICY_STALE"
  | "UNKNOWN";

export type PolicyEffect =
  | "BLOCK_PUBLICATION"
  | "BLOCK_UPLOAD"
  | "PLAYBACK_IMPACT"
  | "REVENUE_IMPACT"
  | "MONETIZATION_ELIGIBILITY"
  | "ADVERTISER_REVIEW"
  | "DISCLOSURE_REQUIRED"
  | "EXTERNAL_REVIEW";

export interface ReleaseAuthorizationScope {
  readonly allowedPrivacy: "private" | "unlisted" | "public";
  readonly containsSyntheticMedia: boolean;
  readonly selfDeclaredMadeForKids: boolean;
  readonly publishAt?: string;
  readonly title: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface ReleaseAuthorization {
  readonly authorizationId: string;
  readonly issuedAt: string;
  readonly issuer: "F07_RELEASE_GUARDIAN";
  readonly authorizationVersion: number;
  readonly nonce: string;
  readonly receiptId: string;
  readonly receiptDigestSha256: string;
  readonly receiptSignature: string;
  readonly artifactId: string;
  readonly artifactSha256: string;
  readonly artifactCasRef: string;
  readonly targetChannelId: string;
  readonly targetPlatform: "youtube";
  readonly publicationIntentId: string;
  readonly publicationIntentHash: string;
  readonly canonicalPayloadHash: string;
  readonly scope: ReleaseAuthorizationScope;
  readonly policySnapshotIds: readonly string[];
  readonly evidenceVersion: string;
  readonly status: "ACTIVE" | "CONSUMED" | "INVALIDATED";
  readonly expiresAt: string;
  readonly consumedAt?: string;
  readonly uploadSessionUri?: string;
  readonly invalidatedAt?: string;
  readonly invalidatedBy?: string;
  readonly invalidationReason?: string;
  readonly signature: string; // Ed25519 digital signature
  readonly signerKeyId: string;
}

export interface AuthorizedPublication {
  readonly authorization: ReleaseAuthorization;
  readonly casStreamProvider: () => NodeJS.ReadableStream;
  readonly payload: {
    readonly jobId: string;
    readonly title: string;
    readonly description?: string;
    readonly tags?: readonly string[];
    readonly privacyStatus: "private" | "unlisted" | "public";
    readonly publishAt?: string;
    readonly containsSyntheticMedia: boolean;
    readonly selfDeclaredMadeForKids: boolean;
    readonly channelId: string;
  };
}

export interface TechnicalVerificationResult {
  readonly artifactExists: boolean;
  readonly nonZeroBytes: boolean;
  readonly byteLength: number;
  readonly actualSha256: string;
  readonly sha256MatchesExpected: boolean;
  readonly validContainer: boolean;
  readonly videoStreamPresent: boolean;
  readonly audioStreamPresent: boolean;
  readonly geometryCompliant: boolean;
  readonly width: number;
  readonly height: number;
  readonly compliantCodecs: boolean;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly durationWithinBounds: boolean;
  readonly videoDuration: number;
  readonly audioDuration: number;
  readonly syncDriftMs: number;
  readonly audioVideoSyncValid: boolean;
  readonly decodeSmokePassed: boolean;
  readonly passed: boolean;
  readonly evidenceRefs: readonly EvidenceRef[];
}

export interface CreativeVerificationResult {
  readonly contentEngine: string;
  readonly contentIdentityHash: string;
  readonly semanticSimilarityScore: number;
  readonly variationOutcome: string;
  readonly fatigueRisk: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_DATA";
  readonly originalityStatus: string;
  readonly passed: boolean;
  readonly evidenceRefs: readonly EvidenceRef[];
}

export interface PolicyVerificationResult {
  readonly overallOutcome: MonetizationReadinessState;
  readonly releaseStatus: ReleaseStatus;
  readonly activePolicyEffects: readonly PolicyEffect[];
  readonly publishAllowed: boolean;
  readonly publishBlockReason?: string;
  readonly gateFindings: readonly any[];
  readonly evidenceRefs: readonly EvidenceRef[];
}
