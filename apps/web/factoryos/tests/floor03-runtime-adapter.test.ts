import { describe, expect, it, vi } from "vitest";
import { Floor03RuntimeAdapter } from "../core/bridge/Floor03RuntimeAdapter";

describe("Floor03RuntimeAdapter", () => {
  it("fails closed when the canonical Python runtime is not configured", async () => {
    const adapter = new Floor03RuntimeAdapter("", "");
    await expect(
      adapter.plan({
        requestId: "req-1",
        floor02Handoff: {
          floor_id: "floor02_scripting",
          handoff_status: "VALIDATED",
          scenes: [{ scene_id: "sc-1" }],
          script_ir: { schema_version: "2.0" },
        },
      })
    ).rejects.toThrow("canonical Python Floor 03 runtime is not configured");
  });

  it("accepts only a validated AssetPlanIR 1.4.0 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          handoff_payload: {
            floor_id: "floor03_asset_realization",
            floor_version: "2.3.0",
            handoff_status: "VALIDATED",
            asset_plan_id: "plan-1",
            asset_plan_version: 1,
            visual_asset_requirements: [{ scene_id: "sc-1" }],
            asset_plan_ir: {
              schema_version: "1.4.0",
              plan_fingerprint: "a".repeat(64),
              source_fingerprint: "b".repeat(64),
              lineage: { source_floor_id: "floor02_scripting" },
            },
            provenance: [{ evidence_type: "DETERMINISTIC_RULE" }],
          },
          execution_report: {
            floor_id: "floor03_asset_realization",
            status: "VALIDATED",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new Floor03RuntimeAdapter(
      "http://127.0.0.1:8003",
      "test-key"
    );
    const result = await adapter.plan({
      requestId: "req-2",
      floor02Handoff: {
        floor_id: "floor02_scripting",
        handoff_status: "VALIDATED",
        scenes: [{ scene_id: "sc-1" }],
        script_ir: { schema_version: "2.0" },
      },
    });

    expect(result.handoffPayload.asset_plan_ir.schema_version).toBe("1.4.0");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
