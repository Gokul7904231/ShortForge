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
  it("does not leak the F01 service response body on execution failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("internal-stack-trace-and-secret", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );

    const adapter = new Floor01RuntimeAdapter(
      "http://floor01.internal",
      "test-service-secret",
    );

    await expect(
      adapter.execute({
        request_id: "req-adapter-error-redaction",
        topic_query: "Python decorators",
        target_audience: "general_learners",
        platform: "youtube_shorts",
        content_format: "educational_short",
      }),
    ).rejects.toThrow("F01_SERVICE_EXECUTION_FAILED: HTTP 500");

    await expect(
      adapter.execute({
        request_id: "req-adapter-error-redaction-2",
        topic_query: "Python decorators",
        target_audience: "general_learners",
        platform: "youtube_shorts",
        content_format: "educational_short",
      }),
    ).rejects.not.toThrow("internal-stack-trace-and-secret");
  });

  it("does not use the broad control-plane secret as a production F01 credential", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFloor01 = process.env.FLOOR01_SERVICE_API_KEY;
    const originalInternal = process.env.INTERNAL_API_SECRET_KEY;

    process.env.NODE_ENV = "production";
    delete process.env.FLOOR01_SERVICE_API_KEY;
    process.env.INTERNAL_API_SECRET_KEY = "broad-control-plane-secret";

    try {
      const adapter = new Floor01RuntimeAdapter("http://floor01.internal");
      await expect(
        adapter.execute({
          request_id: "req-adapter-production-key-boundary",
          topic_query: "Python decorators",
          target_audience: "general_learners",
          platform: "youtube_shorts",
          content_format: "educational_short",
        }),
      ).rejects.toThrow("F01_SERVICE_AUTH_UNCONFIGURED");
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalFloor01 === undefined) delete process.env.FLOOR01_SERVICE_API_KEY;
      else process.env.FLOOR01_SERVICE_API_KEY = originalFloor01;
      if (originalInternal === undefined) delete process.env.INTERNAL_API_SECRET_KEY;
      else process.env.INTERNAL_API_SECRET_KEY = originalInternal;
    }
  });

  it("fails closed when service authentication is not configured", async () => {
    const adapter = new Floor01RuntimeAdapter("http://floor01.internal", undefined);

    await expect(
      adapter.execute({
        request_id: "req-adapter-no-auth",
        topic_query: "Python decorators",
        target_audience: "general_learners",
        platform: "youtube_shorts",
        content_format: "educational_short",
      }),
    ).rejects.toThrow("F01_SERVICE_AUTH_UNCONFIGURED");
  });

  it("fails with a bounded timeout instead of retrying a POST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }),
    );

    const adapter = new Floor01RuntimeAdapter(
      "http://floor01.internal",
      "test-service-secret",
      1000,
    );

    await expect(
      adapter.execute({
        request_id: "req-adapter-timeout",
        topic_query: "Python decorators",
        target_audience: "general_learners",
        platform: "youtube_shorts",
        content_format: "educational_short",
      }),
    ).rejects.toThrow("F01_SERVICE_TIMEOUT");
  });
});
