import { describe, expect, it } from "vitest";
import {
  InMemorySlayerPrimeStateStore,
} from "../core/slayers/prime/SlayerPrimeStateStore";
import { SlayerActionExecutor } from "../core/slayers/prime/SlayerActionExecutor";
import type {
  SlayerActionIntent,
  SlayerEnforcementAdapter,
  SlayerAuthorizationGrant,
  SlayerActionLease,
  SlayerPrimeAction,
  SlayerPrimeScope,
} from "../core/contracts/SlayerPrimeContracts";
import type { SlayerIncident } from "../core/contracts/SlayerPrimeContracts";

const isoIn = (ms: number) =>
  new Date(Date.now() + ms).toISOString();

const incident = (id: string, epoch?: number): SlayerIncident => ({
  incidentId: id,
  fingerprint: "fp-" + id,
  state: "INCIDENT_OPEN",
  severity: "HIGH",
  floorId: "floor03_asset_realization",
  targetId: "worker-" + id,
  category: "WORKER_STALL",
  firstObservedAt: new Date().toISOString(),
  lastObservedAt: new Date().toISOString(),
  observationIds: ["obs-" + id],
  evidence: [],
  relatedCaseIds: [],
  actionIntentIds: [],
  notes: [],
  persistenceEpoch: epoch,
});

const intent = (id: string): SlayerActionIntent => ({
  intentId: id,
  dedupeKey: "dedupe-" + id,
  incidentId: "inc-" + id,
  action: "OBSERVE",
  scope: "WORKER",
  targetId: "worker-" + id,
  proposedBy: "slayer-test",
  reason: "hardening test",
  createdAt: new Date().toISOString(),
  expiresAt: isoIn(30_000),
  parameters: {},
});

describe("Slayer Prime — distributed hardening", () => {
  it("never reuses a leadership epoch after release and takeover", async () => {
    const store = new InMemorySlayerPrimeStateStore();

    const first = await store.acquireLeadership("prime:a", 30_000);
    expect(first).not.toBeNull();
    await store.releaseLeadership(first!);

    const second = await store.acquireLeadership("prime:b", 30_000);
    expect(second).not.toBeNull();
    expect(second!.epoch).toBeGreaterThan(first!.epoch);
  });

  it("rejects a stale epoch from overwriting newer incident state", async () => {
    const store = new InMemorySlayerPrimeStateStore();

    expect(
      await store.upsertIncident(incident("stale-write", 11), {
        holderId: "prime:new",
        epoch: 11,
      })
    ).toBe(true);

    expect(
      await store.upsertIncident(incident("stale-write", 10), {
        holderId: "prime:old",
        epoch: 10,
      })
    ).toBe(false);

    const snapshot = await store.load();
    expect(snapshot.incidents[0].persistenceEpoch).toBe(11);
  });

  it("allows only one logical Prime writer during an active leadership lease", async () => {
    const store = new InMemorySlayerPrimeStateStore();

    const first = await store.acquireLeadership("prime:a", 30_000);
    const second = await store.acquireLeadership("prime:b", 30_000);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("deduplicates the same logical action intent across replicas", async () => {
    const store = new InMemorySlayerPrimeStateStore();
    const first = await store.createIntentIfAbsent(intent("shared"));
    const duplicate: SlayerActionIntent = {
      ...intent("shared"),
      intentId: "different-process-id",
    };
    const second = await store.createIntentIfAbsent(duplicate);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.intent.intentId).toBe(first.intent.intentId);
  });

  it("never lets a superseded action lease execute after the fence is lost", async () => {
    class FenceFlipStore extends InMemorySlayerPrimeStateStore {
      private lost = false;

      async acquireActionLease(
        inputIntent: SlayerActionIntent,
        holderId: string,
        ttlMs: number,
        leadershipEpoch: number
      ): Promise<SlayerActionLease | null> {
        const lease = await super.acquireActionLease(
          inputIntent,
          holderId,
          ttlMs,
          leadershipEpoch
        );
        if (lease) this.lost = true;
        return lease;
      }

      override async isLeadershipCurrent(holderId: string, epoch: number): Promise<boolean> {
        if (this.lost) return false;
        return super.isLeadershipCurrent(holderId, epoch);
      }
    }

    const store = new FenceFlipStore();
    const leadership = await store.acquireLeadership("prime:fence", 30_000);
    expect(leadership).not.toBeNull();

    let executions = 0;
    const adapter: SlayerEnforcementAdapter = {
      adapterId: "test-observer",
      supports: (action: SlayerPrimeAction) => action === "OBSERVE",
      execute: async () => {
        executions += 1;
        return { observed: true };
      },
      verify: async (
        _intent: SlayerActionIntent,
        _grant: SlayerAuthorizationGrant,
        _lease: SlayerActionLease,
        _details: Record<string, unknown>
      ) => ({
        verified: true,
        reason: "test",
        observedPostcondition: { observed: true },
      }),
    };

    const executor = new SlayerActionExecutor({
      adapters: [adapter],
      leadershipGuard: store,
    });

    const receipt = await executor.execute(
      intent("fence"),
      undefined,
      "prime:fence",
      leadership!.epoch
    );

    expect(receipt.status).toBe("STALE_ACTION");
    expect(executions).toBe(0);
  });

  it("issues a new, higher action fence when an old reservation is released", async () => {
    const store = new InMemorySlayerPrimeStateStore();
    const leadership = await store.acquireLeadership("prime:action", 30_000);
    expect(leadership).not.toBeNull();

    const i = intent("action-fence");
    const first = await store.acquireActionLease(
      i,
      "prime:action",
      30_000,
      leadership!.epoch
    );
    expect(first).not.toBeNull();

    await store.releaseActionLease(
      first!.actionLeaseId,
      "prime:action",
      first!.fencingToken
    );

    const second = await store.acquireActionLease(
      i,
      "prime:action",
      30_000,
      leadership!.epoch
    );
    expect(second).not.toBeNull();
    expect(second!.fencingToken).toBeGreaterThan(first!.fencingToken);
  });
});
