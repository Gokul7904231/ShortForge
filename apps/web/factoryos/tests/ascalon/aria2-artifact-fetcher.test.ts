import { describe, it, expect } from "vitest";
import {
  assertAllowedHttpsUrl,
  buildAria2Args,
  acquireWithAria2,
  Aria2ProcessRunner,
} from "../../../../training/ascalon/transfer/Aria2ArtifactFetcher";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

describe("Ascalon aria2 artifact acquisition", () => {
  const sha = crypto.createHash("sha256").update("hello").digest("hex");

  it("requires HTTPS and an explicit origin allowlist", () => {
    expect(() => assertAllowedHttpsUrl("http://example.com/model.bin", ["https://example.com"])).toThrow();
    expect(() => assertAllowedHttpsUrl("https://other.example/model.bin", ["https://example.com"])).toThrow();
    expect(() => assertAllowedHttpsUrl("https://example.com/model.bin", ["https://example.com"])).not.toThrow();
  });

  it("builds non-shell aria2 arguments with integrity and resume enabled", () => {
    const args = buildAria2Args({
      sourceUrls: ["https://example.com/model.bin"],
      outputPath: "/tmp/ascalon/model.bin",
      expectedSha256: sha,
      allowedOrigins: ["https://example.com"],
      connections: 8,
    });
    expect(args).toContain("--check-integrity=true");
    expect(args).toContain("--continue=true");
    expect(args).toContain("--checksum=sha-256=" + sha);
    expect(args).toContain("https://example.com/model.bin");
    expect(args.some((arg) => arg.includes("&&") || arg.includes("|") || arg.includes(";"))).toBe(false);
  });

  it("independently verifies bytes after the downloader exits", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ascalon-aria2-"));
    const outputPath = path.join(dir, "model.bin");
    const runner: Aria2ProcessRunner = {
      async run(_executable, args) {
        const outArg = args.find((arg) => arg.startsWith("--out="))!;
        const dirArg = args.find((arg) => arg.startsWith("--dir="))!;
        fs.writeFileSync(path.join(dirArg.slice(6), outArg.slice(6)), "hello");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };
    const receipt = await acquireWithAria2({
      sourceUrls: ["https://example.com/model.bin"],
      outputPath,
      expectedSha256: sha,
      expectedByteLength: 5,
      allowedOrigins: ["https://example.com"],
    }, runner);
    expect(receipt.verified).toBe(true);
    expect(receipt.sha256).toBe(sha);
    expect(receipt.byteLength).toBe(5);
  });
});