/**
 * FactoryOS v1 — History Compression Provider Boundary (Inspired by facebook/zstd)
 * Interface for cold storage compression of event logs, mission histories, and trajectory datasets.
 */

import * as zlib from "node:zlib";

export interface IHistoryCompressionProvider {
  readonly algorithm: string;
  compress(data: Buffer | string): Promise<Buffer>;
  decompress(buffer: Buffer): Promise<Buffer>;
}

export class NativeGzipHistoryCompressionProvider implements IHistoryCompressionProvider {
  readonly algorithm = "GZIP_FALLBACK";

  async compress(data: Buffer | string): Promise<Buffer> {
    const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    return new Promise((resolve, reject) => {
      zlib.gzip(buf, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  async decompress(buffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.gunzip(buffer, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
}
