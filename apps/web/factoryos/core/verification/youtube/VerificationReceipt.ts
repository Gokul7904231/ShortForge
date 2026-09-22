/**
 * FactoryOS YouTube Monetization Guardian — Verification Receipt
 * Immutable, CAS-indexed audit receipt tying together physical forensics, creative genome,
 * YouTube policy gates, and traceable evidence.
 * Invariant: CLAIM <= EVIDENCE.
 */

import * as crypto from "node:crypto";
import { ContentGenome, computeGenomeHash } from "../../creative/ContentGenome";
import { MediaProbeMeasurements } from "../VerificationEngine";
import { MonetizationReadinessState } from "./contracts/F07ReleaseContracts";
import { GateEvaluationFinding } from "./policy/YouTubePolicyEvaluator";
import { RemediationCase } from "./remediation/RemediationCase";
import { EvidenceRef } from "./evidence/EvidenceRef";
import { F07CryptoSigner } from "./crypto/F07CryptoSigner";
import { ContentAddressedStore } from "../../compute/cas/ContentAddressedStore";

export interface VerificationReceipt {
  readonly receiptId: string;
  readonly issuer: "F07_RELEASE_GUARDIAN";
  readonly algorithm: "Ed25519";
  readonly signerKeyId: string;
  readonly artifactId: string;
  readonly artifactSha256: string;
  readonly artifactCasRef?: string;
  readonly casStorageRef?: string;
  readonly evidenceVersion?: string;
  readonly contentGenomeHash: string;
  readonly policyPack: "youtube";
  readonly policyVersion: string;
  readonly policySnapshotHash: string;
  readonly policyRetrievedAt: string;
  readonly policyEffectiveAt: string;
  readonly publicationIntentAt: string;

  readonly technicalForensics: {
    readonly artifactExists: boolean;
    readonly sha256Valid: boolean;
    readonly videoStream: boolean;
    readonly audioStream: boolean;
    readonly geometry9x16Or1x1: boolean;
    readonly codecCompliant: boolean;
    readonly durationWithinBounds: boolean;
    readonly decodeSmokePassed: boolean;
    readonly measurements: MediaProbeMeasurements;
  };

  readonly creative: {
    readonly contentEngine: string;
    readonly genome: ContentGenome;
    readonly variationOutcome: string;
    readonly fatigueRisk: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_DATA";
    readonly originalityStatus: string;
  };

  readonly youtubePolicy: {
    readonly overallOutcome: MonetizationReadinessState;
    readonly publishAllowed: boolean;
    readonly publishBlockReason?: string;
    readonly gateFindings: readonly GateEvaluationFinding[];
  };

  readonly remediationCases: readonly RemediationCase[];

  readonly evidencePartition: {
    readonly deterministicFacts: readonly string[];
    readonly aiAssistedInferences: readonly string[];
    readonly platformObservations: readonly string[];
  };

  readonly evidenceRefs?: readonly EvidenceRef[];

  readonly generatedAt: string;
  readonly receiptDigestSha256: string;
  readonly receiptSignature: string; // Ed25519 signature
  readonly receiptSignatureSha256: string; // Retained for backwards compatibility
}

