import { afterEach, describe, expect, it, vi } from "vitest";
import { Floor01RuntimeAdapter } from "../core/bridge/Floor01RuntimeAdapter";

describe("Floor01RuntimeAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fails closed when the canonical F01 handoff is degraded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            floor_id: "floor01_strategy",
            handoff_status: "DEGRADED",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const adapter = new Floor01RuntimeAdapter(
      "http://floor01.internal",
      "test-service-secret",
    );

    await expect(
      adapter.execute({
        request_id: "req-adapter-degraded",
        topic_query: "Python decorators",
        target_audience: "general_learners",
        platform: "youtube_shorts",
        content_format: "educational_short",
      }),
    ).rejects.toThrow("F01_DEGRADED_HANDOFF_NOT_ALLOWED");
  });

  it("accepts only a validated canonical F01 handoff", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            floor_id: "floor01_strategy",
            handoff_status: "VALIDATED",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const adapter = new Floor01RuntimeAdapter(
      "http://floor01.internal",
      "test-service-secret",
    );

    await expect(
      adapter.execute({
        request_id: "req-adapter-valid",
        topic_query: "Python decorators",
        target_audience: "general_learners",
        platform: "youtube_shorts",
        content_format: "educational_short",
      }),
    ).resolves.toMatchObject({
      floor_id: "floor01_strategy",
      handoff_status: "VALIDATED",
    });
  });
});
