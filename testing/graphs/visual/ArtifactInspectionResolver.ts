/**
 * FactoryOS v1 / Frontier v3 — Artifact Inspection Resolver (Correctness Hardened)
 * Resolves physical artifact metadata, filesystem existence, real byte lengths,
 * SHA-256 digests, verification probes, and lineage proofs.
 * Refuses to fabricate physical measurements or upgrade metadata into physical truth.
 *
 * Correctness Invariants:
 * - Missing or inaccessible files CANNOT become PHYSICAL from metadata fallback.
 * - Actual filesystem stat size and computed SHA-256 win over reported values.
 * - Hash and size mismatches are explicitly detected and reported.
 */

import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { ArtifactInspectionResult, PhysicalArtifactReceipt } from "./InteractionIR";
import type { TruthLevel } from "../../contracts/execution.contract";

export type { PhysicalArtifactReceipt };

export interface ArtifactDataRecord {
  readonly id: string;
  readonly path: string;
  readonly producer: string;
  readonly consumers: string[];
  readonly byteLength?: number;
  readonly sha256?: string;
  readonly mimeType?: string;
  readonly durationSeconds?: number;
  readonly durationTruth?: string;
  readonly verificationStatus?: "VERIFIED" | "UNVERIFIED" | "FAILED" | "UNKNOWN";
  readonly probeResults?: Record<string, boolean>;
  readonly lineageProof?: {
    readonly upstreamHashMatch: boolean;
    readonly consumerHashMatch: boolean;
  };
  readonly deliveryStatus?: {
    readonly localDelivered: boolean;
    readonly remoteDelivered: boolean;
    readonly outboxLocation?: string;
  };
  /**
   * @deprecated Boolean assertion is NOT evidence. Must supply structured authoritativeReceipt.
   */
  readonly hasAuthoritativePhysicalReceipt?: boolean;
  readonly authoritativeReceipt?: PhysicalArtifactReceipt;
}