export class VerificationReceiptBuilder {
  public static build(params: {
    artifactId: string;
    artifactSha256: string;
    artifactCasRef?: string;
    policyVersion: string;
    policySnapshotHash: string;
    policyRetrievedAt: string;
    policyEffectiveAt: string;
    publicationIntentAt: string;
    contentEngine: string;
    genome: ContentGenome;
    measurements: MediaProbeMeasurements;
    variationOutcome: string;
    fatigueRisk: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_DATA";
    originalityStatus: string;
    overallOutcome: MonetizationReadinessState;
    publishAllowed: boolean;
    publishBlockReason?: string;
    gateFindings: readonly GateEvaluationFinding[];
    remediationCases?: readonly RemediationCase[];
    evidenceRefs?: readonly EvidenceRef[];
  }): VerificationReceipt {
    const generatedAt = new Date().toISOString();
    const contentGenomeHash = computeGenomeHash(params.genome);
    const m = params.measurements;

    const is9x16 = m.width === 1080 && m.height === 1920;
    const is1x1 = m.width > 0 && m.width === m.height;
    const geometry9x16Or1x1 = is9x16 || is1x1;

    // Check sha256 validity - MUST NOT be empty fallback
    const isNonEmptySha256 = Boolean(
      params.artifactSha256 &&
      params.artifactSha256.length === 64 &&
      params.artifactSha256 !== "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );

    const technicalForensics = {
      artifactExists: m.fileExists && m.byteLength > 0,
      sha256Valid: isNonEmptySha256,
      videoStream: m.width > 0 && m.videoCodec !== "none",
      audioStream: m.audioCodec === "aac" || m.audioCodec === "mp3",
      geometry9x16Or1x1,
      codecCompliant: (m.videoCodec === "h264" || m.videoCodec === "hevc") && m.audioCodec === "aac",
      durationWithinBounds: m.videoDuration > 0 && m.videoDuration <= 180.0,
      decodeSmokePassed: m.decodeSmokePassed,
      measurements: m,
    };

    const creative = {
      contentEngine: params.contentEngine,
      genome: params.genome,
      variationOutcome: params.variationOutcome,
      fatigueRisk: params.fatigueRisk,
      originalityStatus: params.originalityStatus,
    };

    let overallOutcome = params.overallOutcome;
    let publishAllowed = params.publishAllowed;
    let publishBlockReason = params.publishBlockReason;

    if (
      !technicalForensics.artifactExists ||
      !technicalForensics.sha256Valid ||
      !technicalForensics.durationWithinBounds ||
      !technicalForensics.decodeSmokePassed ||
      !technicalForensics.geometry9x16Or1x1
    ) {
      publishAllowed = false;
      overallOutcome = "BLOCKED";
      publishBlockReason = publishBlockReason || "Technical forensics failed: physical media defect, invalid geometry/duration, or missing artifact SHA-256";
    }

    const youtubePolicy = {
      overallOutcome,
      publishAllowed,
      publishBlockReason,
      gateFindings: params.gateFindings,
    };

    const remediationCases = params.remediationCases || [];

    // Categorize evidence
    const deterministicFacts: string[] = [
      `Artifact exists: ${technicalForensics.artifactExists}`,
      `SHA-256 integrity: ${technicalForensics.sha256Valid}`,
      `Resolution: ${m.width}x${m.height}`,
      `Geometry valid: ${technicalForensics.geometry9x16Or1x1}`,
      `Codecs: ${m.videoCodec}/${m.audioCodec}`,
      `Duration: ${m.videoDuration.toFixed(2)}s`,
      `Decode smoke test: ${technicalForensics.decodeSmokePassed}`,
      `Content Engine: ${params.contentEngine}`,
      `Content Genome Topic: ${params.genome.topic}`,
    ];
    const aiAssistedInferences: string[] = [];
    const platformObservations: string[] = [];

    for (const finding of params.gateFindings) {
      const summary = `[${finding.gateId}] ${finding.explanation}`;
      if (finding.evaluationType === "DETERMINISTIC") {
        deterministicFacts.push(summary);
      } else if (finding.evaluationType === "AI_INFERRED") {
        aiAssistedInferences.push(summary);
      } else if (finding.evaluationType === "PLATFORM_OBSERVED") {
        platformObservations.push(summary);
      } else {
        deterministicFacts.push(summary);
      }
    }

    const receiptId = `rcpt_${params.artifactId}_${generatedAt.replace(/[:.]/g, "")}`;

    // Legacy signable payload format for backward compatibility
    const legacyPayload = {
      artifactId: params.artifactId,
      artifactSha256: params.artifactSha256,
      contentGenomeHash,
      policySnapshotHash: params.policySnapshotHash,
      publicationIntentAt: params.publicationIntentAt,
      overallOutcome: params.overallOutcome,
      publishAllowed: params.publishAllowed,
      gateCount: params.gateFindings.length,
      generatedAt,
    };
    const legacySignatureSha256 = crypto
      .createHash("sha256")
      .update(JSON.stringify(legacyPayload))
      .digest("hex");

    // Canonical payload for Ed25519 digital signing
    const canonicalSignablePayload = {
      receiptId,
      issuer: "F07_RELEASE_GUARDIAN" as const,
      algorithm: "Ed25519" as const,
      artifactId: params.artifactId,
      artifactSha256: params.artifactSha256,
      artifactCasRef: params.artifactCasRef,
      contentGenomeHash,
      policyPack: "youtube" as const,
      policyVersion: params.policyVersion,
      policySnapshotHash: params.policySnapshotHash,
      policyRetrievedAt: params.policyRetrievedAt,
      policyEffectiveAt: params.policyEffectiveAt,
      publicationIntentAt: params.publicationIntentAt,
      technicalForensics,
      creative,
      youtubePolicy,
      remediationCases,
      evidencePartition: {
        deterministicFacts,
        aiAssistedInferences,
        platformObservations,
      },
      evidenceRefs: params.evidenceRefs || [],
      generatedAt,
    };

    const signer = F07CryptoSigner.getInstance();
    const signResult = signer.sign(canonicalSignablePayload);

    const receipt: VerificationReceipt = Object.freeze({
      ...canonicalSignablePayload,
      issuer: "F07_RELEASE_GUARDIAN",
      algorithm: "Ed25519",
      signerKeyId: signResult.keyId,
      receiptDigestSha256: signResult.digestSha256,
      receiptSignature: signResult.signatureHex,
      receiptSignatureSha256: legacySignatureSha256, // backwards compatibility
      casStorageRef: params.artifactCasRef,
      evidenceVersion: "1.0",
    });

    return receipt;
  }
}

export class VerificationReceiptVerifier {
  public static verify(receipt: VerificationReceipt): { valid: boolean; reason?: string } {
    if (!receipt || !receipt.receiptDigestSha256 || !receipt.receiptSignature) {
      return { valid: false, reason: "Missing receipt digest or cryptographic signature" };
    }

    // Reconstruct canonical signable payload
    const canonicalSignablePayload = {
      receiptId: receipt.receiptId,
      issuer: receipt.issuer,
      algorithm: receipt.algorithm,
      artifactId: receipt.artifactId,
      artifactSha256: receipt.artifactSha256,
      artifactCasRef: receipt.artifactCasRef,
      contentGenomeHash: receipt.contentGenomeHash,
      policyPack: receipt.policyPack,
      policyVersion: receipt.policyVersion,
      policySnapshotHash: receipt.policySnapshotHash,
      policyRetrievedAt: receipt.policyRetrievedAt,
      policyEffectiveAt: receipt.policyEffectiveAt,
      publicationIntentAt: receipt.publicationIntentAt,
      technicalForensics: receipt.technicalForensics,
      creative: receipt.creative,
      youtubePolicy: receipt.youtubePolicy,
      remediationCases: receipt.remediationCases,
      evidencePartition: receipt.evidencePartition,
      evidenceRefs: receipt.evidenceRefs || [],
      generatedAt: receipt.generatedAt,
    };

    const computedDigest = F07CryptoSigner.computeDigest(canonicalSignablePayload);
    if (computedDigest !== receipt.receiptDigestSha256) {
      return {
        valid: false,
        reason: `Digest mismatch: expected ${receipt.receiptDigestSha256}, computed ${computedDigest}`,
      };
    }

    const signer = F07CryptoSigner.getInstance();
    const sigValid = signer.verify(canonicalSignablePayload, receipt.receiptSignature);
    if (!sigValid) {
      return { valid: false, reason: "Ed25519 digital signature verification failed" };
    }

    return { valid: true };
  }

  /**
   * Persists receipt directly to CAS as an immutable audit record.
   */
  public static async persistToCas(receipt: VerificationReceipt): Promise<string> {
    const cas = ContentAddressedStore.getInstance();
    const canonicalJson = F07CryptoSigner.canonicalize(receipt);
    const tmpPath = require("path").join(require("os").tmpdir(), `receipt_${receipt.receiptId}.json`);
    require("fs").writeFileSync(tmpPath, canonicalJson, "utf8");
    try {
      const ref = await cas.putFile(tmpPath, "verification_receipt", "application/json", {
        receiptId: receipt.receiptId,
        artifactSha256: receipt.artifactSha256,
        generatedAt: receipt.generatedAt,
      });
      return ref.uri || `cas://${ref.sha256}`;
    } finally {
      if (require("fs").existsSync(tmpPath)) {
        require("fs").unlinkSync(tmpPath);
      }
    }
  }
}
