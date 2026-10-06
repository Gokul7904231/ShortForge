import { describe, expect, it } from "vitest";
import { InMemoryContextFabricRepository } from "../../core/database/InMemoryDatabase";
import { ContextConcurrencyConflictError } from "../../core/database/DatabaseContracts";
import type { ContextWorkspace } from "../../core/cognitive/context/ContextFabricContracts";

function workspace(version: number): ContextWorkspace {
  return {
    workspaceId: "ctxws_persist",
    missionId: "mission_persist",
    taskId: "task_persist",
    version,
    contextHash: version.toString().padStart(64, "0"),
    activeReferences: [],
    totalTokens: 0,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  };
}

describe("Context Fabric durable persistence contract", () => {
  it("round-trips a workspace and preserves optimistic version semantics", async () => {
    const repository = new InMemoryContextFabricRepository();
    await repository.saveWorkspace(workspace(0));

    const loaded = await repository.getWorkspace("ctxws_persist");
    expect(loaded?.version).toBe(0);

    await repository.saveWorkspace(workspace(1), 0);
    expect((await repository.getWorkspace("ctxws_persist"))?.version).toBe(1);

    await expect(repository.saveWorkspace(workspace(2), 0))
      .rejects.toBeInstanceOf(ContextConcurrencyConflictError);
  });

  it("deduplicates edit ledger entries by edit id", async () => {
    const repository = new InMemoryContextFabricRepository();
    const entry = {
      editId: "edit_1",
      workspaceId: "ctxws_persist",
      missionId: "mission_persist",
      taskId: "task_persist",
      baseVersion: 0,
      resultingVersion: 1,
      actor: "CLM_PROPOSAL" as const,
      type: "OPTIMIZE" as const,
      reason: "test optimization",
      resultHash: "a".repeat(64),
      recordedAt: "2026-10-06T00:00:00.000Z",
    };

    await repository.appendEdit(entry);
    await repository.appendEdit(entry);

    const history = await repository.getEditHistory("ctxws_persist");
    expect(history).toHaveLength(1);
    expect(history[0].editId).toBe("edit_1");
  });
});
