import { afterEach, describe, expect, it, vi } from "vitest";
import { Floor03RuntimeAdapter } from "../core/bridge/Floor03RuntimeAdapter";

describe("Floor03RuntimeAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
    ).rejects.toThrow(/canonical Python Floor 03 runtime is not configured/i);
  });

  it("fails closed when Floor 02 handoff is missing or unvalidated", async () => {
    const adapter = new Floor03RuntimeAdapter("http://127.0.0.1:8003", "test-key");

    await expect(
      adapter.plan({
        requestId: "req-2a",
        floor02Handoff: {
          floor_id: "floor02_scripting",
          handoff_status: "DEGRADED",
          scenes: [{ scene_id: "sc-1" }],
          script_ir: { schema_version: "2.0" },
        },
      })
    ).rejects.toThrow(/Refusing non-canonical or unvalidated Floor 02 handoff/i);

    await expect(
      adapter.plan({
        requestId: "req-2b",
        floor02Handoff: {
          floor_id: "unknown_floor",
          handoff_status: "VALIDATED",
        },
      })
    ).rejects.toThrow(/Refusing non-canonical or unvalidated Floor 02 handoff/i);
  });

  it("posts to /v1/assets/execution-report with canonical headers and accepts only a validated AssetPlanIR 1.4.0 response", async () => {
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
            audio_asset_requirements: [{ scene_id: "sc-1" }],
            manifest: { total_visual_assets: 1, total_audio_assets: 1 },
            asset_plan_ir: {
              schema_version: "1.4.0",
              plan_fingerprint: "a".repeat(64),
              source_fingerprint: "b".repeat(64),
              lineage: {
                source_floor_id: "floor02_scripting",
                source_floor_version: "2.0.0",
                source_script_id: "script-1",
                source_script_version: 1,
              },
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
      requestId: "req-3",
      floor02Handoff: {
        floor_id: "floor02_scripting",
        handoff_status: "VALIDATED",
        scenes: [{ scene_id: "sc-1" }],
        script_ir: { schema_version: "2.0" },
      },
    });

    expect(result.handoffPayload.floor_id).toBe("floor03_asset_realization");
    expect(result.handoffPayload.floor_version).toBe("2.3.0");
    expect(result.handoffPayload.handoff_status).toBe("VALIDATED");
    expect(result.handoffPayload.asset_plan_ir.schema_version).toBe("1.4.0");
    expect(result.executionReport.floor_id).toBe("floor03_asset_realization");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8003/v1/assets/execution-report");
    expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe("test-key");
    expect((init?.headers as Record<string, string>)["X-FactoryOS-Floor"]).toBe("floor03_asset_realization");
  });

  it("fails closed on HTTP error from canonical service", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Internal Server Error", { status: 500 })
      )
    );

    const adapter = new Floor03RuntimeAdapter("http://127.0.0.1:8003", "test-key");
    await expect(
      adapter.plan({
        requestId: "req-4",
        floor02Handoff: {
          floor_id: "floor02_scripting",
          handoff_status: "VALIDATED",
          scenes: [{ scene_id: "sc-1" }],
          script_ir: { schema_version: "2.0" },
        },
      })
    ).rejects.toThrow(/Canonical F03 runtime rejected request: HTTP 500/i);
  });

  it("fails closed on service timeout", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(abortError)
    );

    const adapter = new Floor03RuntimeAdapter("http://127.0.0.1:8003", "test-key", 100);
    await expect(
      adapter.plan({
        requestId: "req-5",
        floor02Handoff: {
          floor_id: "floor02_scripting",
          handoff_status: "VALIDATED",
          scenes: [{ scene_id: "sc-1" }],
          script_ir: { schema_version: "2.0" },
        },
      })
    ).rejects.toThrow(/Canonical F03 runtime timed out after/i);
  });

  it("fails closed when canonical F03 returns an unvalidated or invalid handoff", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            handoff_payload: {
              floor_id: "floor03_asset_realization",
              floor_version: "2.3.0",
              handoff_status: "DEGRADED",
            },
            execution_report: {
              floor_id: "floor03_asset_realization",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const adapter = new Floor03RuntimeAdapter("http://127.0.0.1:8003", "test-key");
    await expect(
      adapter.plan({
        requestId: "req-6",
        floor02Handoff: {
          floor_id: "floor02_scripting",
          handoff_status: "VALIDATED",
          scenes: [{ scene_id: "sc-1" }],
          script_ir: { schema_version: "2.0" },
        },
      })
    ).rejects.toThrow(/Canonical F03 runtime returned an invalid or unvalidated handoff/i);
  });
});
