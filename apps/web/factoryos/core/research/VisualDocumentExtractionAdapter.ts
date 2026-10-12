import { createHash } from "node:crypto";
import { z } from "zod";

export const VISUAL_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type VisualDocumentMimeType = (typeof VISUAL_DOCUMENT_MIME_TYPES)[number];

export interface VisualDocumentExtractionProvider {
  readonly providerId: string;
  extract(request: {
    readonly bytes: Uint8Array;
    readonly mimeType: VisualDocumentMimeType;
    readonly sourceSha256: string;
    readonly schemaDescription: string;
    readonly signal: AbortSignal;
  }): Promise<unknown>;
}

export interface VisualDocumentExtractionOptions {
  /** Must be deliberately enabled by a caller after license, privacy, and hardware review. */
  readonly enabled?: boolean;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
  readonly timeoutMs?: number;
}

export interface VisualDocumentExtractionRequest<T> {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  /** Opaque provenance reference. This adapter does not dereference it. */
  readonly sourceRef: string;
  /** Caller-owned, trusted description of the expected output contract. */
  readonly schemaDescription: string;
  readonly outputSchema: z.ZodType<T>;
}

export interface VisualDocumentExtractionReceipt<T> {
  readonly schemaVersion: "visual-document-extraction.v1";
  readonly sourceRef: string;
  readonly sourceSha256: string;
  readonly mimeType: VisualDocumentMimeType;
  readonly providerId: string;
  readonly extractedAt: string;
  readonly data: T;
  /** Extraction schema validity is not independent factual verification. */
  readonly verificationStatus: "UNVERIFIED";
}

export class VisualDocumentExtractionAdapter {
  private readonly enabled: boolean;
  private readonly maxInputBytes: number;
  private readonly maxOutputBytes: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly provider?: VisualDocumentExtractionProvider,
    options: VisualDocumentExtractionOptions = {},
  ) {
    this.enabled = options.enabled === true;
    this.maxInputBytes = options.maxInputBytes ?? 12 * 1024 * 1024;
    this.maxOutputBytes = options.maxOutputBytes ?? 256 * 1024;
    this.timeoutMs = options.timeoutMs ?? 30_000;

    if (!Number.isSafeInteger(this.maxInputBytes) || this.maxInputBytes < 1) {
      throw new Error("VISION_EXTRACTION_INVALID_INPUT_LIMIT");
    }
    if (!Number.isSafeInteger(this.maxOutputBytes) || this.maxOutputBytes < 1) {
      throw new Error("VISION_EXTRACTION_INVALID_OUTPUT_LIMIT");
    }
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120_000) {
      throw new Error("VISION_EXTRACTION_INVALID_TIMEOUT");
    }
  }

  public async extract<T>(
    request: VisualDocumentExtractionRequest<T>,
  ): Promise<VisualDocumentExtractionReceipt<T>> {
    if (!this.enabled) throw new Error("VISION_EXTRACTION_DISABLED");
    if (!this.provider) throw new Error("VISION_EXTRACTION_PROVIDER_UNAVAILABLE");
    if (!(request.bytes instanceof Uint8Array) || request.bytes.byteLength === 0) {
      throw new Error("VISION_EXTRACTION_EMPTY_INPUT");
    }
    if (request.bytes.byteLength > this.maxInputBytes) {
      throw new Error("VISION_EXTRACTION_INPUT_TOO_LARGE");
    }
    if (!(VISUAL_DOCUMENT_MIME_TYPES as readonly string[]).includes(request.mimeType)) {
      throw new Error("VISION_EXTRACTION_UNSUPPORTED_MIME_TYPE");
    }
    if (!request.sourceRef.trim() || request.sourceRef.length > 2048 || request.sourceRef.includes("\u0000")) {
      throw new Error("VISION_EXTRACTION_INVALID_SOURCE_REF");
    }
    if (!request.schemaDescription.trim() || request.schemaDescription.length > 4000) {
      throw new Error("VISION_EXTRACTION_INVALID_SCHEMA_DESCRIPTION");
    }

    const mimeType = request.mimeType as VisualDocumentMimeType;
    const stableBytes = new Uint8Array(request.bytes);
    const sourceSha256 = createHash("sha256").update(stableBytes).digest("hex");
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("VISION_EXTRACTION_TIMEOUT"));
        }, this.timeoutMs);
      });
      const providerPromise = this.provider.extract({
        bytes: stableBytes,
        mimeType,
        sourceSha256,
        schemaDescription: request.schemaDescription,
        signal: controller.signal,
      });
      const rawResult = await Promise.race([providerPromise, timeoutPromise]);
      const parsed = request.outputSchema.safeParse(rawResult);
      if (!parsed.success) throw new Error("VISION_EXTRACTION_SCHEMA_INVALID");

      const serialized = JSON.stringify(parsed.data);
      if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > this.maxOutputBytes) {
        throw new Error("VISION_EXTRACTION_OUTPUT_TOO_LARGE");
      }

      return {
        schemaVersion: "visual-document-extraction.v1",
        sourceRef: request.sourceRef,
        sourceSha256,
        mimeType,
        providerId: this.provider.providerId,
        extractedAt: new Date().toISOString(),
        data: parsed.data,
        verificationStatus: "UNVERIFIED",
      };
    } finally {
      if (timeout) clearTimeout(timeout);
      if (!controller.signal.aborted) controller.abort();
    }
  }
}
