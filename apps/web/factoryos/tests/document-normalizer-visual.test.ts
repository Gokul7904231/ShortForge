import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DocumentNormalizer } from "../core/research/DocumentNormalizer";
import {
  VisualDocumentExtractionAdapter,
  type VisualDocumentExtractionProvider,
} from "../core/research/VisualDocumentExtractionAdapter";

const schema = z.object({ title: z.string().min(1), summary: z.string().min(1) }).strict();

function fakeProvider(response: unknown): VisualDocumentExtractionProvider {
  return {
    providerId: "document-fixture",
    executionBoundary: "LOCAL",
    async extract(request) {
      expect(request.mimeType).toBe("application/pdf");
      expect(request.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      return response;
    },
  };
}

describe("DocumentNormalizer opt-in visual extraction", () => {
  it("normalizes schema-valid vision output as escaped unverified text through the existing boundary", async () => {
    const adapter = new VisualDocumentExtractionAdapter(
      fakeProvider({ title: "Invoice", summary: "Text with <script>alert(1)</script> in the source." }),
      { enabled: true },
    );
    const document = await DocumentNormalizer.normalizeWithVision(
      Buffer.from("%PDF-1.7 fixture bytes"),
      "application/pdf",
      {
        adapter,
        sourceRef: "fixture://private-document/1",
        schemaDescription: "Extract title and summary.",
        outputSchema: schema,
      },
    );

    expect(document.metadata.engine).toBe("EXPERIMENTAL_VISUAL_EXTRACTION");
    expect(document.metadata.verificationStatus).toBe("UNVERIFIED");
    expect(document.metadata.sourceRefDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(document.metadata).not.toHaveProperty("sourceRef");
    expect(document.markdownContent).toContain("&lt;script&gt;");
    expect(document.markdownContent).not.toContain("<script>");
  });

  it("keeps the visual path gated by the injected adapter and enforces normalized output bounds", async () => {
    const disabled = new VisualDocumentExtractionAdapter(
      fakeProvider({ title: "Invoice", summary: "Short text" }),
    );
    await expect(DocumentNormalizer.normalizeWithVision(
      Buffer.from("%PDF"),
      "application/pdf",
      { adapter: disabled, sourceRef: "fixture://1", schemaDescription: "Extract.", outputSchema: schema },
    )).rejects.toThrow("VISION_EXTRACTION_DISABLED");

    const enabled = new VisualDocumentExtractionAdapter(
      fakeProvider({ title: "Invoice", summary: "A long enough document extraction result." }),
      { enabled: true },
    );
    await expect(DocumentNormalizer.normalizeWithVision(
      Buffer.from("%PDF"),
      "application/pdf",
      {
        adapter: enabled,
        sourceRef: "fixture://1",
        schemaDescription: "Extract.",
        outputSchema: schema,
        maxOutputByteLength: 10,
      },
    )).rejects.toThrow("DOCUMENT_NORMALIZER_VISUAL_OUTPUT_TOO_LARGE");
  });
});
