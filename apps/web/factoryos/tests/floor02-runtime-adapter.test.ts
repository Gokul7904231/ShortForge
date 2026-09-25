import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Floor02RuntimeAdapter } from "../factoryos/core/adapters/Floor02RuntimeAdapter";

describe("Floor02RuntimeAdapter", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts a schema-valid compatibility handoff to the canonical Python runtime", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          floor_id: "floor02_scripting",
          floor_version: "2.0.0",
          handoff_status: "VALIDATED",
          script_ir: { schema_version: "2.0" },
          quality_report: { accepted: true },
          scenes: [{ narration_text: "hello" }],
          successor_handoffs: {
            floor03_asset_realization: { schema_version: "2.0" },
            floor04_media_synthesis: { schema_version: "2.0" },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    global.fetch = fetchMock;

    const adapter = new Floor02RuntimeAdapter(
      "http://floor02:8080",
      "secret"
    );

    const result = await adapter.plan({
      requestId: "exec_f02_1",
      topic: "Python decorators",
      targetDurationSeconds: 60,
      strategy: {
        targetAudience: "beginners",
        platform: "youtube_shorts",
        recommendedHook: "Most people misunderstand decorators.",
      },
    });

    expect(result.handoffPayload.floor_id).toBe("floor02_scripting");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://floor02:8080/v1/script/plan");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("secret");

    const body = JSON.parse(String(init.body));
    expect(body.strict_upstream).toBe(true);
    expect(body.floor01_payload.handoff_status).toBe("VALIDATED");
    expect(body.floor01_payload.topic.selected_topic).toBe("Python decorators");
  });

  it("fails closed when the canonical runtime returns an unvalidated handoff", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          floor_id: "floor02",
          floor_version: "1.0.0",
          handoff_status: "DEGRADED",
          script_ir: null,
          quality_report: { accepted: false },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const adapter = new Floor02RuntimeAdapter(
      "http://floor02:8080",
      "secret"
    );

    await expect(
      adapter.plan({
        requestId: "exec_f02_2",
        topic: "Python",
        targetDurationSeconds: 30,
        strategy: {},
      })
    ).rejects.toThrow("invalid or unvalidated handoff");
  });
});
