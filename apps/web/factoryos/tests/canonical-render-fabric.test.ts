import { describe, expect, it } from "vitest";
import { RenderFabric } from "../core/fabric/RenderFabric";

describe("Floor 06 — Canonical Render Fabric", () => {
  it("exposes the ComputeRouter as the single routing authority", () => {
    const fabric = new RenderFabric();
    const router = fabric.getComputeRouter();

    expect(router.getProvider("provider_local_render")).toBeDefined();
    expect(fabric.getCompiler("FFMPEG")?.status).toBe("PRODUCTION_READY");
  });

  it("does not expose a second RenderFabric implementation", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const legacyPath = path.resolve(process.cwd(), "factoryos/core/rendering/RenderFabric.ts");
    expect(fs.existsSync(legacyPath)).toBe(false);
  });
});
