import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMPUTE_POLICY } from "@/factoryos/core/compute/contracts/ComputeContracts";
import {
  DaytonaSandboxAdapter,
  InstaVMSandboxAdapter,
  GitHubCodespacesAdapter,
  CodeSandboxAdapter,
} from "@/factoryos/core/compute/sandboxes";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sandbox fabric", () => {
  it("fails closed when Daytona credentials are missing", async () => {
    const adapter = new DaytonaSandboxAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual(["DAYTONA_API_KEY"]);
  });

  it("fails closed when InstaVM credentials are missing", async () => {
    const adapter = new InstaVMSandboxAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual(["INSTAVM_API_KEY"]);
  });

  it("fails closed when GitHub Codespaces credentials are missing", async () => {
    const adapter = new GitHubCodespacesAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual(["GITHUB_CODESAPCES_TOKEN"]);
  });

  it("fails closed when CodeSandbox credentials are missing", async () => {
    const adapter = new CodeSandboxAdapter();
    const result = await adapter.validateCredentials({});
    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.missingKeys).toEqual(["CODESANDBOX_API_KEY"]);
  });

  it("keeps the no-card default compute policy on approved sandbox providers", () => {
    expect(DEFAULT_COMPUTE_POLICY.allowedProviders).toContain("DAYTONA");
    expect(DEFAULT_COMPUTE_POLICY.allowedProviders).toContain("INSTAVM");
    expect(DEFAULT_COMPUTE_POLICY.allowedProviders).not.toContain("MODAL");
    expect(DEFAULT_COMPUTE_POLICY.preferredOrder).toContain("INSTAVM");
  });

  it("keeps all hosted sandbox adapters outside production worker authority", () => {
    const daytona = new DaytonaSandboxAdapter();
    const instavm = new InstaVMSandboxAdapter();
    const codespaces = new GitHubCodespacesAdapter();
    const codesandbox = new CodeSandboxAdapter();
    expect(daytona.metadata.capabilities.productionWorkerEligible).toBe(false);
    expect(instavm.metadata.capabilities.productionWorkerEligible).toBe(false);
    expect(codespaces.metadata.capabilities.productionWorkerEligible).toBe(false);
    expect(codesandbox.metadata.capabilities.productionWorkerEligible).toBe(false);
  });

  describe("InstaVM pre-flight credit check", () => {
    const adapter = new InstaVMSandboxAdapter();
    const dummyRequest = {
      idempotencyKey: "test-budget-check",
      ttlSeconds: 300,
    };
    const credentials = { INSTAVM_API_KEY: "test-key-budget" } as const;

    it("rejects provisioning when credits are depleted (zero)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ remaining_credits: 0 }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.provision(dummyRequest, credentials)).rejects.toThrow(
        "SANDBOX_BUDGET_EXHAUSTED",
      );
      // Must never reach VM creation — only the usage endpoint call
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/usage");
    });

    it("rejects provisioning when credits are negative", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ remaining_credits: -5 }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.provision(dummyRequest, credentials)).rejects.toThrow(
        "SANDBOX_BUDGET_EXHAUSTED",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects provisioning when usage endpoint is unreachable (fail closed)", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.provision(dummyRequest, credentials)).rejects.toThrow(
        "SANDBOX_BUDGET_EXHAUSTED",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects provisioning when usage response has no credit field (fail closed)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ account: "active" }),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.provision(dummyRequest, credentials)).rejects.toThrow(
        "SANDBOX_BUDGET_EXHAUSTED",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects provisioning when usage endpoint returns HTTP error (fail closed)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.provision(dummyRequest, credentials)).rejects.toThrow(
        "SANDBOX_BUDGET_EXHAUSTED",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("allows provisioning when credits are sufficient", async () => {
      let callIndex = 0;
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        callIndex++;
        if (callIndex === 1) {
          // Usage check — sufficient credits
          expect(url).toContain("/v1/usage");
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ remaining_credits: 100 }),
            headers: new Headers(),
          };
        }
        // VM creation — return a valid session
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ session_id: "sess-budget-ok", vm_id: "vm-1" }),
          headers: new Headers(),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      // provision will succeed past the credit check but then fail at bootstrap
      // (the third fetch for bootstrap execution). That's fine — we're testing
      // the credit gate, not the full provisioning flow.
      try {
        await adapter.provision(dummyRequest, credentials);
      } catch (error: any) {
        // Expected: bootstrap will fail because our mock doesn't handle it.
        // The critical assertion is that we got PAST the credit check.
        expect(error.message).not.toContain("SANDBOX_BUDGET_EXHAUSTED");
      }
      // Credit check + VM creation = at least 2 fetch calls
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/usage");
      expect(fetchMock.mock.calls[1][0]).toContain("/v1/vms");
    });
  });
});
