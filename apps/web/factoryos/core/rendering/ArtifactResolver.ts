/**
 * FactoryOS Frontier v3 — Authoritative Artifact Resolver
 * Resolves local and remote artifacts into verifiable local file paths for forensic media probing.
 * Hardened with SSRF protection, streaming byte limits, DNS validation, and atomic file safety.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as dns from "node:dns";
import { Readable } from "node:stream";
import type { RenderArtifact, ArtifactLocation } from "../contracts/RenderIntentContracts";

export interface ResolvedArtifact {
  readonly localPath: string;
  readonly byteLength: number;
  readonly verifiedSha256: string;
  readonly isTempDownload: boolean;
  cleanup?: () => Promise<void>;
}

export class ArtifactResolver {
  private tempDir: string;
  public static readonly MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024; // 250 MB
  public static readonly DOWNLOAD_TIMEOUT_MS = 15000; // 15 seconds

  constructor(tempDir?: string) {
    this.tempDir = tempDir || path.join(process.cwd(), "data", "factoryos_resolved_artifacts");
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Evaluates whether an IPv4 or IPv6 address belongs to private/internal/cloud-metadata subnets.
   */
  public static isPrivateOrRestrictedIp(ip: string): boolean {
    if (ip.includes(".")) {
      const parts = ip.split(".").map(Number);
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
      const [b0, b1] = parts;
      // 0.0.0.0/8
      if (b0 === 0) return true;
      // 127.0.0.0/8 (loopback)
      if (b0 === 127) return true;
      // 10.0.0.0/8 (RFC 1918)
      if (b0 === 10) return true;
      // 172.16.0.0/12 (RFC 1918)
      if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
      // 192.168.0.0/16 (RFC 1918)
      if (b0 === 192 && b1 === 168) return true;
      // 169.254.0.0/16 (link-local, cloud metadata 169.254.169.254)
      if (b0 === 169 && b1 === 254) return true;
      // Broadcast / multicast
      if (b0 >= 224) return true;
      return false;
    }

    const clean = ip.toLowerCase();
    if (clean === "::1" || clean === "::") return true;
    if (clean.startsWith("fc") || clean.startsWith("fd")) return true; // Unique local fc00::/7
    if (clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb")) return true; // Link-local fe80::/10
    if (clean.startsWith("::ffff:127.") || clean.startsWith("::ffff:10.") || clean.startsWith("::ffff:192.168.") || clean.startsWith("::ffff:172.")) return true;
    return false;
  }

  /**
   * Enforces HTTPS requirement, blocks private IP ranges, cloud metadata (169.254.169.254), and localhost.
   */
  public static async validateUrlAgainstSsrf(targetUrl: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new Error(`[ArtifactResolver] Malformed URL: ${targetUrl}`);
    }

    if (parsed.protocol !== "https:") {
      throw new Error(`[ArtifactResolver] Insecure HTTP scheme rejected; HTTPS required for remote artifact resolution`);
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      throw new Error(`[ArtifactResolver] SSRF Protection: Access to localhost or internal hostname '${hostname}' is strictly prohibited`);
    }

    // Perform DNS inspection on hostname to prevent private IP resolution
    try {
      const records = await dns.promises.lookup(hostname, { all: true });
      for (const record of records) {
        if (ArtifactResolver.isPrivateOrRestrictedIp(record.address)) {
          throw new Error(
            `[ArtifactResolver] SSRF Protection: Destination resolves to restricted/private IP (${record.address})`
          );
        }
      }
    } catch (err: any) {
      if (err.message.includes("SSRF Protection")) throw err;
      throw new Error(`[ArtifactResolver] DNS resolution failed for hostname '${hostname}': ${err.message}`);
    }
  }

  async resolve(artifact: Partial<RenderArtifact> & { location: ArtifactLocation }): Promise<ResolvedArtifact> {
    if (!artifact) {
      throw new Error("[ArtifactResolver] Cannot resolve null/undefined artifact");
    }

    if (artifact.location.kind === "LOCAL") {
      const rawPath = artifact.location.path;
      const normalized = path.normalize(rawPath);
      if (normalized.includes("..") && (normalized.startsWith("../") || normalized.startsWith("..\\"))) {
        throw new Error(`[ArtifactResolver] Local path traversal detected: ${rawPath}`);
      }

      const localPath = path.resolve(normalized);
      if (!fs.existsSync(localPath)) {
        throw new Error(`[ArtifactResolver] Local artifact file does not exist: ${localPath}`);
      }

      // Approved Root Containment & Symlink Escape Defense
      const realPath = fs.realpathSync(localPath);
      const cwd = process.cwd();

      // Dynamically locate repository root across monorepo packages
      let repoRoot = cwd;
      let curr = cwd;
      for (let i = 0; i < 4; i++) {
        const checkPkg = path.join(curr, "package.json");
        if (fs.existsSync(checkPkg)) {
          repoRoot = curr;
        }
        const parent = path.dirname(curr);
        if (parent === curr) break;
        curr = parent;
      }

      const approvedRoots = [
        cwd,
        repoRoot,
        path.resolve(cwd, "data"),
        path.resolve(cwd, "public"),
        path.resolve(repoRoot, "testing", "artifacts"),
        this.tempDir,
      ];
      const isContained = approvedRoots.some((root) => {
        const normRoot = path.normalize(root);
        const normReal = path.normalize(realPath);
        if (process.platform === "win32") {
          const lowerRoot = normRoot.toLowerCase();
          const lowerReal = normReal.toLowerCase();
          return lowerReal === lowerRoot || lowerReal.startsWith(lowerRoot + path.sep);
        }
        return normReal === normRoot || normReal.startsWith(normRoot + path.sep);
      });
      if (!isContained) {
        throw new Error(
          `[ArtifactResolver] Local path security rejection: Path '${rawPath}' escapes approved storage boundaries (${realPath})`
        );
      }

      const stat = fs.statSync(localPath);
      if (stat.size === 0) {
        throw new Error(`[ArtifactResolver] Local artifact file has 0 bytes: ${localPath}`);
      }

      // Compute actual SHA-256 of file on disk
      const hash = await this.computeFileSha256(localPath);
      if (artifact.sha256 && artifact.sha256 !== hash) {
        throw new Error(
          `[ArtifactResolver] SHA-256 checksum mismatch for ${localPath}! Expected ${artifact.sha256}, calculated ${hash}`
        );
      }

      return {
        localPath,
        byteLength: stat.size,
        verifiedSha256: hash,
        isTempDownload: false,
      };
    }

    if (artifact.location.kind === "REMOTE" || artifact.location.kind === "OBJECT_STORAGE") {
      const finalDownloadPath = path.join(this.tempDir, `resolved_${artifact.jobId}_${Date.now()}.mp4`);
      const tempDownloadPath = `${finalDownloadPath}.tmp_${crypto.randomUUID().substring(0, 8)}`;
      const uri = artifact.location.uri;

      // Handle file:// URI scheme directly (local test harness)
      if (uri.startsWith("file://")) {
        const sourcePath = path.resolve(path.normalize(uri.replace("file://", "")));
        if (!fs.existsSync(sourcePath)) {
          throw new Error(`[ArtifactResolver] Remote file URI not found: ${sourcePath}`);
        }
        fs.copyFileSync(sourcePath, finalDownloadPath);
      } else if (uri.startsWith("https://")) {
        // Enforce SSRF and IP restrictions
        await ArtifactResolver.validateUrlAgainstSsrf(uri);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ArtifactResolver.DOWNLOAD_TIMEOUT_MS);

        try {
          let currentUrl = uri;
          let redirectCount = 0;
          let res: Response;

          while (true) {
            res = await fetch(currentUrl, {
              signal: controller.signal,
              redirect: "manual",
            });

            if ([301, 302, 303, 307, 308].includes(res.status)) {
              redirectCount++;
              if (redirectCount > 3) {
                throw new Error(`[ArtifactResolver] Too many redirects (max 3) from ${uri}`);
              }
              const location = res.headers.get("location");
              if (!location) {
                throw new Error(`[ArtifactResolver] Redirect status ${res.status} missing Location header`);
              }
              const nextUrl = new URL(location, currentUrl).toString();
              await ArtifactResolver.validateUrlAgainstSsrf(nextUrl);
              currentUrl = nextUrl;
              continue;
            }
            break;
          }

          if (!res.ok) {
            throw new Error(`[ArtifactResolver] Failed to download remote artifact: HTTP ${res.status} from ${currentUrl}`);
          }

          const contentLengthHeader = res.headers.get("content-length");
          if (contentLengthHeader) {
            const contentLength = parseInt(contentLengthHeader, 10);
            if (contentLength > ArtifactResolver.MAX_DOWNLOAD_BYTES) {
              throw new Error(
                `[ArtifactResolver] Remote artifact exceeds maximum allowed download size (${ArtifactResolver.MAX_DOWNLOAD_BYTES} bytes, got ${contentLength})`
              );
            }
          }

          if (!res.body) {
            throw new Error(`[ArtifactResolver] Response body is empty for ${uri}`);
          }

          // Stream download directly to disk with bounded memory and running byte counter
          let bytesDownloaded = 0;
          const fileStream = fs.createWriteStream(tempDownloadPath);

          const bodyStream = Readable.fromWeb(res.body as any);
          for await (const chunk of bodyStream) {
            bytesDownloaded += chunk.length;
            if (bytesDownloaded > ArtifactResolver.MAX_DOWNLOAD_BYTES) {
              fileStream.destroy();
              if (fs.existsSync(tempDownloadPath)) {
                try { fs.unlinkSync(tempDownloadPath); } catch {}
              }
              throw new Error(
                `[ArtifactResolver] Remote artifact exceeded maximum allowed download size (${ArtifactResolver.MAX_DOWNLOAD_BYTES} bytes) during streaming`
              );
            }
            fileStream.write(chunk);
          }

          await new Promise<void>((resolve, reject) => {
            fileStream.end(() => resolve());
            fileStream.on("error", reject);
          });

          // Compute checksum on completed temp download
          const hash = await this.computeFileSha256(tempDownloadPath);
          if (artifact.sha256 && artifact.sha256 !== hash) {
            if (fs.existsSync(tempDownloadPath)) {
              try { fs.unlinkSync(tempDownloadPath); } catch {}
            }
            throw new Error(
              `[ArtifactResolver] Downloaded remote artifact SHA-256 mismatch! Expected ${artifact.sha256}, got ${hash}`
            );
          }

          // Atomic promotion: rename temp file to final download path
          try {
            if (fs.existsSync(finalDownloadPath)) fs.unlinkSync(finalDownloadPath);
            fs.renameSync(tempDownloadPath, finalDownloadPath);
          } catch {
            fs.copyFileSync(tempDownloadPath, finalDownloadPath);
            fs.unlinkSync(tempDownloadPath);
          }
        } catch (err) {
          if (fs.existsSync(tempDownloadPath)) {
            try { fs.unlinkSync(tempDownloadPath); } catch {}
          }
          throw err;
        } finally {
          clearTimeout(timeout);
        }
      } else if (uri.startsWith("http://")) {
        throw new Error(`[ArtifactResolver] Insecure HTTP scheme rejected; HTTPS required for remote artifact resolution`);
      } else {
        throw new Error(`[ArtifactResolver] Unsupported artifact URI scheme: ${uri}`);
      }

      const stat = fs.statSync(finalDownloadPath);
      const hash = await this.computeFileSha256(finalDownloadPath);
      if (artifact.sha256 && artifact.sha256 !== hash) {
        fs.unlinkSync(finalDownloadPath);
        throw new Error(
          `[ArtifactResolver] Downloaded remote artifact SHA-256 mismatch! Expected ${artifact.sha256}, got ${hash}`
        );
      }

      return {
        localPath: finalDownloadPath,
        byteLength: stat.size,
        verifiedSha256: hash,
        isTempDownload: true,
        cleanup: async () => {
          if (fs.existsSync(finalDownloadPath)) {
            try {
              fs.unlinkSync(finalDownloadPath);
            } catch {}
          }
        },
      };
    }

    throw new Error(`[ArtifactResolver] Unknown artifact location kind: ${(artifact.location as any)?.kind}`);
  }

  private computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    });
  }
}
