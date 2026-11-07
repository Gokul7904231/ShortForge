import { describe, expect, it } from "vitest";
import { LocalComputeProvider } from "../core/compute/providers/LocalComputeProvider";

describe("local compute provider hardware reporting", () => {
  it("reports GPU availability from the host rather than a hardcoded model", async () => {
    const capability = await new LocalComputeProvider().getCapability();

    expect(capability.gpuAvailable).toBe(capability.gpuType !== undefined);
    if (capability.gpuType) {
      expect(capability.gpuType).toMatch(/ \(h264_nvenc\)$/);
    }
  });
});
