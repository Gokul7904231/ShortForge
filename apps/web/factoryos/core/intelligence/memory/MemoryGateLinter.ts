import type { MemoryGateDefinition } from "./MemorySemanticsContracts";

export type MemoryGateLintSeverity = "ERROR" | "WARNING";

export interface MemoryGateLintFinding {
  readonly gateId?: string;
  readonly severity: MemoryGateLintSeverity;
  readonly code:
    | "NO_GATES"
    | "DUPLICATE_GATE_ID"
    | "BLANK_OUTCOME"
    | "PARTIAL_RUNNABLE_GATE"
    | "UNKNOWN_DEPENDENCY"
    | "SELF_DEPENDENCY"
    | "DEPENDENCY_CYCLE"
    | "ACTIVITY_OUTCOME"
    | "MANUAL_GATE";
  readonly message: string;
}

export interface MemoryGateLintResult {
  readonly status: "PASS" | "WARN" | "FAIL";
  readonly findings: readonly MemoryGateLintFinding[];
}

export class MemoryGateLinter {
  public lint(gates: readonly MemoryGateDefinition[]): MemoryGateLintResult {
    const findings: MemoryGateLintFinding[] = [];

    if (gates.length === 0) {
      return {
        status: "FAIL",
        findings: [{ severity: "ERROR", code: "NO_GATES", message: "at least one acceptance gate is required" }],
      };
    }

    const ids = new Map<string, number>();
    for (const gate of gates) {
      ids.set(gate.gateId, (ids.get(gate.gateId) ?? 0) + 1);
      if (!gate.outcome.trim()) {
        findings.push({
          gateId: gate.gateId,
          severity: "ERROR",
          code: "BLANK_OUTCOME",
          message: "observable outcome must be non-empty",
        });
      }

      const hasCheck = Boolean(gate.check?.trim());
      const hasExpect = Boolean(gate.expect?.trim());
      if (hasCheck !== hasExpect) {
        findings.push({
          gateId: gate.gateId,
          severity: "ERROR",
          code: "PARTIAL_RUNNABLE_GATE",
          message: "runnable gate definitions must provide both CHECK and EXPECT",
        });
      }

      if (!hasCheck && !hasExpect) {
        findings.push({
          gateId: gate.gateId,
          severity: "WARNING",
          code: "MANUAL_GATE",
          message: "gate has no executable oracle and therefore requires explicit manual/integration evidence",
        });
      }

      if (/^(verify|check|test|run|validate|review|investigate|work|fix|ensure)\b/i.test(gate.outcome.trim())) {
        findings.push({
          gateId: gate.gateId,
          severity: "WARNING",
          code: "ACTIVITY_OUTCOME",
          message: "outcome reads like an activity; prefer an observable state that can be disproven",
        });
      }

      for (const dependencyId of gate.dependsOn ?? []) {
        if (!ids.has(dependencyId) && dependencyId !== gate.gateId) {
          // The complete dependency check below runs after all gate ids are known.
        }
      }
    }

    for (const [gateId, count] of ids) {
      if (count > 1) {
        findings.push({
          gateId,
          severity: "ERROR",
          code: "DUPLICATE_GATE_ID",
          message: "gate id must be unique",
        });
      }
    }

    const gateIds = new Set(gates.map((gate) => gate.gateId));
    for (const gate of gates) {
      for (const dependencyId of gate.dependsOn ?? []) {
        if (!gateIds.has(dependencyId)) {
          findings.push({
            gateId: gate.gateId,
            severity: "ERROR",
            code: "UNKNOWN_DEPENDENCY",
            message: "dependency does not exist: " + dependencyId,
          });
        }
        if (dependencyId === gate.gateId) {
          findings.push({
            gateId: gate.gateId,
            severity: "ERROR",
            code: "SELF_DEPENDENCY",
            message: "gate cannot depend on itself",
          });
        }
      }
    }

    if (this.hasDependencyCycle(gates)) {
      findings.push({
        severity: "ERROR",
        code: "DEPENDENCY_CYCLE",
        message: "gate dependency graph contains a cycle",
      });
    }

    const hasError = findings.some((finding) => finding.severity === "ERROR");
    return {
      status: hasError ? "FAIL" : findings.length > 0 ? "WARN" : "PASS",
      findings,
    };
  }

  private hasDependencyCycle(gates: readonly MemoryGateDefinition[]): boolean {
    const graph = new Map(gates.map((gate) => [gate.gateId, [...(gate.dependsOn ?? [])]]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const dependency of graph.get(id) ?? []) {
        if (graph.has(dependency) && visit(dependency)) return true;
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };

    return [...graph.keys()].some(visit);
  }
}