export class ArtifactInspectionResolver {
  public static resolve(artifactId: string, knownArtifacts: ArtifactDataRecord[] = []): ArtifactInspectionResult {
    const record = knownArtifacts.find((a) => a.id === artifactId || a.path === artifactId);

    if (!record) {
      return {
        artifactId,
        path: "UNKNOWN",
        producer: "UNKNOWN",
        consumers: [],
        byteLength: 0,
        sha256: "UNKNOWN",
        reportedByteLength: undefined,
        reportedSha256: undefined,
        physicalByteLength: undefined,
        physicalSha256: undefined,
        receiptByteLength: undefined,
        receiptSha256: undefined,
        hashMismatchDetected: false,
        sizeMismatchDetected: false,
        receiptMismatchDetected: false,
        truthLevel: "UNKNOWN",
        truthBasis: "UNKNOWN",
        mimeType: "UNKNOWN",
        physicalExistenceProven: false,
        verificationStatus: "UNKNOWN",
        lineageProof: { upstreamHashMatch: false, consumerHashMatch: false },
        deliveryStatus: { localDelivered: false, remoteDelivered: false },
        resolved: false,
      };
    }

    const reportedByteLength = record.byteLength;
    const reportedSha256 = record.sha256;

    let physicalExistenceProven = false;
    let physicalByteLength: number | undefined = undefined;
    let physicalSha256: string | undefined = undefined;
    let receiptByteLength: number | undefined = undefined;
    let receiptSha256: string | undefined = undefined;
    let hashMismatchDetected = false;
    let sizeMismatchDetected = false;
    let receiptMismatchDetected = false;
    let truthBasis: "PHYSICAL_FILE_PROBE" | "AUTHORITATIVE_PHYSICAL_RECEIPT" | "REPORTED_METADATA" | "UNKNOWN" = "UNKNOWN";
    let diagnostic: string | undefined = undefined;
    let validatedReceipt: PhysicalArtifactReceipt | undefined = undefined;

    // 1. Inspect physical filesystem (direct probe)
    try {
      const absPath = resolve(record.path);
      if (existsSync(absPath)) {
        const stats = statSync(absPath);
        if (stats.isFile()) {
          physicalExistenceProven = true;
          physicalByteLength = stats.size;
          const buf = readFileSync(absPath);
          physicalSha256 = createHash("sha256").update(buf).digest("hex");
          truthBasis = "PHYSICAL_FILE_PROBE";

          // Detect mismatches against reported metadata
          if (reportedSha256 && reportedSha256 !== "UNKNOWN" && reportedSha256.toLowerCase() !== physicalSha256.toLowerCase()) {
            hashMismatchDetected = true;
          }
          if (reportedByteLength !== undefined && reportedByteLength !== physicalByteLength) {
            sizeMismatchDetected = true;
          }
        }
      }
    } catch {
      // Inaccessible or filesystem error -> direct physical probe fails
      physicalExistenceProven = false;
    }

    // 2. Evaluate authoritative physical receipt
    const receipt = record.authoritativeReceipt;
    if (receipt) {
      const allowedSources = [
        "ARTIFACT_LINEAGE_JUDGE",
        "PHYSICAL_PROBE",
        "F7_VERIFICATION",
        "OTHER_AUTHORITATIVE_FACTORYOS_SOURCE",
      ];

      const isReceiptArtifactMatch = receipt.artifactId === record.id;
      const isReceiptPathMatch =
        !receipt.path ||
        receipt.path === record.path ||
        resolve(receipt.path) === resolve(record.path);
      const isByteLengthValid =
        typeof receipt.byteLength === "number" &&
        !isNaN(receipt.byteLength) &&
        receipt.byteLength >= 0;
      const isSha256Valid =
        typeof receipt.sha256 === "string" &&
        receipt.sha256.trim().length >= 16;
      const isSourceAllowed =
        typeof receipt.source === "string" &&
        allowedSources.includes(receipt.source);

      if (!isReceiptArtifactMatch) {
        diagnostic = "PHYSICAL_RECEIPT_ARTIFACT_MISMATCH";
      } else if (!isReceiptPathMatch || !isByteLengthValid || !isSha256Valid || !isSourceAllowed) {
        diagnostic = "INVALID_PHYSICAL_RECEIPT";
      } else {
        // Receipt is structurally valid
        validatedReceipt = receipt;
        receiptByteLength = receipt.byteLength;
        receiptSha256 = receipt.sha256;

        if (physicalExistenceProven) {
          // Case A: Filesystem facts WIN. Receipt is supporting evidence.
          if (
            receipt.byteLength !== physicalByteLength ||
            receipt.sha256.toLowerCase() !== (physicalSha256 ?? "").toLowerCase()
          ) {
            receiptMismatchDetected = true;
          }
        } else {
          // Case C: Filesystem unavailable / missing, valid authoritative receipt exists
          physicalExistenceProven = true;
          truthBasis = "AUTHORITATIVE_PHYSICAL_RECEIPT";
          physicalByteLength = receipt.byteLength;
          physicalSha256 = receipt.sha256;

          if (reportedSha256 && reportedSha256 !== "UNKNOWN" && reportedSha256.toLowerCase() !== receipt.sha256.toLowerCase()) {
            hashMismatchDetected = true;
          }
          if (reportedByteLength !== undefined && reportedByteLength !== receipt.byteLength) {
            sizeMismatchDetected = true;
          }
        }
      }
    } else if (record.hasAuthoritativePhysicalReceipt === true) {
      // Test K1: Caller supplied boolean hasAuthoritativePhysicalReceipt without a valid receipt!
      // A caller boolean is not evidence -> Reject physical claim!
      diagnostic = "INVALID_PHYSICAL_RECEIPT";
    }

    // Determine final truthLevel and truthBasis
    let truthLevel: TruthLevel = "UNKNOWN";
    if (physicalExistenceProven && (truthBasis === "PHYSICAL_FILE_PROBE" || truthBasis === "AUTHORITATIVE_PHYSICAL_RECEIPT")) {
      truthLevel = "PHYSICAL";
    } else if (reportedByteLength !== undefined || reportedSha256 !== undefined) {
      truthBasis = "REPORTED_METADATA";
      truthLevel = "UNKNOWN";
    } else {
      truthBasis = "UNKNOWN";
      truthLevel = "UNKNOWN";
    }

    // Determine verification status
    let verificationStatus = record.verificationStatus ?? "UNKNOWN";
    if (physicalExistenceProven) {
      if (hashMismatchDetected || sizeMismatchDetected || receiptMismatchDetected) {
        verificationStatus = "FAILED";
      } else if (!record.verificationStatus || record.verificationStatus === "UNKNOWN") {
        verificationStatus = "VERIFIED";
      }
    }

    const actualByteLength = physicalByteLength ?? reportedByteLength ?? 0;
    const actualSha256 = physicalSha256 ?? reportedSha256 ?? "UNKNOWN";

    return {
      artifactId: record.id,
      path: record.path,
      producer: record.producer,
      consumers: record.consumers,
      byteLength: actualByteLength,
      sha256: actualSha256,
      reportedByteLength,
      reportedSha256,
      physicalByteLength,
      physicalSha256,
      receiptByteLength,
      receiptSha256,
      hashMismatchDetected,
      sizeMismatchDetected,
      receiptMismatchDetected,
      truthLevel,
      truthBasis,
      diagnostic,
      receipt: validatedReceipt,
      mimeType: record.mimeType ?? "application/octet-stream",
      durationSeconds: record.durationSeconds,
      durationTruth: record.durationTruth ?? (record.durationSeconds ? "AUTHORITATIVE_FFPROBE" : undefined),
      physicalExistenceProven,
      verificationStatus,
      probeResults: record.probeResults,
      lineageProof: record.lineageProof ?? {
        upstreamHashMatch: physicalExistenceProven && !hashMismatchDetected,
        consumerHashMatch: physicalExistenceProven && !hashMismatchDetected,
      },
      deliveryStatus: record.deliveryStatus ?? {
        localDelivered: physicalExistenceProven,
        remoteDelivered: false,
      },
      resolved: true,
    };
  }

