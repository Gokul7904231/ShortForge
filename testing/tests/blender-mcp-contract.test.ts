import { describe, expect, it } from "vitest";
import {
  resolveBlenderActionAgainstTools,
} from "../../apps/web/factoryos/core/comms/BlenderMcpAdapter";
import type { BlenderToolDescriptor } from "../../apps/web/factoryos/core/comms/BlenderMcpContracts";

const tools = (names: string[]): BlenderToolDescriptor[] =>
  names.map((name) => ({ name, description: name }));

it("scene inspection resolves to the discovered inspection tool", () => {
  const result = resolveBlenderActionAgainstTools(
    "SCENE_INSPECT",
    tools(["get_scene_info", "execute_blender_code"]),
    false,
  );
  expect(result).toMatchObject({
    resolved: true,
    toolName: "get_scene_info",
    reasonCode: "RESOLVED",
  });
});

test("mutation resolves to execute_blender_code only when it is actually advertised", () => {
  expect(
    resolveBlenderActionAgainstTools(
      "OBJECT_CREATE",
      tools(["get_scene_info"]),
      false,
    ).reasonCode,
  ).toBe("NO_RUNTIME_TOOL");

  expect(
    resolveBlenderActionAgainstTools(
      "OBJECT_CREATE",
      tools(["execute_blender_code"]),
      false,
    ).toolName,
  ).toBe("execute_blender_code");
});

test("Geometry Nodes configuration never resolves to an inspection-only tool", () => {
  const result = resolveBlenderActionAgainstTools(
    "GEOMETRY_NODES_CONFIGURE",
    tools(["describe_node_type", "execute_blender_code"]),
    false,
  );
  expect(result.toolName).toBe("execute_blender_code");
});

test("multi-provider asset search is unresolved without provider-specific selection", () => {
  const result = resolveBlenderActionAgainstTools(
    "ASSET_SEARCH",
    tools(["search_polyhaven_assets", "search_sketchfab_models", "search_polypizza_models"]),
    false,
  );
  expect(result.resolved).toBe(false);
  expect(result.reasonCode).toBe("AMBIGUOUS_TOOL");
});

test("arbitrary Blender Python is blocked by default", () => {
  const result = resolveBlenderActionAgainstTools(
    "PYTHON_EXECUTE",
    tools(["execute_blender_code"]),
    false,
  );
  expect(result.resolved).toBe(false);
  expect(result.reasonCode).toBe("PYTHON_DISABLED");
});

test("arbitrary Blender Python can resolve only when explicitly enabled", () => {
  const result = resolveBlenderActionAgainstTools(
    "PYTHON_EXECUTE",
    tools(["execute_blender_code"]),
    true,
  );
  expect(result).toMatchObject({
    resolved: true,
    toolName: "execute_blender_code",
  });
});
