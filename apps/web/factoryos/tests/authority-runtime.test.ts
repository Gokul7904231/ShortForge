import { describe, it, expect } from "vitest";
import { AuthorityRegistryRuntime, AuthorityViolationError } from "../core/authority/AuthorityRegistryRuntime";

describe("AuthorityRegistryRuntime (Runtime Dependency)", () => {
  const runtime = AuthorityRegistryRuntime.getInstance();

  it("loads and caches canonical authority-registry.json at runtime", () => {
    const reg = runtime.getRegistry();
    expect(reg).toBeDefined();
    expect(reg.schemaVersion).toBe("2.0.0-charter");
    expect(reg.sovereigns).toHaveLength(10);
  });

  it("identifies all 10 canonical sovereigns with exact roles", () => {
    const overseer = runtime.getSovereign("overseer");
    const guardian = runtime.getSovereign("guardian");
    const treasurer = runtime.getSovereign("treasurer");
    const slayer = runtime.getSovereign("slayer");
    const auditor = runtime.getSovereign("auditor");

    expect(overseer?.primaryVerb).toBe("command");
    expect(guardian?.primaryVerb).toBe("command-floor");
    expect(guardian?.perFloor).toBe(true);
    expect(treasurer?.primaryVerb).toBe("allocate");
    expect(slayer?.primaryVerb).toBe("investigate");
    expect(auditor?.primaryVerb).toBe("examine");
  });

  it("enforces Single Commit Path: workers CANNOT commit completion", () => {
    expect(() => {
      runtime.assertCanCommitCompletion("worker", true);
    }).toThrowError(AuthorityViolationError);

    expect(() => {
      runtime.assertCanCommitCompletion("worker", false);
    }).toThrowError("WORKER_DIRECT_COMMIT_FORBIDDEN");
  });

  it("enforces Single Commit Path: rejection on missing physical verification receipt", () => {
    expect(() => {
      runtime.assertCanCommitCompletion("f07", false);
    }).toThrowError("CLAIM_WITHOUT_EVIDENCE");
  });

  it("enforces Single Commit Path: allows F07 release boundary with physical receipt", () => {
    expect(() => {
      runtime.assertCanCommitCompletion("f07", true);
    }).not.toThrow();
  });

  it("enforces Law L7: Treasurer obeys only Overseer for discretionary commands", () => {
    expect(() => {
      runtime.assertTreasurerCommand("worker");
    }).toThrowError("TREASURER_DISCRETIONARY_VIOLATION");

    expect(() => {
      runtime.assertTreasurerCommand("guardian");
    }).toThrowError("TREASURER_DISCRETIONARY_VIOLATION");

    expect(() => {
      runtime.assertTreasurerCommand("overseer");
    }).not.toThrow();
  });
});