  /**
   * Formats an inspector presentation card distinguishing PHYSICAL, RECEIPT-BACKED,
   * REPORTED, and UNKNOWN measurements with explicit mismatch warnings.
   */
  public static renderInspectionCard(res: ArtifactInspectionResult): string {
    const lines: string[] = [];
    lines.push(`ARTIFACT: ${res.artifactId}`);
    lines.push(`PATH: ${res.path}`);
    lines.push(`TRUTH LEVEL: ${res.truthLevel ?? "UNKNOWN"} (Basis: ${res.truthBasis ?? "UNKNOWN"})`);
    lines.push(`VERIFICATION: ${res.verificationStatus}`);

    lines.push(`--- SIZE ---`);
    if (res.physicalByteLength !== undefined) {
      lines.push(`  PHYSICAL: ${res.physicalByteLength.toLocaleString()} bytes`);
    }
    if (res.receiptByteLength !== undefined) {
      lines.push(`  RECEIPT-BACKED: ${res.receiptByteLength.toLocaleString()} bytes`);
    }
    if (res.reportedByteLength !== undefined) {
      lines.push(`  REPORTED: ${res.reportedByteLength.toLocaleString()} bytes`);
    }
    if (res.physicalByteLength === undefined && res.reportedByteLength === undefined) {
      lines.push(`  SIZE: UNKNOWN`);
    }

    lines.push(`--- SHA-256 ---`);
    if (res.physicalSha256 !== undefined) {
      lines.push(`  PHYSICAL: ${res.physicalSha256}`);
    }
    if (res.receiptSha256 !== undefined) {
      lines.push(`  RECEIPT-BACKED: ${res.receiptSha256}`);
    }
    if (res.reportedSha256 !== undefined) {
      lines.push(`  REPORTED: ${res.reportedSha256}`);
    }
    if (res.physicalSha256 === undefined && res.reportedSha256 === undefined) {
      lines.push(`  SHA-256: UNKNOWN`);
    }

    if (res.sizeMismatchDetected) {
      lines.push(`[SIZE MISMATCH] REPORTED: ${res.reportedByteLength} bytes | PHYSICAL: ${res.physicalByteLength} bytes`);
    }
    if (res.hashMismatchDetected) {
      lines.push(`[DIGEST MISMATCH] REPORTED: ${res.reportedSha256} | PHYSICAL: ${res.physicalSha256}`);
    }
    if (res.receiptMismatchDetected) {
      lines.push(`[RECEIPT MISMATCH] RECEIPT: ${res.receiptSha256} | PHYSICAL: ${res.physicalSha256}`);
    }
    if (res.diagnostic) {
      lines.push(`[DIAGNOSTIC] ${res.diagnostic}`);
    }

    return lines.join("\n");
  }
}
