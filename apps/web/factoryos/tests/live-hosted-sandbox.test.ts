import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import { DaytonaSandboxAdapter, ModalSandboxAdapter } from "../core/compute/sandboxes";

describe("live hosted sandbox compute proof", () => {
  it("provisions, executes a physical render, downloads it, and verifies CAS integrity", async () => {
    const provider = String(process.env.SHORTFORGE_LIVE_SANDBOX_PROVIDER || "").toUpperCase();
    const command = process.env.SHORTFORGE_LIVE_SANDBOX_RENDER_COMMAND;
    const outputPath = process.env.SHORTFORGE_LIVE_SANDBOX_OUTPUT_PATH || "/tmp/shortforge/live-smoke.mp4";

    expect(["DAYTONA", "MODAL"]).toContain(provider);
    expect(command).toBeTruthy();

    const adapter = provider === "DAYTONA" ? new DaytonaSandboxAdapter() : new ModalSandboxAdapter();
    const validation = await adapter.validateCredentials();
    expect(validation.configured).toBe(true);
    expect(validation.authenticated).toBe(true);
    expect(validation.providerReachable).toBe(true);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shortforge-live-sandbox-"));
    const localOutput = path.join(tempDir, "live-smoke.mp4");
    let runtime: any;

    try {
      const provision = await adapter.provision({
        idempotencyKey: "live-sandbox-smoke-" + Date.now().toString(36),
        template: process.env.SHORTFORGE_LIVE_SANDBOX_IMAGE ||
          (provider === "DAYTONA" ? process.env.DAYTONA_SANDBOX_IMAGE : process.env.MODAL_SANDBOX_IMAGE),
        ttlSeconds: 900,
        metadata: { shortforge_name: "shortforge-live-sandbox-smoke" },
      });

      runtime = provision.runtime;
      if (runtime.state !== "RUNNING" && runtime.state !== "READY") {
        runtime = await adapter.waitReady(runtime.resourceId, 120_000);
      }

      const result = await adapter.execute({
        runtime,
        command: command.replaceAll("{{OUTPUT_PATH}}", outputPath),
        timeoutMs: 120_000,
        env: { SHORTFORGE_OUTPUT_PATH: outputPath },
      });

      expect(result.status).toBe("SUCCEEDED");
      expect(result.exitCode).toBe(0);

      await fs.mkdir(path.dirname(localOutput), { recursive: true });
      if (!adapter.downloadFile) throw new Error("LIVE_SANDBOX_DOWNLOAD_UNSUPPORTED");
      await adapter.downloadFile({
        runtime,
        remotePath: outputPath,
        localPath: localOutput,
        timeoutMs: 120_000,
      });

      const stat = await fs.stat(localOutput);
      expect(stat.size).toBeGreaterThan(1024);

      const cas = ContentAddressedStore.getInstance();
      const artifact = await cas.putFile(localOutput, "output_mp4", "video/mp4", {
        provider,
        proof: "live-hosted-sandbox",
        runtimeId: runtime.resourceId,
      });

      expect(artifact.sha256).toHaveLength(64);
      expect(artifact.byteLength).toBe(stat.size);
      expect(await cas.verify(artifact)).toBe(true);
    } finally {
      if (runtime) await adapter.terminate(runtime).catch(() => undefined);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }, 180_000);
});
