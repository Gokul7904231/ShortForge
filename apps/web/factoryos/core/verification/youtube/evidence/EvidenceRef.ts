/**
 * FactoryOS YouTube Monetization Guardian — Structured Cryptographic Evidence References
 * Invariant: CLAIM <= EVIDENCE. Every authoritative claim must reference verifiable evidence.
 */

import * as crypto from "node:crypto";

export type EvidenceType =
  | "PHYSICAL_MEASUREMENT"
  | "CAS_ARTIFACT"
  | "POLICY_SOURCE"
  | "POLICY_SNAPSHOT"
  | "LICENSE_PROOF"
  | "FACTUAL_SOURCE"
  | "MODEL_INFERENCE"
  | "PLATFORM_OBSERVATION"
  | "SECURITY_ATTESTATION"
  | "REMEDIATION_RESULT";

export type VerificationMethod =
  | "DETERMINISTIC_PROBE"
  | "CAS_HASH_VERIFY"
  | "CANONICAL_SERIALIZE"
  | "HTTP_FETCH_VERIFY"
  | "AI_INFERENCE"
  | "PLATFORM_API"
  | "HUMAN_ATTESTATION"
  | "HYBRID";

export interface EvidenceRef {
  readonly evidenceId: string;
  readonly evidenceType: EvidenceType;
  readonly producer: string;
  readonly artifactRef?: string;
  readonly sha256?: string;
  readonly createdAt: string;
  readonly sourceRef?: string;
  readonly sourceContentHash?: string;
  readonly revisionId?: string;
  readonly method: VerificationMethod;
  readonly confidence: number;
  readonly metadata?: Record<string, any>;
}

export class EvidenceRefFactory {
  public static create(params: {
    evidenceType: EvidenceType;
    producer: string;
    artifactRef?: string;
    sha256?: string;
    sourceRef?: string;
    sourceContentHash?: string;
    revisionId?: string;
    method: VerificationMethod;
    confidence: number;
    metadata?: Record<string, any>;
  }): EvidenceRef {
    const createdAt = new Date().toISOString();
    const entropy = crypto.randomBytes(4).toString("hex");
    const evidenceId = `ev_${params.evidenceType.toLowerCase()}_${entropy}`;

    return Object.freeze({
      evidenceId,
      evidenceType: params.evidenceType,
      producer: params.producer,
      artifactRef: params.artifactRef,
      sha256: params.sha256,
      createdAt,
      sourceRef: params.sourceRef,
      sourceContentHash: params.sourceContentHash,
      revisionId: params.revisionId,
      method: params.method,
      confidence: Math.max(0.0, Math.min(1.0, params.confidence)),
      metadata: params.metadata ? Object.freeze({ ...params.metadata }) : undefined,
    });
  }

  public static physical(producer: string, sha256: string, metadata?: Record<string, any>): EvidenceRef {
    return this.create({
      evidenceType: "PHYSICAL_MEASUREMENT",
      producer,
      sha256,
      method: "DETERMINISTIC_PROBE",
      confidence: 1.0,
      metadata,
    });
  }

  public static casArtifact(casUri: string, sha256: string, metadata?: Record<string, any>): EvidenceRef {
    return this.create({
      evidenceType: "CAS_ARTIFACT",
      producer: "ContentAddressedStore",
      artifactRef: casUri,
      sha256,
      method: "CAS_HASH_VERIFY",
      confidence: 1.0,
      metadata,
    });
  }

  public static policySource(url: string, contentHash: string, metadata?: Record<string, any>): EvidenceRef {
    return this.create({
      evidenceType: "POLICY_SOURCE",
      producer: "PolicySourceFetcher",
      sourceRef: url,
      sourceContentHash: contentHash,
      method: "HTTP_FETCH_VERIFY",
      confidence: 1.0,
      metadata,
    });
  }
}
