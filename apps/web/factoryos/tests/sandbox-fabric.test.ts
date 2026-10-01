import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PandaStackSandboxAdapter,
  SandboxHttpClient,
} from "@/factoryos/core/compute/sandboxes";

const credentials = { PANDASTACK_API_KEY: "pds_test_secret" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sandbox fabric", () => {
  it("validates PandaStack credentials without leaking the secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "workspace-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PandaStackSandboxAdapter(
      new SandboxHttpClient("https://sandbox.test"),
    );

    const result = await adapter.validateCredentials(credentials);

    expect(result.authenticated).toBe(true);
    const request = fetchMock.mock.calls[0][0] as string;
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request).toBe("https://sandbox.test/v1/me");
    expect((init.headers as Headers).get("Authorization")).toBe(
      "Bearer pds_test_secret",
    );
  });

  it("creates a sandbox using the documented create contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "sbx-1",
          state: "running",
          created_at: "2026-10-01T00:00:00.000Z",
          metadata: { name: "test" },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PandaStackSandboxAdapter(
      new SandboxHttpClient("https://sandbox.test"),
    );

    const result = await adapter.provision(
      {
        idempotencyKey: "op-1",
        template: "code-interpreter",
        ttlSeconds: 600,
        metadata: { mission: "smoke-test" },
      },
      credentials,
    );

    expect(result.runtime.resourceId).toBe("sbx-1");
    expect(result.runtime.state).toBe("RUNNING");

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.template).toBe("code-interpreter");
    expect(body.ttl_seconds).toBe(600);
    expect(body.metadata.shortforge_operation_key).toBe("op-1");
    expect(body.metadata.mission).toBe("smoke-test");
  });

  it("executes a shell command and preserves provider exit semantics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          stdout: "hello\n",
          stderr: "",
          exit_code: 0,
          duration_ms: 22,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PandaStackSandboxAdapter(
      new SandboxHttpClient("https://sandbox.test"),
    );

    const result = await adapter.execute(
      {
        runtime: {
          providerId: "sandbox_pandastack_hosted",
          providerType: "PANDASTACK",
          resourceId: "sbx-1",
          state: "RUNNING",
          updatedAt: "2026-10-01T00:00:00.000Z",
          providerMetadata: {},
        },
        command: "echo hello",
        timeoutMs: 10_000,
      },
      credentials,
    );

    expect(result.status).toBe("SUCCEEDED");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello\n");
  });

  it("fails closed on provider errors without copying raw bodies into exceptions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid credential",
          token: "pds_test_secret",
          sensitive: "must_not_escape",
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SandboxHttpClient("https://sandbox.test");

    await expect(client.requestJson("/v1/me", credentials)).rejects.toThrow(
      "SANDBOX_PROVIDER_HTTP_401:invalid credential",
    );

    try {
      await client.requestJson("/v1/me", credentials);
    } catch (error) {
      expect(String(error)).not.toContain("pds_test_secret");
      expect(String(error)).not.toContain("must_not_escape");
    }
  });

  it("does not auto-promote a sandbox into a production worker", () => {
    const adapter = new PandaStackSandboxAdapter(
      new SandboxHttpClient("https://sandbox.test"),
    );
    expect(adapter.metadata.capabilities.productionWorkerEligible).toBe(false);
  });
});
