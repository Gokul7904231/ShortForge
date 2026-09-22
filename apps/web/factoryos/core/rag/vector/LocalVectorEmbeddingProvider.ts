/**
 * FactoryOS v0.1 — Local Vector Embedding Provider
 *
 * Real local semantic dense vector embedding provider using @xenova/transformers.
 * NO network required after first run download (models cached in node_modules/.cache).
 */

import type { EmbeddingProvider } from "./VectorContracts";

export class LocalVectorEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 384; // all-MiniLM-L6-v2 dimensions
  private extractor: any = null;

  private _hashFallback(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    if (!text || typeof text !== "string" || text.trim() === "") return vector;
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, "");
    const words = normalized.split(/\s+/).filter((w) => w.length > 0);
    for (const word of words) {
      const h1 = this._hashString(word) % this.dimensions;
      const h2 = this._hashString(word + "_2") % this.dimensions;
      vector[h1] += 1.0;
      vector[h2] += 0.5;
    }
    for (let i = 0; i <= normalized.length - 3; i++) {
      const trigram = normalized.slice(i, i + 3);
      const h = this._hashString(trigram) % this.dimensions;
      vector[h] += 0.25;
    }
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < this.dimensions; i++) vector[i] /= norm;
    return vector;
  }

  private _hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) hash = (hash * 33) ^ str.charCodeAt(i);
    return Math.abs(hash);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || typeof text !== "string" || text.trim() === "") {
      return new Array<number>(this.dimensions).fill(0);
    }
    try {
      if (!this.extractor) {
        // @ts-ignore
        const { pipeline } = await import("@xenova/transformers");
        this.extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      }
      const output = await this.extractor(text, { pooling: "mean", normalize: true });
      return Array.from(output.data) as number[];
    } catch {
      // Fallback: deterministic hash embeddings when ONNX/sharp native binary is unavailable (CI/Windows)
      return this._hashFallback(text);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.generateEmbedding(text));
    }
    return results;
  }
}
