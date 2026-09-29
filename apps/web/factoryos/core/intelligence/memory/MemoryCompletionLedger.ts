import { createHash } from "node:crypto";
import type {
  MemoryCompletionSnapshot,
  MemoryGateDefinition,
  MemoryGateProof,
  MemoryGateRecord,
  MemoryGateStatus,
} from "./MemorySemanticsContracts";

export class MemoryCompletionLedger {
  private readonly gates = new Map<string, MemoryGateRecord>();

  public registerGate(definition: MemoryGateDefinition): MemoryGateRecord {
    if (!definition.gateId.trim()) throw new Error("[MemoryCompletionLedger] gateId is required");
    if (!definition.outcome.trim()) throw new Error("[MemoryCompletionLedger] observable outcome is required");
    if (this.gates.has(definition.gateId)) {
      throw new Error("[MemoryCompletionLedger] duplicate gate: " + definition.gateId);
    }
    const record: MemoryGateRecord = {
      ...definition,
      definitionDigest: this.digestDefinition(definition),
      status: "PENDING",
    };
    this.gates.set(definition.gateId, record);
    return record;
  }

  public refreshDefinition(definition: MemoryGateDefinition): MemoryGateRecord {
    const existing = this.gates.get(definition.gateId);
    if (!existing) return this.registerGate(definition);
    const digest = this.digestDefinition(definition);
    const status: MemoryGateStatus =
      existing.abandonmentReason ? "HANDOFF"
        : existing.proof?.definitionDigest === digest ? "MET"
        : "REVERIFY_REQUIRED";
    const record: MemoryGateRecord = {
      ...definition,
      definitionDigest: digest,
      status,
      proof: existing.proof,
      abandonmentReason: existing.abandonmentReason,
    };
    this.gates.set(definition.gateId, record);
    return record;
  }

  public recordProof(proof: MemoryGateProof): MemoryGateRecord {
    const gate = this.require(proof.gateId);
    if (gate.status === "HANDOFF") {
      throw new Error("[MemoryCompletionLedger] cannot prove an abandoned gate: " + proof.gateId);
    }
    if (proof.definitionDigest !== gate.definitionDigest) {
      throw new Error("[MemoryCompletionLedger] proof definition digest is stale: " + proof.gateId);
    }
    if (!proof.evidenceDigest.trim()) {
      throw new Error("[MemoryCompletionLedger] evidenceDigest is required");
    }
    for (const dependencyId of gate.dependsOn ?? []) {
      const dependency = this.gates.get(dependencyId);
      if (!dependency || dependency.status !== "MET") {
        throw new Error(
          "[MemoryCompletionLedger] dependency is not currently proven: " + dependencyId,
        );
      }
    }
    const next: MemoryGateRecord = {
      ...gate,
      status: "MET",
      proof,
      abandonmentReason: undefined,
    };
    this.gates.set(gate.gateId, next);
    return next;
  }

  public abandon(gateId: string, reason: string): MemoryGateRecord {
    if (!reason.trim()) throw new Error("[MemoryCompletionLedger] abandonment reason is required");
    const gate = this.require(gateId);
    const next: MemoryGateRecord = {
      ...gate,
      status: "HANDOFF",
      abandonmentReason: reason,
      proof: undefined,
    };
    this.gates.set(gateId, next);
    return next;
  }

  public get(gateId: string): MemoryGateRecord | undefined {
    return this.gates.get(gateId);
  }

  public list(): readonly MemoryGateRecord[] {
    return [...this.gates.values()];
  }

  public snapshot(now = new Date().toISOString()): MemoryCompletionSnapshot {
    const gates = this.list();
    const metCount = gates.filter((gate) => gate.status === "MET").length;
    const pendingCount = gates.filter((gate) => gate.status === "PENDING").length;
    const reverifyRequiredCount = gates.filter((gate) => gate.status === "REVERIFY_REQUIRED").length;
    const handoffCount = gates.filter((gate) => gate.status === "HANDOFF").length;

    return {
      status:
        handoffCount > 0 ? "HANDOFF"
          : reverifyRequiredCount > 0 ? "REVERIFY_REQUIRED"
            : pendingCount > 0 ? "INCOMPLETE"
            : gates.length > 0 && metCount === gates.length ? "ALL_MET"
            : "INCOMPLETE",
      gates,
      metCount,
      pendingCount,
      reverifyRequiredCount,
      handoffCount,
      evaluatedAt: now,
    };
  }

  public canReleaseLayer(layer: "LEAF" | "BRANCH" | "ROOT"): boolean {
    const relevant = this.list().filter((gate) => gate.layer === layer);
    if (relevant.length === 0) return false;
    return relevant.every((gate) => gate.status === "MET");
  }

  private digestDefinition(definition: MemoryGateDefinition): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          gateId: definition.gateId,
          layer: definition.layer,
          outcome: definition.outcome,
          check: definition.check ?? null,
          expect: definition.expect ?? null,
          cwd: definition.cwd ?? null,
          dependsOn: definition.dependsOn ?? [],
        }),
        "utf8",
      )
      .digest("hex");
  }

  private require(gateId: string): MemoryGateRecord {
    const gate = this.gates.get(gateId);
    if (!gate) throw new Error("[MemoryCompletionLedger] unknown gate: " + gateId);
    return gate;
  }
}
