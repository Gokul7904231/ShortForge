import { describe, expect, it } from "vitest";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { LeaseManager } from "../core/leases/LeaseManager";
import { InMemoryLeaseRepository } from "../core/database/InMemoryDatabase";
import { SlayerPrimeEngine } from "../core/slayers/prime/SlayerPrimeEngine";
import { InMemorySlayerPrimeStateStore } from "../core/slayers/prime/SlayerPrimeStateStore";

describe("Slayer Prime resurrection", () => {
  it("assigns a new process lease identity and a newer generation on restart", async () => {
    const store = new InMemorySlayerPrimeStateStore();
    const eventBus = new DurableEventBus();
    const leaseManager = new LeaseManager(new InMemoryLeaseRepository());

    const first = new SlayerPrimeEngine(eventBus, leaseManager, {
      instanceId: "prime-same-role",
      stateStore: store,
      leadershipLeaseTtlMs: 30_000,
    });
    first.start();
    const firstLeadership = first.getLeadership();

    expect(firstLeadership).not.toBeNull();
    first.stop();

    const second = new SlayerPrimeEngine(eventBus, leaseManager, {
      instanceId: "prime-same-role",
      stateStore: store,
      leadershipLeaseTtlMs: 30_000,
    });
    second.start();
    const secondLeadership = second.getLeadership();

    expect(secondLeadership).not.toBeNull();
    expect(secondLeadership!.holderId).not.toBe(firstLeadership!.holderId);
    expect(secondLeadership!.epoch).toBeGreaterThan(firstLeadership!.epoch);

    second.stop();
  });
});
