import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { KaggleNotebookComputeProvider } from "../core/compute/providers/KaggleNotebookComputeProvider";
import { kaggleCredentialKeys } from "../core/compute/notebooks/KaggleNotebookAdapter";

const KAGGLE_KEYS = [
  "KAGGLE_API_TOKEN",
  "KAGGLE_USERNAME",
  "KAGGLE_KEY",
  "KAGGLE_RENDER_COMMAND",
] as const;

const saved: Record<string, string | undefined> = {};

describe("Kaggle render provider configuration", () => {
  beforeEach(() => {
    for (const key of KAGGLE_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KAGGLE_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("a modern API token satisfies configuration, matching the adapter's predicate", () => {
    process.env.KAGGLE_API_TOKEN = "token-abc";
    process.env.KAGGLE_RENDER_COMMAND = "python render.py";

    const provider = new KaggleNotebookComputeProvider();
    const config = provider.validateConfiguration();

    expect(config.isConfigured).toBe(true);
    expect(config.requiredKeys).toEqual(["KAGGLE_API_TOKEN", "KAGGLE_RENDER_COMMAND"]);
    expect(config.missingKeys).toEqual([]);
  });

  test("the legacy username/key pair still satisfies configuration", () => {
    process.env.KAGGLE_USERNAME = "someone";
    process.env.KAGGLE_KEY = "legacy-key";
    process.env.KAGGLE_RENDER_COMMAND = "python render.py";

    const config = new KaggleNotebookComputeProvider().validateConfiguration();

    expect(config.isConfigured).toBe(true);
    expect(config.requiredKeys).toEqual(["KAGGLE_USERNAME", "KAGGLE_KEY", "KAGGLE_RENDER_COMMAND"]);
  });

  test("a missing render command names itself instead of erasing credentials", async () => {
    process.env.KAGGLE_API_TOKEN = "token-abc";

    const provider = new KaggleNotebookComputeProvider();
    const config = provider.validateConfiguration();
    const capability = await provider.getCapability();

    expect(config.isConfigured).toBe(false);
    expect(config.missingKeys).toEqual(["KAGGLE_RENDER_COMMAND"]);
    // Credentials are present, so the provider is not "dead" — GPU stays advertised.
    expect(capability.isCredentialConfigured).toBe(true);
    expect(capability.gpuAvailable).toBe(true);
    // But RENDER genuinely cannot run without the command.
    expect(capability.supportedWorkloads).toEqual([]);
  });

  test("reports unconfigured when no credentials are present at all", async () => {
    const provider = new KaggleNotebookComputeProvider();
    const config = provider.validateConfiguration();
    const capability = await provider.getCapability();

    expect(config.isConfigured).toBe(false);
    expect(config.missingKeys).toContain("KAGGLE_USERNAME");
    expect(config.missingKeys).toContain("KAGGLE_KEY");
    expect(capability.isCredentialConfigured).toBe(false);
    expect(capability.supportedWorkloads).toEqual([]);
  });

  test("a half-supplied legacy pair is still reported as missing its counterpart", () => {
    process.env.KAGGLE_USERNAME = "someone";
    process.env.KAGGLE_RENDER_COMMAND = "python render.py";

    const config = new KaggleNotebookComputeProvider().validateConfiguration();

    expect(config.isConfigured).toBe(false);
    expect(config.missingKeys).toEqual(["KAGGLE_KEY"]);
  });

  test("the shared predicate prefers the token over the legacy pair", () => {
    expect(kaggleCredentialKeys({ KAGGLE_API_TOKEN: "t", KAGGLE_USERNAME: "u", KAGGLE_KEY: "k" }))
      .toEqual(["KAGGLE_API_TOKEN"]);
    expect(kaggleCredentialKeys({ KAGGLE_USERNAME: "u", KAGGLE_KEY: "k" }))
      .toEqual(["KAGGLE_USERNAME", "KAGGLE_KEY"]);
    expect(kaggleCredentialKeys({})).toEqual(["KAGGLE_USERNAME", "KAGGLE_KEY"]);
  });
});
