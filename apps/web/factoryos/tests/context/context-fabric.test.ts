import { describe, expect, it } from "vitest";
import { ContextFabric } from "../../core/cognitive/context/ContextFabric";
import { CognitivePlaneEngine } from "../../core/cognitive/CognitivePlaneEngine";
import { InMemoryContextFabricRepository } from "../../core/database/InMemoryDatabase";
import { ContextConcurrencyConflictError, ContextDurabilityUnavailableError } from "../../core/database/DatabaseContracts";
import { MongoContextFabricRepository } from "../../core/database/MongoContextFabricRepository";
import type { ContextReference } from "../../core/cognitive/CognitiveContracts";

function ref(id: string, type: ContextReference["type"] = "DOCUMENT"): ContextReference {
  return {
    refId: id,
    type,
    title: "Reference " + id,
    summary: "Summary for " + id,
    tokenCount: 40,
    timestamp: new Date().toISOString(),
    confidence: 0.9,
    source: "test",
    tags: ["context-fabric"],
    isDereferenced: false,
  };
}

describe("ContextFabric convergence boundary", () => {
  it("provides one active working-context facade over existing primitives", () => {
    const fabric = new ContextFabric({
      workspaceId: "ctxws_test",
      missionId: "mission_test",
      taskId: "task_test",
    });

    const first = fabric.applyEdits([
      { type: "RETAIN", reference: ref("a"), reason: "seed", editId: "e1", baseVersion: 0, actor: "SYSTEM" },
      { type: "RETAIN", reference: ref("b"), reason: "seed", editId: "e2", baseVersion: 0, actor: "SYSTEM" },
    ]);

    expect(first.missionId).toBe("mission_test");
    expect(first.taskId).toBe("task_test");
    expect(first.version).toBe(1);
    expect(first.activeReferences).toHaveLength(2);
    expect(first.totalTokens).toBe(80);
    expect(first.contextHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects stale context edits before mutation", () => {
    const fabric = new ContextFabric();
    fabric.applyEdits([
      { type: "RETAIN", reference: ref("a"), reason: "seed", editId: "e1", baseVersion: 0, actor: "SYSTEM" },
    ]);

    expect(() => fabric.applyEdits([
      { type: "RETAIN", reference: ref("b"), reason: "stale", editId: "e2", baseVersion: 0, actor: "CLM_PROPOSAL" },
    ])).toThrow(/stale baseVersion/);

    expect(fabric.getWorkspace().version).toBe(1);
    expect(fabric.getWorkspace().activeReferences).toHaveLength(1);
  });

  it("keeps authority outside the context facade", () => {
    const fabric = new ContextFabric();
    expect(ContextFabric.AUTHORITY_DOMAIN).toBe("working_context");
    expect("grantCapability" in fabric).toBe(false);
    expect("reserveTreasury" in fabric).toBe(false);
    expect("verifyF07" in fabric).toBe(false);
    expect("issueLease" in fabric).toBe(false);
  });

  it("reuses existing indexer and compiler primitives", () => {
    const fabric = new ContextFabric();
    expect(fabric.indexer).toBeDefined();
    expect(fabric.compiler).toBeDefined();
    expect(fabric.activeContext).toBeDefined();
  });

  it("fails closed when Mongo atomic transaction capability is not supplied", async () => {
    const fakeDb = {
      collection: () => ({
        findOne: async () => null,
        find: () => ({ toArray: async () => [] }),
      }),
    } as any;

    const repository = new MongoContextFabricRepository(fakeDb);
    const workspace = new ContextFabric({
      workspaceId: "ctxws_no_transaction",
      missionId: "mission_no_transaction",
      taskId: "task_no_transaction",
    }).getWorkspace();

    await expect(
      repository.commitWorkspace({
        workspace,
        edits: [],
        expectedVersion: 0,
      })
    ).rejects.toBeInstanceOf(ContextDurabilityUnavailableError);
  });

});


describe("Cognitive plane convergence", () => {
  it("uses ContextFabric as the canonical working-context facade", () => {
    const plane = new CognitivePlaneEngine();
    expect(plane.contextFabric.indexer).toBe(plane.contextOrchestrator.indexer);
    expect(plane.activeContextManager).toBe(plane.contextFabric.activeContext);
  });
});


describe("Context Fabric durable commit and recovery", () => {
  it("commits a working context and rehydrates it exactly", async () => {
    const repository = new InMemoryContextFabricRepository();
    const first = new ContextFabric({
      workspaceId: "ctxws_durable",
      missionId: "mission_durable",
      taskId: "task_durable",
      repository,
    });

    const committed = await first.commitEdits([
      {
        editId: "edit_durable_1",
        baseVersion: 0,
        actor: "SYSTEM",
        type: "RETAIN",
        reference: ref("durable"),
        reason: "durable seed",
      },
    ]);

    const second = new ContextFabric({
      workspaceId: "ctxws_durable",
      missionId: "mission_other",
      taskId: "task_other",
      repository,
    });

    const recovered = await second.recover();
    expect(recovered?.version).toBe(committed.version);
    expect(recovered?.contextHash).toBe(committed.contextHash);
    expect(recovered?.activeReferences.map((item) => item.refId)).toEqual(["durable"]);
  });

  it("rolls back the in-memory head when the durable commit fails", async () => {
    const repository = new InMemoryContextFabricRepository();
    await repository.saveWorkspace({
      workspaceId: "ctxws_rollback",
      missionId: "mission_rollback",
      taskId: "task_rollback",
      version: 0,
      contextHash: "",
      activeReferences: [],
      totalTokens: 0,
      createdAt: "2026-10-06T00:00:00.000Z",
      updatedAt: "2026-10-06T00:00:00.000Z",
    });

    const originalCommit = repository.commitWorkspace.bind(repository);
    repository.commitWorkspace = async () => {
      throw new Error("simulated durable outage");
    };

    const fabric = new ContextFabric({
      workspaceId: "ctxws_rollback",
      missionId: "mission_rollback",
      taskId: "task_rollback",
      repository,
    });

    await expect(
      fabric.commitEdits([
        {
          editId: "edit_fail",
          baseVersion: 0,
          actor: "SYSTEM",
          type: "RETAIN",
          reference: ref("should-not-stick"),
          reason: "failure test",
        },
      ])
    ).rejects.toThrow("simulated durable outage");

    expect(fabric.getWorkspace().version).toBe(0);
    expect(fabric.getWorkspace().activeReferences).toHaveLength(0);

    repository.commitWorkspace = originalCommit;
  });

  it("rejects a stale durable writer before its mutation becomes durable", async () => {
    const repository = new InMemoryContextFabricRepository();
    const first = new ContextFabric({
      workspaceId: "ctxws_race",
      missionId: "mission_race",
      taskId: "task_race",
      repository,
    });
    const second = new ContextFabric({
      workspaceId: "ctxws_race",
      missionId: "mission_race",
      taskId: "task_race",
      repository,
    });

    await first.commitEdits([
      {
        editId: "edit_race_1",
        baseVersion: 0,
        actor: "SYSTEM",
        type: "RETAIN",
        reference: ref("winner"),
        reason: "first writer",
      },
    ]);

    await expect(
      second.commitEdits([
        {
          editId: "edit_race_2",
          baseVersion: 0,
          actor: "CLM_PROPOSAL",
          type: "RETAIN",
          reference: ref("stale"),
          reason: "stale writer",
        },
      ])
    ).rejects.toBeInstanceOf(ContextConcurrencyConflictError);

    expect((await repository.getWorkspace("ctxws_race"))?.activeReferences.map((item) => item.refId))
      .toEqual(["winner"]);
    expect(second.getWorkspace().version).toBe(0);
    expect(second.getWorkspace().activeReferences).toHaveLength(0);
  });
});
