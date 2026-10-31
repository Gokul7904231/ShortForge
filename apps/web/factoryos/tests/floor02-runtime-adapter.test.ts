import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Floor02RuntimeAdapter } from "../core/adapters/Floor02RuntimeAdapter";

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
      correlation: {
        missionId: "mission_wave3_01",
        runId: "run_wave3_01",
        jobId: "job_wave3_01",
        traceId: "trace_wave3_01",
      },
    });

    expect(result.handoffPayload.floor_id).toBe("floor02_scripting");
    expect(result.correlationReceipt?.missionId).toBe("mission_wave3_01");
    expect(result.correlationReceipt?.jobId).toBe("job_wave3_01");
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

  it("reports BLOCKED qualification status when endpoints and keys are missing", () => {
    const prevUrl = process.env.FLOOR02_RUNTIME_URL;
    const prevKey = process.env.FLOOR02_SERVICE_API_KEY;
    const prevGemini = process.env.GEMINI_API_KEY;
    delete process.env.FLOOR02_RUNTIME_URL;
    delete process.env.FLOOR02_SERVICE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const unconfiguredAdapter = new Floor02RuntimeAdapter("", "");
      const qual = unconfiguredAdapter.getQualificationStatus();
      expect(qual.configured).toBe(false);
      expect(qual.status).toBe("BLOCKED");
      expect(qual.missingEnvVars).toContain("FLOOR02_RUNTIME_URL");
      expect(qual.missingEnvVars).toContain("FLOOR02_SERVICE_API_KEY");
    } finally {
      if (prevUrl) process.env.FLOOR02_RUNTIME_URL = prevUrl;
      if (prevKey) process.env.FLOOR02_SERVICE_API_KEY = prevKey;
      if (prevGemini) process.env.GEMINI_API_KEY = prevGemini;
    }
  });

  it("supports deterministic offline fallback with correlated receipts when enabled", async () => {
    const unconfiguredAdapter = new Floor02RuntimeAdapter("", "");

    const result = await unconfiguredAdapter.plan({
      requestId: "offline_f02_test",
      topic: "Quantum Entanglement",
      targetDurationSeconds: 60,
      strategy: {
        templateId: "facts.deep-explainer.v1",
        targetAudience: "curious_minds",
      },
      correlation: {
        missionId: "mission_offline_001",
        runId: "run_offline_001",
        jobId: "job_offline_001",
        traceId: "trace_offline_001",
      },
      offlineFallbackAllowed: true,
    });

    expect(result.handoffPayload.floor_id).toBe("floor02_scripting");
    expect(result.handoffPayload.handoff_status).toBe("VALIDATED");
    expect(result.handoffPayload.quality_report.accepted).toBe(true);
    expect(result.handoffPayload.script_ir.scenes.length).toBeGreaterThanOrEqual(4);
    expect(result.correlationReceipt?.missionId).toBe("mission_offline_001");
    expect(result.correlationReceipt?.traceId).toBe("trace_offline_001");
  });
});
