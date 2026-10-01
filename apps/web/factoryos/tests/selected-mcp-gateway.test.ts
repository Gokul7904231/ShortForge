import { describe, expect, it } from "vitest";
import { getSelectedMcpAction, resolveSelectedMcpTool } from "../core/mcp/McpContracts";
import { isBrowserHostAllowed, isPathWithinRoots, sanitizeComfyArguments, sanitizeQdrantStoreArguments } from "../core/mcp/SelectedMcpGateway";

describe("Selected MCP Fabric policy", () => {
  it("resolves semantic actions only to allowlisted live tools", () => {
    const action = getSelectedMcpAction("playwright", "BROWSER_SNAPSHOT");
    expect(action).toBeDefined();
    expect(resolveSelectedMcpTool(action!, [
      { name: "browser_snapshot", inputSchema: { type: "object" } },
      { name: "browser_evaluate", inputSchema: { type: "object" } },
    ])).toBe("browser_snapshot");
    expect(resolveSelectedMcpTool(action!, [
      { name: "browser_evaluate", inputSchema: { type: "object" } },
    ])).toBeUndefined();
  });

  it("requires an explicit browser navigation hostname allowlist", () => {
    expect(isBrowserHostAllowed("https://example.com/research", ["example.com"])).toBe(true);
    expect(isBrowserHostAllowed("https://evil.example.net", ["example.com"])).toBe(false);
    expect(isBrowserHostAllowed("file:///etc/passwd", ["example.com"])).toBe(false);
  });

  it("contains Comfy filesystem operations inside configured roots", () => {
    const roots = ["/tmp/shortforge/comfy"];
    expect(isPathWithinRoots("/tmp/shortforge/comfy/workflows/a.json", roots)).toBe(true);
    expect(isPathWithinRoots("/tmp/shortforge/comfy-escape/a.json", roots)).toBe(false);
  });

  it("cannot enable Comfy spending or escape its workflow root", () => {
    const sanitized = sanitizeComfyArguments("COMFY_RUN_WORKFLOW", {
      workflow_path: "/tmp/shortforge/comfy/workflows/a.json",
      confirm_spend: true,
      allow_spend: true,
    }, ["/tmp/shortforge/comfy"]);
    expect(sanitized.confirm_spend).toBe(false);
    expect(sanitized.allow_spend).toBeUndefined();

    expect(() => sanitizeComfyArguments("COMFY_RUN_WORKFLOW", {
      workflow_path: "/tmp/shortforge/other/a.json",
    }, ["/tmp/shortforge/comfy"])).toThrow("comfy_workflow_path_outside_allowlist");
  });

  it("keeps Qdrant writes projection-only", () => {
    const sanitized = sanitizeQdrantStoreArguments({
      information: "derived memory candidate",
      metadata: { memoryId: "mem_001", evidenceRefs: ["ev_001"] },
    }, "shortforge-derived-memory");
    expect(sanitized.collection_name).toBeUndefined();
    expect((sanitized.metadata as Record<string, unknown>).projectionOnly).toBe(true);
    expect((sanitized.metadata as Record<string, unknown>).canonicalAuthority).toBe("memory-fabric");

    expect(() => sanitizeQdrantStoreArguments({
      information: "bad",
      metadata: { canonicalAuthority: "qdrant" },
    }, "shortforge-derived-memory")).toThrow("qdrant_store_must_be_memory_fabric_projection");
  });
});
