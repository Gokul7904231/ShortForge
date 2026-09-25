import { describe, expect, it } from "vitest";
import { RenderFabric } from "../core/fabric/RenderFabric";

describe("Floor 06 — Canonical Render Fabric", () => {
  it("exposes the ComputeRouter as the single routing authority", () => {
    const fabric = new RenderFabric();
    const router = fabric.getComputeRouter();

    expect(router.getProvider("provider_local_render")).toBeDefined();
    expect(fabric.getCompiler("FFMPEG")?.status).toBe("PRODUCTION_READY");
  });

  it("keeps the legacy RenderFabric path as a compatibility boundary only", async () => {
    const legacy = await import("../core/rendering/RenderFabric");
    expect(legacy.RenderFabric).toBeDefined();
    expect(legacy.FFmpegRenderCompiler).toBeDefined();
  });
});
