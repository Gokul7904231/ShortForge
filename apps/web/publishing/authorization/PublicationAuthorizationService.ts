/**
 * FactoryOS YouTube Monetization Guardian — Publication Authorization Service
 * Issues, cryptographically verifies, and manages the lifecycle of unforgeable ReleaseAuthorization capabilities.
 *
 * MANDATORY ARCHITECTURAL INVARIANTS:
 * 1. NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION
 * 2. ReleaseAuthorization must be cryptographically signed via Ed25519 (TypeScript types alone are not an unforgeable capability).
 * 3. Bind authorization to the complete canonical sanitized publication payload (canonicalPayloadHash).
 * 4. Durable atomic state transitions (ACTIVE -> CONSUMED / INVALIDATED).
 * 5. Immediately before the first remote publication side effect, perform authorization revalidation (JIT).
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { F07CryptoSigner } from "../../factoryos/core/verification/youtube/crypto/F07CryptoSigner";
import { ReleaseAuthorization, ReleaseAuthorizationScope, AuthorizedPublication } from "../../factoryos/core/verification/youtube/contracts/F07ReleaseContracts";
import { VerificationReceipt, VerificationReceiptVerifier } from "../../factoryos/core/verification/youtube/VerificationReceipt";

export interface SanitizePublishPayloadParams {
  jobId: string;
  title: string;
  description?: string;
  tags?: readonly string[];
  privacyStatus: "private" | "unlisted" | "public";
  publishAt?: string;
  containsSyntheticMedia?: boolean;
  selfDeclaredMadeForKids?: boolean;
  channelId: string;
  platform?: string;
}

export interface IssueAuthorizationParams {
  receipt: VerificationReceipt;
  canonicalPayload: SanitizePublishPayloadParams;
  targetPlatform: "youtube";
  durationSeconds?: number; // TTL
}

export interface AuthorizationVerificationResult {
  readonly valid: boolean;
  readonly code:
    | "VALID"
    | "MISSING_AUTHORIZATION"
    | "SIGNATURE_INVALID"
    | "EXPIRED"
    | "NOT_ACTIVE"
    | "PAYLOAD_MISMATCH"
    | "RECEIPT_DIGEST_MISMATCH"
    | "UNAUTHORIZED_PLATFORM"
    | "JIT_REVALIDATION_FAILED";
  readonly error?: string;
}

export class PublicationAuthorizationService {
  private static instance: PublicationAuthorizationService;
  private authorizations = new Map<string, ReleaseAuthorization>();
  private consumedSessionUris = new Map<string, string>(); // authId -> uploadSessionUri

  private constructor() {}

  public static getInstance(): PublicationAuthorizationService {
    if (!PublicationAuthorizationService.instance) {
      PublicationAuthorizationService.instance = new PublicationAuthorizationService();
    }
    return PublicationAuthorizationService.instance;
  }

  /**
   * Sanitizes and produces a deterministic canonical payload structure.
   */
  public static canonicalizePayload(p: SanitizePublishPayloadParams): Record<string, any> {
    return {
      channelId: p.channelId,
      containsSyntheticMedia: Boolean(p.containsSyntheticMedia),
      description: p.description || "",
      jobId: p.jobId,
      platform: p.platform || "youtube",
      privacyStatus: p.privacyStatus,
      publishAt: p.publishAt || null,
      selfDeclaredMadeForKids: Boolean(p.selfDeclaredMadeForKids),
      tags: p.tags ? [...p.tags].sort() : [],
      title: p.title,
    };
  }

  /**
   * Computes deterministic SHA-256 hash of the sanitized canonical publication payload.
   */
  public static computePayloadHash(payload: SanitizePublishPayloadParams): string {
    const canonical = PublicationAuthorizationService.canonicalizePayload(payload);
    return F07CryptoSigner.sha256(canonical);
  }

  /**
   * Issues an unforgeable, Ed25519-signed ReleaseAuthorization capability based on a PASS verification receipt.
   */
  public issueAuthorization(params: IssueAuthorizationParams): ReleaseAuthorization {
    const receipt = params.receipt;

    // Invariant: Receipt must allow publication
    const publishAllowed = receipt.youtubePolicy ? receipt.youtubePolicy.publishAllowed : (receipt as any).releaseDecision?.publishAllowed;
    const blockReason = receipt.youtubePolicy ? receipt.youtubePolicy.publishBlockReason : (receipt as any).releaseDecision?.publishBlockReason;
    const releaseStatus = receipt.youtubePolicy ? receipt.youtubePolicy.overallOutcome : (receipt as any).releaseDecision?.releaseStatus;

    if (!publishAllowed || releaseStatus === "BLOCKED") {
      throw new Error(
        `Cannot issue ReleaseAuthorization: Receipt release decision is ${releaseStatus}. ` +
        `Block reason: ${blockReason || "Unapproved"}`
      );
    }

    // Invariant: Receipt signature must be valid
    const verification = VerificationReceiptVerifier.verify(receipt);
    if (!verification.valid) {
      throw new Error(`Cannot issue ReleaseAuthorization: VerificationReceipt digital signature is invalid or tampered: ${verification.reason}`);
    }

    const issuedAt = new Date().toISOString();
    const ttlSeconds = params.durationSeconds ?? 3600; // 1 hour default
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const nonce = crypto.randomBytes(16).toString("hex");
    const authorizationId = `auth_yt_${crypto.randomUUID()}`;

    const canonicalPayload = PublicationAuthorizationService.canonicalizePayload(params.canonicalPayload);
    const canonicalPayloadHash = F07CryptoSigner.sha256(canonicalPayload);

    const publicationIntentId = `pi_${params.canonicalPayload.jobId}_${params.canonicalPayload.channelId}`;
    const publicationIntentHash = F07CryptoSigner.sha256({
      publicationIntentId,
      canonicalPayloadHash,
      targetPlatform: params.targetPlatform,
    });

    const scope: ReleaseAuthorizationScope = {
      allowedPrivacy: params.canonicalPayload.privacyStatus,
      containsSyntheticMedia: Boolean(params.canonicalPayload.containsSyntheticMedia),
      selfDeclaredMadeForKids: Boolean(params.canonicalPayload.selfDeclaredMadeForKids),
      publishAt: params.canonicalPayload.publishAt,
      title: params.canonicalPayload.title,
      description: params.canonicalPayload.description,
      tags: params.canonicalPayload.tags,
    };

    // Body to sign (without signature property)
    const unsignedBody = {
      authorizationId,
      issuedAt,
      issuer: "F07_RELEASE_GUARDIAN" as const,
      authorizationVersion: 1,
      nonce,
      receiptId: receipt.receiptId,
      receiptDigestSha256: receipt.receiptDigestSha256,
      receiptSignature: receipt.receiptSignature,
      artifactId: receipt.artifactId,
      artifactSha256: receipt.artifactSha256,
      artifactCasRef: receipt.artifactCasRef || receipt.casStorageRef || `cas://${receipt.artifactSha256}`,
      targetChannelId: params.canonicalPayload.channelId,
      targetPlatform: params.targetPlatform,
      publicationIntentId,
      publicationIntentHash,
      canonicalPayloadHash,
      scope,
      policySnapshotIds: [receipt.policyVersion],
      evidenceVersion: receipt.evidenceVersion || "1.0",
      status: "ACTIVE" as const,
      expiresAt,
    };

    // Ed25519 cryptographic signature over deterministic canonical JSON
    const signature = F07CryptoSigner.sign(unsignedBody);
    const signerKeyId = F07CryptoSigner.getKeyId();

    const auth: ReleaseAuthorization = {
      ...unsignedBody,
      signature,
      signerKeyId,
    };

    this.authorizations.set(authorizationId, auth);
    return auth;
  }

  /**
   * Cryptographically verifies authorization signature, expiration, status, and payload binding.
   */
  public verifyAuthorization(
    auth: ReleaseAuthorization | undefined | null,
    payload: SanitizePublishPayloadParams,
    options?: { allowResumableSessionUri?: string }
  ): AuthorizationVerificationResult {
    if (!auth) {
      return { valid: false, code: "MISSING_AUTHORIZATION", error: "ReleaseAuthorization capability is missing." };
    }

    // 1. Verify target platform
    if (auth.targetPlatform !== "youtube") {
      return { valid: false, code: "UNAUTHORIZED_PLATFORM", error: `Authorization is for '${auth.targetPlatform}', expected 'youtube'.` };
    }

    // 2. Verify status
    const isResumingSession = Boolean(
      options?.allowResumableSessionUri &&
      this.consumedSessionUris.get(auth.authorizationId) === options.allowResumableSessionUri
    );

    if (auth.status !== "ACTIVE" && !isResumingSession) {
      return { valid: false, code: "NOT_ACTIVE", error: `Authorization status is '${auth.status}', must be 'ACTIVE'.` };
    }

    // 3. Verify expiration
    const now = Date.now();
    const expiry = new Date(auth.expiresAt).getTime();
    if (now > expiry) {
      return { valid: false, code: "EXPIRED", error: `Authorization expired at '${auth.expiresAt}'.` };
    }

    // 4. Verify canonical payload hash binding
    const computedPayloadHash = PublicationAuthorizationService.computePayloadHash(payload);
    if (computedPayloadHash !== auth.canonicalPayloadHash) {
      return {
        valid: false,
        code: "PAYLOAD_MISMATCH",
        error: `Canonical payload hash mismatch! Current payload does not match authorized specification. Computed: ${computedPayloadHash}, Authorized: ${auth.canonicalPayloadHash}`,
      };
    }

    // 5. Verify Ed25519 digital signature
    const { signature, signerKeyId, invalidatedAt, invalidatedBy, invalidationReason, ...unsignedBody } = auth;
    const isSignatureValid = F07CryptoSigner.verify({ ...unsignedBody, status: "ACTIVE" }, signature);
    if (!isSignatureValid) {
      return {
        valid: false,
        code: "SIGNATURE_INVALID",
        error: "ReleaseAuthorization Ed25519 cryptographic signature verification failed. Token is forged or corrupted.",
      };
    }

    return { valid: true, code: "VALID" };
  }

  /**
   * Performs JIT revalidation immediately before the first remote publication side effect.
   */
  public revalidateImmediatelyBeforePublish(
    auth: ReleaseAuthorization | undefined | null,
    payload: SanitizePublishPayloadParams,
    context?: { uploadSessionUri?: string }
  ): AuthorizationVerificationResult {
    const basicCheck = this.verifyAuthorization(auth, payload, {
      allowResumableSessionUri: context?.uploadSessionUri,
    });
    if (!basicCheck.valid) {
      return basicCheck;
    }

    // Check if recorded in local authority store
    const stored = this.authorizations.get(auth!.authorizationId);
    if (stored && stored.status !== "ACTIVE") {
      // Check if resuming upload session
      if (context?.uploadSessionUri && this.consumedSessionUris.get(auth!.authorizationId) === context.uploadSessionUri) {
        // Resuming previously registered session: allowed
        return { valid: true, code: "VALID" };
      }
      return {
        valid: false,
        code: "JIT_REVALIDATION_FAILED",
        error: `Authorization '${auth!.authorizationId}' was invalidated or already consumed (status: ${stored.status}).`,
      };
    }

    return { valid: true, code: "VALID" };
  }

  /**
   * Consumes an authorization upon publication initiation/completion (atomic state transition).
   */
  public consumeAuthorization(authorizationId: string, uploadSessionUri?: string): void {
    const stored = this.authorizations.get(authorizationId);
    if (stored) {
      const consumed: ReleaseAuthorization = {
        ...stored,
        status: "CONSUMED",
      };
      this.authorizations.set(authorizationId, consumed);
      if (uploadSessionUri) {
        this.consumedSessionUris.set(authorizationId, uploadSessionUri);
      }
    }
  }

  /**
   * Invalidate an authorization if an upstream defect or policy revocation occurs.
   */
  public invalidateAuthorization(authorizationId: string, reason: string): void {
    const stored = this.authorizations.get(authorizationId);
    if (stored) {
      const invalidated: ReleaseAuthorization = {
        ...stored,
        status: "INVALIDATED",
        invalidatedAt: new Date().toISOString(),
        invalidatedBy: "F07_RELEASE_GUARDIAN",
        invalidationReason: reason,
      };
      this.authorizations.set(authorizationId, invalidated);
    }
  }

  /**
   * Retrieves an authorization from memory.
   */
  public getAuthorization(authorizationId: string): ReleaseAuthorization | undefined {
    return this.authorizations.get(authorizationId);
  }

  /**
   * Clears in-memory authorizations (for test suite isolation).
   */
  public clear(): void {
    this.authorizations.clear();
    this.consumedSessionUris.clear();
  }
}
