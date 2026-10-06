import { describe, expect, it } from "vitest";
import { ContextFabric } from "../../core/cognitive/context/ContextFabric";
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
});
