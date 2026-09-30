import { describe, expect, it } from "vitest";
import {
  AscalonBlenderDecisionBridge,
  validateAscalonBlenderDecision,
} from "../../apps/web/factoryos/core/intelligence/visual/AscalonBlenderDecisionBridge";

const base = {
  missionId: "mission_blender_001",
  jobId: "job_blender_001",
  floorId: "floor06_rendering",
  semanticAction: "RENDER" as const,
  arguments: { code: "print('render')", user_prompt: "render the scene" },
  guardianAuthorization: {
    granted: true,
    certificateId: "cert_001",
    policyVersion: "policy_v1",
    grantedAt: new Date().toISOString(),
  },
  environment: "test" as const,
};

test("read-only scene inspection does not require a Guardian certificate", () => {
  const result = validateAscalonBlenderDecision({
    ...base,
    semanticAction: "SCENE_INSPECT",
    arguments: {},
    guardianAuthorization: undefined,
  });

  expect(result.valid).toBe(true);
  expect(result.actionRisk).toBe("READ_ONLY");
});

test("mutating Blender decisions require Guardian authorization", () => {
  const result = validateAscalonBlenderDecision({
    ...base,
    semanticAction: "OBJECT_CREATE",
    arguments: { code: "print('create')" },
    guardianAuthorization: undefined,
  });

  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Guardian authorization is required for Blender action OBJECT_CREATE");
});

test("multi-provider asset decisions require an explicit provider", () => {
  const result = validateAscalonBlenderDecision({
    ...base,
    semanticAction: "ASSET_SEARCH",
    arguments: { query: "spaceship" },
    guardianAuthorization: undefined,
  });

  expect(result.valid).toBe(false);
  expect(result.errors).toContain(
    "Explicit provider selection is required for multi-provider asset actions",
  );
});

test("arbitrary Blender Python requires Guardian authorization and code", () => {
  const result = validateAscalonBlenderDecision({
    ...base,
    semanticAction: "PYTHON_EXECUTE",
    arguments: {},
    guardianAuthorization: undefined,
  });

  expect(result.valid).toBe(false);
  expect(result.errors).toContain("PYTHON_EXECUTE requires an explicit Guardian grant");
  expect(result.errors).toContain("PYTHON_EXECUTE requires arguments.code");
});

test("bridge emits canonical blender.mcp capability requests", () => {
  const bridge = new AscalonBlenderDecisionBridge({} as any);
  const request = bridge.buildCapabilityRequest(base);

  expect(request.capabilityId).toBe("blender.mcp");
  expect(request.missionId).toBe("mission_blender_001");
  expect(request.jobId).toBe("job_blender_001");
  expect(request.floorId).toBe("floor06_rendering");
  expect(request.callerRole).toBe("OVERSEER");
  expect(request.initiatedBy).toBe("overseer");
  expect((request.inputData as any).action).toBe("RENDER");
  expect((request.inputData as any).guardianAuthorization.certificateId).toBe("cert_001");
});
