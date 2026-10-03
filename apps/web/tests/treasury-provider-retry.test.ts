import { describe, expect, it } from "vitest";
import { BaseProviderPlugin } from "../ai/providers/base-provider";
import type { AICapability, ModelMeta, PluginManifest } from "../ai/capability-registry";

class TestProvider extends BaseProviderPlugin {
  id = "test-provider";
  name = "Treasury Test Provider";
  manifest: PluginManifest = {
    id: this.id,
    name: this.name,
    version: "1.0.0",
    author: "test",
    description: "test",
    dependencies: [],
    capabilities: ["SCRIPT"],
  };

  protected chatAdapter = {
    id: "test-chat",
    generateText: async () => {
      throw new Error("single attempt failure");
    },
  } as any;

  async authenticateGuard(): Promise<void> {}
  async discoverModels(): Promise<ModelMeta[]> { return []; }
}

describe("Treasury provider retry boundary", () => {
  it("disables provider-internal retries when Treasury manages the attempt budget", async () => {
    const provider = new TestProvider();

    await expect(
      provider.execute("SCRIPT" as AICapability, {
        prompt: "hello",
        __treasuryManagedRetries: true,
        __treasuryExecutionId: "exec-1",
      }),
    ).rejects.toThrow("single attempt failure");

    expect(provider.status().retries).toBe(0);
  });
});
