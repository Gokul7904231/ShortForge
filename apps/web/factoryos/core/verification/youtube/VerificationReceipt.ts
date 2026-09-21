/**
 * FactoryOS YouTube Monetization Guardian — Verification Receipt
 * Immutable, CAS-indexed audit receipt tying together physical forensics, creative genome,
 * YouTube policy gates, and traceable evidence.
 * Invariant: CLAIM <= EVIDENCE.
 */

import * as crypto from "node:crypto";
import { ContentGenome, computeGenomeHash } from "../../creative/ContentGenome";
import { MediaProbeMeasurements } from "../VerificationEngine";
import { MonetizationReadinessState } from "./MonetizationReadinessEvaluator";
import { GateEvaluationFinding } from "./policy/YouTubePolicyEvaluator";
import { RemediationCase } from "./remediation/RemediationCase";

export interface VerificationReceipt {
  readonly receiptId: string;
  readonly artifactId: string;
  readonly artifactSha256: string;
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
    readonly fatigueRisk: "LOW" | "MEDIUM" | "HIGH";
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

  readonly generatedAt: string;
  readonly receiptSignatureSha256: string;
}

export class VerificationReceiptBuilder {
  public static build(params: {
    artifactId: string;
    artifactSha256: string;
    policyVersion: string;
    policySnapshotHash: string;
    policyRetrievedAt: string;
    policyEffectiveAt: string;
    publicationIntentAt: string;
    contentEngine: string;
    genome: ContentGenome;
    measurements: MediaProbeMeasurements;
    variationOutcome: string;
    fatigueRisk: "LOW" | "MEDIUM" | "HIGH";
    originalityStatus: string;
    overallOutcome: MonetizationReadinessState;
    publishAllowed: boolean;
    publishBlockReason?: string;
    gateFindings: readonly GateEvaluationFinding[];
    remediationCases?: readonly RemediationCase[];
  }): VerificationReceipt {
    const generatedAt = new Date().toISOString();
    const contentGenomeHash = computeGenomeHash(params.genome);
    const m = params.measurements;

    const is9x16 = m.width === 1080 && m.height === 1920;
    const is1x1 = m.width > 0 && m.width === m.height;
    const geometry9x16Or1x1 = is9x16 || is1x1;

    const technicalForensics = {
      artifactExists: m.fileExists && m.byteLength > 0,
      sha256Valid: Boolean(params.artifactSha256 && params.artifactSha256.length === 64),
      videoStream: m.width > 0 && m.videoCodec !== "none",
      audioStream: m.audioCodec === "aac" || m.audioCodec === "mp3",
      geometry9x16Or1x1,
      codecCompliant: (m.videoCodec === "h264" || m.videoCodec === "hevc") && m.audioCodec === "aac",
      durationWithinBounds: m.videoDuration >= 1.0 && m.videoDuration <= 180.0,
      decodeSmokePassed: m.decodeSmokePassed,
      measurements: m,
    };

    const deterministicFacts: string[] = [];
    const aiAssistedInferences: string[] = [];
    const platformObservations: string[] = [];

    deterministicFacts.push(
      `Artifact exists: ${technicalForensics.artifactExists}`,
      `SHA-256: ${params.artifactSha256}`,
      `Decode smoke test: ${technicalForensics.decodeSmokePassed}`,
      `Resolution: ${m.width}x${m.height}`,
      `Duration: ${m.videoDuration.toFixed(2)}s`
    );

    for (const finding of params.gateFindings) {
      if (finding.evaluationType === "DETERMINISTIC") {
        deterministicFacts.push(`${finding.gateId}: ${finding.explanation}`);
      } else if (finding.evaluationType === "AI_INFERRED") {
        aiAssistedInferences.push(`${finding.gateId}: ${finding.explanation}`);
      } else if (finding.evaluationType === "PLATFORM_OBSERVED") {
        platformObservations.push(`${finding.gateId}: ${finding.explanation}`);
      }
    }

    const payloadToSign = {
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

    const receiptSignatureSha256 = crypto
      .createHash("sha256")
      .update(JSON.stringify(payloadToSign))
      .digest("hex");

    const receiptId = `rcpt_${params.artifactId}_${receiptSignatureSha256.substring(0, 12)}`;

    return {
      receiptId,
      artifactId: params.artifactId,
      artifactSha256: params.artifactSha256,
      contentGenomeHash,
      policyPack: "youtube",
      policyVersion: params.policyVersion,
      policySnapshotHash: params.policySnapshotHash,
      policyRetrievedAt: params.policyRetrievedAt,
      policyEffectiveAt: params.policyEffectiveAt,
      publicationIntentAt: params.publicationIntentAt,
      technicalForensics,
      creative: {
        contentEngine: params.contentEngine,
        genome: params.genome,
        variationOutcome: params.variationOutcome,
        fatigueRisk: params.fatigueRisk,
        originalityStatus: params.originalityStatus,
      },
      youtubePolicy: {
        overallOutcome: params.overallOutcome,
        publishAllowed: params.publishAllowed,
        publishBlockReason: params.publishBlockReason,
        gateFindings: params.gateFindings,
      },
      remediationCases: Object.freeze(params.remediationCases || []),
      evidencePartition: {
        deterministicFacts: Object.freeze(deterministicFacts),
        aiAssistedInferences: Object.freeze(aiAssistedInferences),
        platformObservations: Object.freeze(platformObservations),
      },
      generatedAt,
      receiptSignatureSha256,
    };
  }
}
