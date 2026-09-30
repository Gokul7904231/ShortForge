import { describe, expect, it } from "vitest";
import { InMemorySlayerPrimeStateStore } from "../core/slayers/prime/SlayerPrimeStateStore";

describe("Slayer Prime — exact leadership generation", () => {
  it("rejects the previous generation immediately after a renewal", async () => {
    const store = new InMemorySlayerPrimeStateStore();

    const first = await store.acquireLeadership("prime:epoch", 30_000);
    expect(first).not.toBeNull();

    const second = await store.renewLeadership(first!, 30_000);
    expect(second).not.toBeNull();
    expect(second!.epoch).toBeGreaterThan(first!.epoch);

    await expect(
      store.isLeadershipCurrent("prime:epoch", first!.epoch)
    ).resolves.toBe(false);
    await expect(
      store.isLeadershipCurrent("prime:epoch", second!.epoch)
    ).resolves.toBe(true);
  });
});
