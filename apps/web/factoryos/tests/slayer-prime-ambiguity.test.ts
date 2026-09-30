import { describe, expect, it } from "vitest";
import { SlayerActionExecutor } from "../core/slayers/prime/SlayerActionExecutor";
import { InMemorySlayerPrimeStateStore } from "../core/slayers/prime/SlayerPrimeStateStore";
import type {
  SlayerActionIntent,
  SlayerActionLease,
  SlayerAuthorizationGrant,
  SlayerEnforcementAdapter,
  SlayerPrimeAction,
} from "../core/contracts/SlayerPrimeContracts";

const testIntent: SlayerActionIntent = {
  intentId: "intent-ambiguous-1",
  dedupeKey: "dedupe-ambiguous-1",
  incidentId: "incident-ambiguous-1",
  action: "OBSERVE",
  scope: "WORKER",
  targetId: "worker-ambiguous",
  proposedBy: "test",
  reason: "replay guard test",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  parameters: {},
};

describe("Slayer Prime ambiguous execution guard", () => {
  it("does not execute the same intent twice after an indeterminate adapter result", async () => {
    const store = new InMemorySlayerPrimeStateStore();
    const leader = await store.acquireLeadership("prime:ambiguous", 30_000);
    expect(leader).not.toBeNull();

    let executions = 0;
    const adapter: SlayerEnforcementAdapter = {
      adapterId: "indeterminate-test-adapter",
      supports: (action: SlayerPrimeAction) => action === "OBSERVE",
      execute: async (
        _intent: SlayerActionIntent,
        _grant: SlayerAuthorizationGrant,
        _lease: SlayerActionLease
      ) => {
        executions += 1;
        throw new Error("indeterminate-result");
      },
      verify: async () => ({
        verified: false,
        reason: "no postcondition",
        observedPostcondition: {},
      }),
    };

    const executor = new SlayerActionExecutor({
      adapters: [adapter],
      leadershipGuard: store,
    });

    const first = await executor.execute(
      testIntent,
      undefined,
      "prime:ambiguous",
      leader!.epoch
    );
    expect(first.status).toBe("UNKNOWN");
    expect(executions).toBe(1);

    const second = await executor.execute(
      testIntent,
      undefined,
      "prime:ambiguous",
      leader!.epoch
    );
    expect(second.status).toBe("UNKNOWN");
    expect(executions).toBe(1);
  });
});
