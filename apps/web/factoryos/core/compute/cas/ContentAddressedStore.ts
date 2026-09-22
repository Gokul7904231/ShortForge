/**
 * FactoryOS Content-Addressed Store (CAS) & Artifact Digest Registry
 *
 * Implements durable, content-addressed artifact indexing and physical integrity
 * validation for distributed compute jobs (Section 8).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { ArtifactRef, ArtifactBundle } from "../contracts/ComputeContracts";

export class ContentAddressedStore {
  private static instance: ContentAddressedStore | null = null;
  private storageDir: string;
  private index: Map<string, ArtifactRef> = new Map();

  public constructor(customDir?: string) {
    this.storageDir = customDir || path.resolve(process.cwd(), "data", "cas_storage");
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.rebuildIndex();
  }

  public static getInstance(customDir?: string): ContentAddressedStore {
    if (!ContentAddressedStore.instance || (customDir && ContentAddressedStore.instance.storageDir !== customDir)) {
      ContentAddressedStore.instance = new ContentAddressedStore(customDir);
    }
    return ContentAddressedStore.instance;
  }

  public static resetInstanceForTesting(customDir?: string): ContentAddressedStore {
    ContentAddressedStore.instance = new ContentAddressedStore(customDir);
    return ContentAddressedStore.instance;
  }

  /**
   * Rebuilds in-memory index from physical disk truth on startup/restart
   */
  public rebuildIndex(): void {
    this.index.clear();
    if (!fs.existsSync(this.storageDir)) return;

    try {
      const shards = fs.readdirSync(this.storageDir);
      for (const shard of shards) {
        const shardDir = path.join(this.storageDir, shard);
        if (!fs.statSync(shardDir).isDirectory()) continue;
        const files = fs.readdirSync(shardDir);
        for (const file of files) {
          if (file.endsWith(".tmp")) continue;
          const fullPath = path.join(shardDir, file);
          const stat = fs.statSync(fullPath);
          const ext = path.extname(file);
          const sha256 = path.basename(file, ext);
          if (sha256.length === 64) {
            this.index.set(sha256, {
              artifactId: `cas_${sha256.substring(0, 16)}`,
              role: "recovered_artifact",
              sha256,
              byteLength: stat.size,
              mimeType: ext === ".mp4" ? "video/mp4" : "application/octet-stream",
              uri: fullPath,
              metadata: {
                originalFilename: file,
                storedAt: stat.birthtime.toISOString(),
                recoveredOnStartup: true,
              },
            });
          }
        }
      }
    } catch {
      // Non-blocking reconstruction
    }
  }

  /**
   * Computes SHA-256 digest of a file on disk
   */
  public static async computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    });
  }

  /**
   * Stores a file in the CAS by its SHA-256 hash with atomic writes.
   */
  public async putFile(
    filePath: string,
    role: string,
    mimeType: string = "application/octet-stream",
    metadata?: Record<string, any>
  ): Promise<ArtifactRef> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[CAS] File does not exist: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    const sha256 = await ContentAddressedStore.computeFileSha256(filePath);

    // Two-level prefix sharding: e.g. data/cas_storage/ab/c123...
    const shard = sha256.substring(0, 2);
    const shardDir = path.join(this.storageDir, shard);
    if (!fs.existsSync(shardDir)) {
      fs.mkdirSync(shardDir, { recursive: true });
    }

    const ext = path.extname(filePath);
    const targetFile = path.join(shardDir, `${sha256}${ext}`);

    // Atomic write via temp file
    if (!fs.existsSync(targetFile)) {
      const tmpFile = path.join(shardDir, `${sha256}.tmp.${Date.now()}`);
      fs.copyFileSync(filePath, tmpFile);
      fs.renameSync(tmpFile, targetFile);
    } else {
      // Verify existing file integrity; if tampered, replace atomically
      const existingSha = await ContentAddressedStore.computeFileSha256(targetFile);
      if (existingSha !== sha256) {
        const tmpFile = path.join(shardDir, `${sha256}.tmp.${Date.now()}`);
        fs.copyFileSync(filePath, tmpFile);
        fs.renameSync(tmpFile, targetFile);
      }
    }

    const ref: ArtifactRef = {
      artifactId: `cas_${sha256.substring(0, 16)}`,
      role,
      sha256,
      byteLength: stat.size,
      mimeType,
      uri: targetFile,
      metadata: {
        originalFilename: path.basename(filePath),
        storedAt: new Date().toISOString(),
        ...(metadata || {}),
      },
    };

    this.index.set(sha256, ref);
    return ref;
  }

  /**
   * Verifies that an artifact reference matches physical truth.
   */
  public async verifyArtifactIntegrity(ref: ArtifactRef): Promise<{ valid: boolean; actualSha256?: string; error?: string }> {
    if (!ref.uri || !fs.existsSync(ref.uri)) {
      return { valid: false, error: `Physical file missing at ${ref.uri}` };
    }

    const actualSha = await ContentAddressedStore.computeFileSha256(ref.uri);
    if (actualSha !== ref.sha256) {
      return {
        valid: false,
        actualSha256: actualSha,
        error: `Digest mismatch! Expected ${ref.sha256}, calculated ${actualSha}`,
      };
    }

    return { valid: true, actualSha256: actualSha };
  }

  /**
   * Retrieves an artifact by its SHA-256 hash.
   */
  public getByHash(sha256: string): ArtifactRef | undefined {
    return this.index.get(sha256);
  }

  public async get(sha256: string): Promise<ArtifactRef | undefined> {
    return this.getByHash(sha256);
  }

  public async has(sha256: string): Promise<boolean> {
    return this.index.has(sha256);
  }

  public async verify(ref: ArtifactRef): Promise<boolean> {
    const res = await this.verifyArtifactIntegrity(ref);
    return res.valid;
  }

  /**
   * Creates an immutable ArtifactBundle from a list of artifact references.
   */
  public createBundle(bundleId: string, artifacts: ArtifactRef[]): ArtifactBundle {
    return {
      bundleId,
      artifacts,
      createdTimestamp: Date.now(),
    };
  }
}
