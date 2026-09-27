/**
 * Project Ascalon — verified large-artifact acquisition using aria2c.
 *
 * This module is an isolated acquisition helper, not an artifact authority.
 * It accepts HTTPS sources only, requires an expected SHA-256, invokes aria2c
 * without shell interpolation, and independently re-hashes the completed file.
 * The caller must still promote the verified file into the canonical CAS.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";

export interface Aria2ArtifactRequest {
  sourceUrls: readonly string[];
  outputPath: string;
  expectedSha256: string;
  expectedByteLength?: number;
  allowedOrigins: readonly string[];
  connections?: number;
  executable?: string;
}

export interface Aria2ArtifactReceipt {
  method: "ARIA2_MULTI_SOURCE";
  sourceUrls: readonly string[];
  outputPath: string;
  sha256: string;
  byteLength: number;
  exitCode: number;
  verified: boolean;
  acquiredAt: string;
}

export interface Aria2ProcessRunner {
  run(executable: string, args: readonly string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

const defaultRunner: Aria2ProcessRunner = {
  run(executable, args, cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
    });
  },
};

export function assertAllowedHttpsUrl(url: string, allowedOrigins: readonly string[]): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Ascalon artifact acquisition permits HTTPS sources only");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Credential-bearing artifact URLs are forbidden");
  }
  if (allowedOrigins.length === 0) {
    throw new Error("At least one explicit artifact source origin must be configured");
  }
  const allowed = allowedOrigins.some((origin) => parsed.origin === new URL(origin).origin);
  if (!allowed) {
    throw new Error("Artifact source origin is not allowlisted: " + parsed.origin);
  }
}

export function buildAria2Args(request: Aria2ArtifactRequest): string[] {
  if (!/^[a-f0-9]{64}$/i.test(request.expectedSha256)) {
    throw new Error("expectedSha256 must be a 64-character SHA-256 digest");
  }
  if (request.sourceUrls.length === 0) {
    throw new Error("At least one source URL is required");
  }
  request.sourceUrls.forEach((url) => assertAllowedHttpsUrl(url, request.allowedOrigins));
  const connections = Math.max(1, Math.min(32, request.connections ?? 8));
  const outputPath = path.resolve(request.outputPath);
  return [
    "--dir=" + path.dirname(outputPath),
    "--out=" + path.basename(outputPath),
    "--check-integrity=true",
    "--continue=true",
    "--allow-overwrite=false",
    "--auto-file-renaming=false",
    "--max-connection-per-server=" + connections,
    "--split=" + connections,
    "--min-split-size=1M",
    "--file-allocation=none",
    "--checksum=sha-256=" + request.expectedSha256.toLowerCase(),
    ...request.sourceUrls,
  ];
}

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function acquireWithAria2(
  request: Aria2ArtifactRequest,
  runner: Aria2ProcessRunner = defaultRunner,
): Promise<Aria2ArtifactReceipt> {
  const args = buildAria2Args(request);
  const outputPath = path.resolve(request.outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const result = await runner.run(request.executable ?? "aria2c", args, path.dirname(outputPath));
  if (result.exitCode !== 0) {
    throw new Error("aria2c failed with exit code " + result.exitCode + ": " + result.stderr.slice(-2_000));
  }
  if (!fs.existsSync(outputPath)) {
    throw new Error("aria2c reported success but output file does not exist");
  }

  const stat = fs.statSync(outputPath);
  if (stat.size <= 0) {
    throw new Error("aria2c produced an empty artifact");
  }
  if (request.expectedByteLength !== undefined && stat.size !== request.expectedByteLength) {
    throw new Error("Artifact byte length mismatch: expected " + request.expectedByteLength + ", got " + stat.size);
  }
  const sha256 = await sha256File(outputPath);
  if (sha256.toLowerCase() !== request.expectedSha256.toLowerCase()) {
    throw new Error("Artifact SHA-256 mismatch: expected " + request.expectedSha256 + ", got " + sha256);
  }

  return {
    method: "ARIA2_MULTI_SOURCE",
    sourceUrls: request.sourceUrls,
    outputPath,
    sha256,
    byteLength: stat.size,
    exitCode: result.exitCode,
    verified: true,
    acquiredAt: new Date().toISOString(),
  };
}