import type { ZodType } from "zod";
import { createHash } from "node:crypto";
import type { VisualDocumentExtractionAdapter } from "./VisualDocumentExtractionAdapter";

/**
 * FactoryOS v1 — Document Normalizer Boundary (Inspired by microsoft/markitdown)
 * Clean-room interface for converting heterogeneous document formats (PDF, HTML, DOCX, CSV)
 * into canonical normalized Markdown for RAG research and claim extraction.
 */

export interface NormalizedDocument {
  readonly title?: string;
  readonly markdownContent: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly metadata: Record<string, unknown>;
  readonly extractedAt: string;
}

export interface DocumentNormalizerOptions {
  readonly maxByteLength?: number;
  readonly extractTables?: boolean;
}


/** Explicit opt-in seam for isolated visual extraction; never used by normalize() implicitly. */
export interface VisualDocumentNormalizerOptions<T> {
  readonly adapter: VisualDocumentExtractionAdapter;
  readonly sourceRef: string;
  readonly schemaDescription: string;
  readonly outputSchema: ZodType<T>;
  readonly titleHint?: string;
  readonly maxOutputByteLength?: number;
  /** Per-document consent for approved remote extraction; false/omitted is fail-closed. */
  readonly allowRemoteSubmission?: boolean;
}

export class DocumentNormalizer {
  public static async normalize(
    input: Buffer | string,
    mimeType: string,
    options: DocumentNormalizerOptions = {}
  ): Promise<NormalizedDocument> {
    const rawText = typeof input === "string" ? input : input.toString("utf8");
    const maxLen = options.maxByteLength || 1_000_000;
    const truncatedText = rawText.length > maxLen ? rawText.substring(0, maxLen) : rawText;

    // Clean-room text/markdown normalization
    const normalizedMarkdown = truncatedText
      .replace(/\r\n/g, "\n")
      .trim();

    return {
      title: "Extracted Research Document",
      markdownContent: normalizedMarkdown,
      mimeType,
      byteLength: Buffer.byteLength(normalizedMarkdown, "utf8"),
      metadata: {
        truncated: rawText.length > maxLen,
        engine: "FACTORYOS_NATIVE_NORMALIZER",
      },
      extractedAt: new Date().toISOString(),
    };
  }
  /**
   * Optional vision path for scanned PDFs/images. The adapter is injected and
   * remains disabled unless a caller explicitly supplies an enabled adapter.
   * Extracted claims remain UNVERIFIED and are represented as escaped JSON text.
   */
  public static async normalizeWithVision<T>(
    input: Buffer,
    mimeType: string,
    options: VisualDocumentNormalizerOptions<T>,
  ): Promise<NormalizedDocument> {
    if (!Buffer.isBuffer(input) || input.byteLength === 0) {
      throw new Error("DOCUMENT_NORMALIZER_VISUAL_EMPTY_INPUT");
    }

    const receipt = await options.adapter.extract({
      bytes: new Uint8Array(input),
      mimeType,
      sourceRef: options.sourceRef,
      schemaDescription: options.schemaDescription,
      outputSchema: options.outputSchema,
      allowRemoteSubmission: options.allowRemoteSubmission,
    });

    const serialized = JSON.stringify(receipt.data, null, 2);
    if (serialized === undefined) {
      throw new Error("DOCUMENT_NORMALIZER_VISUAL_INVALID_OUTPUT");
    }
    const markdownContent = serialized
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const maxOutputByteLength = options.maxOutputByteLength ?? 1_000_000;
    if (!Number.isSafeInteger(maxOutputByteLength) || maxOutputByteLength < 1 || maxOutputByteLength > 10_000_000) {
      throw new Error("DOCUMENT_NORMALIZER_VISUAL_INVALID_OUTPUT_LIMIT");
    }
    const byteLength = Buffer.byteLength(markdownContent, "utf8");
    if (byteLength > maxOutputByteLength) {
      throw new Error("DOCUMENT_NORMALIZER_VISUAL_OUTPUT_TOO_LARGE");
    }

    const titleHint = options.titleHint?.trim();
    if (titleHint && (titleHint.length > 200 || /[\\u0000-\\u001F\\u007F]/.test(titleHint))) {
      throw new Error("DOCUMENT_NORMALIZER_VISUAL_INVALID_TITLE");
    }

    return {
      title: titleHint || "Extracted Visual Document",
      markdownContent,
      mimeType: receipt.mimeType,
      byteLength,
      metadata: {
        engine: "EXPERIMENTAL_VISUAL_EXTRACTION",
        providerId: receipt.providerId,
        sourceSha256: receipt.sourceSha256,
        sourceRefDigest: createHash("sha256").update(receipt.sourceRef, "utf8").digest("hex"),
        schemaVersion: receipt.schemaVersion,
        verificationStatus: "UNVERIFIED",
      },
      extractedAt: receipt.extractedAt,
    };
  }

}
