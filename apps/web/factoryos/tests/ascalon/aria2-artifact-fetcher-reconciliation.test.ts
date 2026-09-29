import { describe, expect, it } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Aria2ProcessRunner,
  acquireWithAria2,
  assertAllowedHttpsUrl,
  buildAria2Args,
} from "../../../../training/ascalon/transfer/Aria2ArtifactFetcher";

describe("Ascalon aria2 artifact acquisition reconciliation", () => {
  const sha = crypto.createHash("sha256").update("hello").digest("hex");

  it("requires HTTPS and an exact explicit origin allowlist", () => {
    expect(() => assertAllowedHttpsUrl("http://example.com/model.bin", ["https://example.com"])).toThrow();
    expect(() => assertAllowedHttpsUrl("https://other.example/model.bin", ["https://example.com"])).toThrow();
    expect(() => assertAllowedHttpsUrl("https://example.com/model.bin", ["https://example.com"])).not.toThrow();
    expect(() => assertAllowedHttpsUrl("https://user:pass@example.com/model.bin", ["https://example.com"])).toThrow();
  });

  it("builds non-shell aria2 arguments with resume and independent checksum validation", () => {
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
    expect(args.every((arg) => !/[&;|]/.test(arg))).toBe(true);
  });

  it("independently verifies the bytes after aria2 exits", async () => {
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
