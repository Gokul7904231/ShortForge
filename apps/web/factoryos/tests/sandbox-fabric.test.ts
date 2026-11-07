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
});
