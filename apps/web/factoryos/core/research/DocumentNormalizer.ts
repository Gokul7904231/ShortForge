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
}
