import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaseManager } from "../core/cases/CaseManager";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { InMemoryLeaseRepository } from "../core/database/InMemoryDatabase";
import { LeaseManager } from "../core/leases/LeaseManager";
import { SlayerEngine } from "../core/slayers/SlayerEngine";
import { SlayerPrimeEngine } from "../core/slayers/prime/SlayerPrimeEngine";
import type {
  SlayerPrimeEvidence,
  SlayerAuthorizationGrant,
} from "../core/contracts/SlayerPrimeContracts";
import { WorldStateEngine } from "../core/worldstate/WorldStateEngine";
import {
  DiskSlayerPrimeStateStore,
  InMemorySlayerPrimeStateStore,
} from "../core/slayers/prime/SlayerPrimeStateStore";

const future = (ms: number) =>
  new Date(Date.now() + ms).toISOString();

describe("Slayer Prime — enforcement control plane", () => {
  let eventBus: DurableEventBus;
  let worldState: WorldStateEngine;
  let caseManager: CaseManager;
  let leaseManager: LeaseManager;
  let prime: SlayerPrimeEngine;

  beforeEach(() => {
    eventBus = new DurableEventBus();
    worldState = new WorldStateEngine();
    caseManager = new CaseManager(undefined, eventBus, worldState);
    leaseManager = new LeaseManager(
      new InMemoryLeaseRepository(),
      30_000
    );
    prime = new SlayerPrimeEngine(eventBus, leaseManager, {
      instanceId: "prime-test",
    });
    prime.start();
  });

  afterEach(() => prime.stop());

  function evidence(
    evidenceId: string,
    evidenceClass: SlayerPrimeEvidence["evidenceClass"],
    sourceId: string,
    subjectId: string
  ): SlayerPrimeEvidence {
    return {
      evidenceId,
      evidenceClass,
      sourceId,
      subjectId,
      observedAt: new Date().toISOString(),
      trust: "TRUSTED",
      trustScore: 0.95,
      independenceKey: sourceId,
      value: { state: "observed" },
    };
  }

  it("opens one logical incident for repeated identical observations", async () => {
    const observation = {
      observationId: "obs-1",
      floorId: "floor03_asset_realization",
      target: "worker-7",
      category: "WORKER_STALL" as const,
      severity: "HIGH" as const,
      description: "worker heartbeat stopped",
      rawMetrics: { ageMs: 20_000 },
      observedAt: new Date().toISOString(),
    };

    const a = await prime.ingest({ observation });
    const b = await prime.ingest({
      observation: {
        ...observation,
        observationId: "obs-2",
        observedAt: future(100),
      },
    });

    expect(a.incidentId).toBe(b.incidentId);
    expect(b.observationIds).toHaveLength(2);
  });

  it("requires independent evidence quorum before lease revocation", async () => {
    const acquired = await leaseManager.acquire(
      "job-7",
      "worker-7",
      30_000
    );
    expect(acquired).toBe(true);

    const incident = await prime.ingest({
      observation: {
        observationId: "obs-3",
        floorId: "floor03_asset_realization",
        target: "worker-7",
        category: "WORKER_STALL",
        severity: "HIGH",
        description: "worker is stale",
        rawMetrics: { heartbeatAgeMs: 20_000 },
        observedAt: new Date().toISOString(),
      },
      evidence: [
        evidence(
          "ev-telemetry",
          "TELEMETRY",
          "metrics",
          "worker-7"
        ),
      ],
    });

    const first = await prime.planAction(
      incident.incidentId,
      "REVOKE_LEASE",
      "TASK",
      "worker-7",
      "scl",
      { taskId: "job-7", ownerAgentId: "worker-7" }
    );
    expect(first.quorum.eligible).toBe(false);
    expect(first.quorum.missingClasses).toContain("LEASE");

    await prime.addEvidence(
      incident.incidentId,
      evidence(
        "ev-lease",
        "LEASE",
        "lease-manager",
        "job-7"
      )
    );
    await prime.addEvidence(
      incident.incidentId,
      evidence(
        "ev-heartbeat",
        "HEARTBEAT",
        "heartbeat-tracker",
        "worker-7"
      )
    );

    const second = await prime.planAction(
      incident.incidentId,
      "REVOKE_LEASE",
      "TASK",
      "worker-7",
      "scl",
      { taskId: "job-7", ownerAgentId: "worker-7" }
    );
    expect(second.quorum.eligible).toBe(true);
    expect(second.incident.state).toBe("ACTION_ELIGIBLE");
  });

  it("rejects unauthorized enforcement and accepts a Guardian-authorized revoke with postcondition proof", async () => {
    await leaseManager.acquire(
      "job-9",
      "worker-9",
      30_000
    );

    const incident = await prime.ingest({
      observation: {
        observationId: "obs-9",
        floorId: "floor03_asset_realization",
        target: "worker-9",
        category: "WORKER_STALL",
        severity: "HIGH",
        description: "worker is stale",
        rawMetrics: {},
        observedAt: new Date().toISOString(),
      },
      evidence: [
        evidence(
          "ev-lease-9",
          "LEASE",
          "lease-manager",
          "job-9"
        ),
        evidence(
          "ev-heartbeat-9",
          "HEARTBEAT",
          "heartbeat-tracker",
          "worker-9"
        ),
      ],
    });

    const { intent } = await prime.planAction(
      incident.incidentId,
      "REVOKE_LEASE",
      "TASK",
      "worker-9",
      "slayer-prime",
      { taskId: "job-9", ownerAgentId: "worker-9" }
    );

    const denied = await prime.executeAuthorizedAction(
      intent.intentId,
      {
        grantId: "grant-denied",
        incidentId: incident.incidentId,
        action: "REVOKE_LEASE",
        scope: "TASK",
        targetId: "worker-9",
        authorizedBy: "unknown",
        authorizedRole: "GUARDIAN",
        issuedAt: new Date().toISOString(),
        expiresAt: future(60_000),
        evidenceRefs: ["ev-lease-9", "ev-heartbeat-9"],
        reason: "invalid actor",
      }
    );
    expect(denied.status).toBe("REJECTED");

    const grant: SlayerAuthorizationGrant = {
      grantId: "grant-9",
      incidentId: incident.incidentId,
      action: "REVOKE_LEASE",
      scope: "TASK",
      targetId: "worker-9",
      authorizedBy: "guardian_floor03",
      authorizedRole: "GUARDIAN",
      issuedAt: new Date().toISOString(),
      expiresAt: future(60_000),
      evidenceRefs: ["ev-lease-9", "ev-heartbeat-9"],
      reason: "stale execution lease requires containment",
    };

    const receipt = await prime.executeAuthorizedAction(
      intent.intentId,
      grant
    );
    expect(receipt.status).toBe("VERIFIED");
    expect(receipt.fencingToken).toBeDefined();
    expect(receipt.containmentProof?.verified).toBe(true);

    const lease = await leaseManager.getLease("job-9");
    expect(lease?.status).toBe("RELEASED");
  });

  it("deduplicates the same logical action proposal across repeated planning calls", async () => {
    await leaseManager.acquire("job-dedupe", "worker-dedupe", 30_000);

    const incident = await prime.ingest({
      observation: {
        observationId: "obs-dedupe",
        floorId: "floor03_asset_realization",
        target: "worker-dedupe",
        category: "WORKER_STALL",
        severity: "HIGH",
        description: "worker is stale",
        rawMetrics: {},
        observedAt: new Date().toISOString(),
      },
      evidence: [
        evidence("ev-dedupe-lease", "LEASE", "lease-manager", "job-dedupe"),
        evidence("ev-dedupe-heartbeat", "HEARTBEAT", "heartbeat-tracker", "worker-dedupe"),
      ],
    });

    const first = await prime.planAction(
      incident.incidentId,
      "REVOKE_LEASE",
      "TASK",
      "worker-dedupe",
      "slayer-prime",
      { taskId: "job-dedupe", ownerAgentId: "worker-dedupe" }
    );
    const second = await prime.planAction(
      incident.incidentId,
      "REVOKE_LEASE",
      "TASK",
      "worker-dedupe",
      "another-replica",
      { taskId: "job-dedupe", ownerAgentId: "worker-dedupe" }
    );

    expect(second.intent.intentId).toBe(first.intent.intentId);
    expect(second.incident.actionIntentIds.filter((id) => id === first.intent.intentId)).toHaveLength(1);
    expect(second.incident.notes.some((note) => note.includes("Existing deduplicated intent reused"))).toBe(true);
  });

  it("restores Prime incident state after a real disk-backed restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "shortforge-slayer-prime-"));
    const store = new DiskSlayerPrimeStateStore(directory);
    const first = new SlayerPrimeEngine(eventBus, leaseManager, {
      instanceId: "prime-restart-a",
      stateStore: store,
    });
    first.start();

    const incident = await first.ingest({
      observation: {
        observationId: "obs-restart",
        floorId: "floor02_scripting",
        target: "worker-restart",
        category: "WORKER_STALL",
        severity: "HIGH",
        description: "worker stopped",
        rawMetrics: {},
        observedAt: new Date().toISOString(),
      },
    });
    first.stop();

    const second = new SlayerPrimeEngine(eventBus, leaseManager, {
      instanceId: "prime-restart-b",
      stateStore: store,
    });
    second.start();
    await second.ingest({
      observation: {
        observationId: "obs-restart-2",
        floorId: "floor02_scripting",
        target: "worker-restart",
        category: "WORKER_STALL",
        severity: "HIGH",
        description: "worker still stopped",
        rawMetrics: {},
        observedAt: future(100),
      },
    });

    expect(second.getIncident(incident.incidentId)).toBeDefined();
    expect(second.getIncident(incident.incidentId)?.observationIds).toEqual([
      "obs-restart",
      "obs-restart-2",
    ]);
    second.stop();
    rmSync(directory, { recursive: true, force: true });
  });

  it("allows only one Prime replica to hold enforcement leadership in shared state", async () => {
    const store = new InMemorySlayerPrimeStateStore();
    const first = new SlayerPrimeEngine(eventBus, leaseManager, {
      instanceId: "prime-leader-a",
      stateStore: store,
      leadershipLeaseTtlMs: 30_000,
    });
    const second = new SlayerPrimeEngine(eventBus, leaseManager, {
      instanceId: "prime-leader-b",
      stateStore: store,
      leadershipLeaseTtlMs: 30_000,
    });

    first.start();
    second.start();

    await first.ingest({
      observation: {
        observationId: "obs-leader",
        floorId: "floor03_asset_realization",
        target: "worker-leader",
        category: "WORKER_STALL",
        severity: "HIGH",
        description: "stale worker",
        rawMetrics: {},
        observedAt: new Date().toISOString(),
      },
    });

    expect(first.isLeader()).toBe(true);
    expect(second.isLeader()).toBe(false);
    await expect(
      second.ingest({
        observation: {
          observationId: "obs-should-reject",
          floorId: "floor03_asset_realization",
          target: "worker-other",
          category: "WORKER_STALL",
          severity: "HIGH",
          description: "stale worker",
          rawMetrics: {},
          observedAt: new Date().toISOString(),
        },
      })
    ).rejects.toThrow("not the current enforcement leader");

    first.stop();
    second.stop();
  });

  it("keeps the leadership epoch stable across renewal and advances it on takeover", async () => {
    const store = new InMemorySlayerPrimeStateStore();
    const first = await store.acquireLeadership("prime-a", 30_000);
    expect(first).not.toBeNull();

    const renewed = await store.renewLeadership(first!, 30_000);
    expect(renewed?.epoch).toBe(first?.epoch);

    await store.releaseLeadership(renewed!);
    const second = await store.acquireLeadership("prime-b", 30_000);

    expect(second?.epoch).toBeGreaterThan(first!.epoch);
    expect(await store.isLeadershipCurrent("prime-a", first!.epoch)).toBe(false);
    expect(await store.isLeadershipCurrent("prime-b", second!.epoch)).toBe(true);
  });

  it("rejects a Prime revoke when the worker lease was reacquired with a newer resource fence", async () => {
    await leaseManager.acquire("job-fence", "worker-old", 30_000);
    const oldLease = await leaseManager.getLease("job-fence");
    expect(oldLease?.fencingToken).toBeDefined();

    const incident = await prime.ingest({
      observation: {
        observationId: "obs-fence",
        floorId: "floor03_asset_realization",
        target: "worker-old",
        category: "WORKER_STALL",
        severity: "HIGH",
        description: "worker lease became stale",
        rawMetrics: {},
        observedAt: new Date().toISOString(),
      },
      evidence: [
        evidence("ev-fence-lease", "LEASE", "lease-manager", "job-fence"),
        evidence("ev-fence-heartbeat", "HEARTBEAT", "heartbeat-tracker", "worker-old"),
      ],
    });

    const { intent } = await prime.planAction(
      incident.incidentId,
      "REVOKE_LEASE",
      "TASK",
      "worker-old",
      "slayer-prime",
      { taskId: "job-fence", ownerAgentId: "worker-old" }
    );

    await leaseManager.release("job-fence", "worker-old");
    await leaseManager.acquire("job-fence", "worker-new", 30_000);
    const replacement = await leaseManager.getLease("job-fence");
    expect(replacement?.fencingToken).toBeGreaterThan(oldLease!.fencingToken!);

    const receipt = await prime.executeAuthorizedAction(intent.intentId, {
      grantId: "grant-fence",
      incidentId: incident.incidentId,
      action: "REVOKE_LEASE",
      scope: "TASK",
      targetId: "worker-old",
      authorizedBy: "guardian_floor03",
      authorizedRole: "GUARDIAN",
      issuedAt: new Date().toISOString(),
      expiresAt: future(60_000),
      evidenceRefs: ["ev-fence-lease", "ev-fence-heartbeat"],
      reason: "stale worker lease containment",
    });

    expect(receipt.status).toBe("STALE_ACTION");
    const current = await leaseManager.getLease("job-fence");
    expect(current?.ownerAgentId).toBe("worker-new");
    expect(current?.status).toBe("ACTIVE");
  });

  it("is wired into the master SlayerEngine without changing worker authority", async () => {
    const engine = new SlayerEngine(
      caseManager,
      eventBus,
      worldState,
      undefined,
      100,
      leaseManager
    );

    expect(engine.getPrime()).toBeDefined();

    await engine.start();
    expect(engine.getPrime().getActiveIncidents()).toEqual([]);

    worldState.updateFloorStatus(
      "floor02_scripting",
      "ERROR",
      "queue deadlock"
    );
    await engine.runPatrolCycle();

    const active = engine.getPrime().getActiveIncidents();
    expect(active.length).toBeGreaterThan(0);
    expect(
      active.some(
        (incident) => incident.floorId === "floor02_scripting"
      )
    ).toBe(true);

    await engine.stop();
  });
});
