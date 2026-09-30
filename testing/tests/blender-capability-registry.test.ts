import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../../apps/web/factoryos/core/cognitive/CapabilityRegistry";

test("Blender MCP is exposed through the canonical Capability Registry", () => {
  const registry = new CapabilityRegistry();
  const capability = registry.get("blender.mcp");

  expect(capability).toBeDefined();
  expect(capability?.provider).toBe("mcp-for-blender");
  expect(capability?.requiresGuardianGate).toBe(true);
  expect(capability?.trainingEligibility).toBe("ELIGIBLE");
  expect(capability?.isProductionRoutable).toBe(true);
  expect(capability?.policy?.auditPolicy).toBe("EVIDENCE_REQUIRED");
});

test("Blender MCP policy spans only the intended visual/rendering floors", () => {
  const registry = new CapabilityRegistry();
  const capability = registry.get("blender.mcp");
  expect(capability?.policy?.allowedFloors).toEqual([
    "floor03_asset_realization",
    "floor04_media_synthesis",
    "floor05_timeline_composition",
    "floor06_rendering",
  ]);
});
