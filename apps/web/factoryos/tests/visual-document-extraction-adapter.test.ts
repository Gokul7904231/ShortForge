import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  VisualDocumentExtractionAdapter,
  type VisualDocumentExtractionProvider,
} from "../core/research/VisualDocumentExtractionAdapter";

const outputSchema = z.object({ title: z.string().min(1), pageCount: z.number().int().positive() }).strict();

function providerReturning(value: unknown): VisualDocumentExtractionProvider {
  return {
    providerId: "test-vision-provider",
    extract: vi.fn(async () => value),
  };
}

const request = (overrides: {
  readonly bytes?: Uint8Array;
  readonly mimeType?: string;
  readonly sourceRef?: string;
  readonly schemaDescription?: string;
} = {}) => ({
  bytes: overrides.bytes ?? new Uint8Array([1, 2, 3, 4]),
  mimeType: overrides.mimeType ?? "application/pdf",
  sourceRef: overrides.sourceRef ?? "fixture://document-1",
  schemaDescription: overrides.schemaDescription ?? "Return title and positive pageCount.",
  outputSchema,
});

describe("VisualDocumentExtractionAdapter", () => {
  it("is disabled by default and does not call the provider", async () => {
    const provider = providerReturning({ title: "valid", pageCount: 1 });
    const adapter = new VisualDocumentExtractionAdapter(provider);

    await expect(adapter.extract(request())).rejects.toThrow("VISION_EXTRACTION_DISABLED");
    expect(provider.extract).not.toHaveBeenCalled();
  });

  it("validates output locally and records the source digest without claiming verification", async () => {
    const provider = providerReturning({ title: "Invoice", pageCount: 2 });
    const adapter = new VisualDocumentExtractionAdapter(provider, { enabled: true });
    const input = request();

    const receipt = await adapter.extract(input);

    expect(receipt.sourceSha256).toBe(createHash("sha256").update(input.bytes).digest("hex"));
    expect(receipt.providerId).toBe("test-vision-provider");
    expect(receipt.verificationStatus).toBe("UNVERIFIED");
    expect(receipt.data).toEqual({ title: "Invoice", pageCount: 2 });
  });

  it("rejects schema-invalid output and enforces MIME/byte limits before provider execution", async () => {
    const provider = providerReturning({ title: "", pageCount: -1 });
    const adapter = new VisualDocumentExtractionAdapter(provider, { enabled: true, maxInputBytes: 4 });

    await expect(adapter.extract(request())).rejects.toThrow("VISION_EXTRACTION_SCHEMA_INVALID");
    await expect(adapter.extract(request({ bytes: new Uint8Array(5) }))).rejects.toThrow("VISION_EXTRACTION_INPUT_TOO_LARGE");
    await expect(adapter.extract(request({ mimeType: "text/html" }))).rejects.toThrow("VISION_EXTRACTION_UNSUPPORTED_MIME_TYPE");
    expect(provider.extract).toHaveBeenCalledTimes(1);
  });

  it("aborts a provider that exceeds the configured timeout", async () => {
    let signal: AbortSignal | undefined;
    const provider: VisualDocumentExtractionProvider = {
      providerId: "slow-provider",
      extract: ({ signal: providerSignal }) => {
        signal = providerSignal;
        return new Promise(() => undefined);
      },
    };
    const adapter = new VisualDocumentExtractionAdapter(provider, { enabled: true, timeoutMs: 5 });

    await expect(adapter.extract(request())).rejects.toThrow("VISION_EXTRACTION_TIMEOUT");
    expect(signal?.aborted).toBe(true);
  });
});
