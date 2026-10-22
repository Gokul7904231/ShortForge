import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LightningNotebookAdapter } from "../core/compute/notebooks/LightningNotebookAdapter";
import { runProcess } from "../core/compute/notebooks/NotebookUtils";

describe("Lightning credential validation regression suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.LIGHTNING_USER_ID;
    delete process.env.LIGHTNING_API_KEY;
    delete process.env.LIGHTNING_TEAMSPACE;
    delete process.env.LIGHTNING_CLI_PATH;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("fails closed when all credentials are missing without making a provider request", async () => {
    const mockRunner = vi.fn();
    const adapter = new LightningNotebookAdapter(mockRunner as unknown as typeof runProcess);

    const result = await adapter.validateCredentials({});

    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.providerReachable).toBe(false);
    expect(result.missingKeys).toEqual([
      "LIGHTNING_USER_ID",
      "LIGHTNING_API_KEY",
      "LIGHTNING_TEAMSPACE",
    ]);
    expect(result.evidence[0]).toContain("Lightning Studio credentials are not configured");
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("fails closed when partial credentials are provided without making a provider request", async () => {
    const mockRunner = vi.fn();
    const adapter = new LightningNotebookAdapter(mockRunner as unknown as typeof runProcess);

    const result = await adapter.validateCredentials({
      LIGHTNING_USER_ID: "usr-test-123",
    });

    expect(result.configured).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.providerReachable).toBe(false);
    expect(result.missingKeys).toEqual(["LIGHTNING_API_KEY", "LIGHTNING_TEAMSPACE"]);
    expect(mockRunner).not.toHaveBeenCalled();
  });

  it("succeeds when valid credentials and an authenticated read-only response are returned", async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout:
        "Name          Teamspace               Studio    Image    Status     Machine    Total Cost\n" +
        "smoke-job-1   test-org/shortforge-ts  studio-1  default  COMPLETED  CPU        0.000",
      stderr: "",
    });

    const adapter = new LightningNotebookAdapter(mockRunner as unknown as typeof runProcess);

    const result = await adapter.validateCredentials({
      LIGHTNING_USER_ID: "valid-user",
      LIGHTNING_API_KEY: "valid-api-key",
      LIGHTNING_TEAMSPACE: "test-org/shortforge-ts",
    });

    expect(result.configured).toBe(true);
    expect(result.authenticated).toBe(true);
    expect(result.providerReachable).toBe(true);
    expect(result.missingKeys).toHaveLength(0);
    expect(result.errorMessage).toBeUndefined();
    expect(result.evidence[0]).toContain("Lightning authenticated API call (job list --teamspace test-org/shortforge-ts) succeeded.");

    expect(mockRunner).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mockRunner.mock.calls[0] as [string, string[], { timeoutMs: number; env: Record<string, string> }];
    expect(cmd).toBe("lightning");
    expect(args).toEqual(["job", "list", "--teamspace", "test-org/shortforge-ts"]);
    expect(opts.timeoutMs).toBe(30_000);
    expect(opts.env.LIGHTNING_NON_INTERACTIVE).toBe("1");
  });

  it("fails explicitly when invalid credentials return an authentication failure", async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "Error: 401 Unauthorized: Invalid API key or user authentication failed.",
    });

    const adapter = new LightningNotebookAdapter(mockRunner as unknown as typeof runProcess);

    const result = await adapter.validateCredentials({
      LIGHTNING_USER_ID: "bad-user",
      LIGHTNING_API_KEY: "bad-key",
      LIGHTNING_TEAMSPACE: "test-org/shortforge-ts",
    });

    expect(result.configured).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.providerReachable).toBe(true);
    expect(result.errorMessage).toContain("Lightning CLI authentication check failed");
    expect(result.evidence[0]).toContain("401 Unauthorized");
  });

  it("fails closed on process timeout (exit code 124)", async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 124,
      stdout: "",
      stderr: "Process timed out.",
    });

    const adapter = new LightningNotebookAdapter(mockRunner as unknown as typeof runProcess);

    const result = await adapter.validateCredentials({
      LIGHTNING_USER_ID: "user-1",
      LIGHTNING_API_KEY: "key-1",
      LIGHTNING_TEAMSPACE: "test-org/shortforge-ts",
    });

    expect(result.configured).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.providerReachable).toBe(false);
    expect(result.errorMessage).toBe("Lightning CLI authentication check timed out.");
    expect(result.evidence[0]).toContain("timed out after 30000ms");
  });

  it("fails closed when response contains a deprecation warning", async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "Deprecation warning: Use `lightning job list` instead of `lightning mmt list`.\n",
      stderr: "",
    });

    const adapter = new LightningNotebookAdapter(mockRunner as unknown as typeof runProcess);

    const result = await adapter.validateCredentials({
      LIGHTNING_USER_ID: "user-1",
      LIGHTNING_API_KEY: "key-1",
      LIGHTNING_TEAMSPACE: "test-org/shortforge-ts",
    });

    expect(result.configured).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.errorMessage).toBe("Lightning CLI probe returned an obsolete or deprecated response.");
  });

  it("fails closed on provider process spawn failure or unhandled error", async () => {
    const mockRunner = vi.fn().mockRejectedValue(new Error("spawn lightning ENOENT"));

    const adapter = new LightningNotebookAdapter(mockRunner as unknown as typeof runProcess);

    const result = await adapter.validateCredentials({
      LIGHTNING_USER_ID: "user-1",
      LIGHTNING_API_KEY: "key-1",
      LIGHTNING_TEAMSPACE: "test-org/shortforge-ts",
    });

    expect(result.configured).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.providerReachable).toBe(false);
    expect(result.errorMessage).toContain("Lightning process execution failed: spawn lightning ENOENT");
  });

  it("never discloses credentials in diagnostic output or error messages", async () => {
    const secretKey = "super-secret-api-key-987654321";
    const secretUser = "confidential-user-id-123456789";

    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: `Traceback: failed to connect with ${secretKey}`,
      stderr: `AuthenticationError: user ${secretUser} with key ${secretKey} was denied access.`,
    });

    const adapter = new LightningNotebookAdapter(mockRunner as unknown as typeof runProcess);

    const result = await adapter.validateCredentials({
      LIGHTNING_USER_ID: secretUser,
      LIGHTNING_API_KEY: secretKey,
      LIGHTNING_TEAMSPACE: "test-org/shortforge-ts",
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain(secretUser);
    expect(serialized).toContain("[REDACTED]");
    expect(result.evidence[0]).toContain("[REDACTED]");
  });

  it("enforces timeout configuration and non-interactive execution flag", async () => {
    const mockRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "Name | Teamspace\n",
      stderr: "",
    });

    const adapter = new LightningNotebookAdapter(mockRunner as unknown as typeof runProcess);

    await adapter.validateCredentials({
      LIGHTNING_USER_ID: "user-1",
      LIGHTNING_API_KEY: "key-1",
      LIGHTNING_TEAMSPACE: "org-a/ts-b",
    });

    const options = mockRunner.mock.calls[0][2];
    expect(options.timeoutMs).toBe(30_000);
    expect(options.env.LIGHTNING_NON_INTERACTIVE).toBe("1");
  });
});
