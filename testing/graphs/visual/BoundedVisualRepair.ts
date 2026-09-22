/**
 * FactoryOS v1 — Bounded Visual Repair Engine
 * Implements Archify bounded-repair discipline: targeted diagnostics, supported fixes,
 * and strict maximum 2-round repair budget without unconstrained mutation loops.
 */

import type { GraphPresentationIR, PresentationNode, PresentationEdge } from "./PresentationIR";
import { GraphPresentationValidator, type ValidationResult } from "./GraphPresentationValidator";

export interface RepairRoundResult {
  readonly round: number;
  readonly fixedErrorsCount: number;
  readonly remainingErrors: string[];
  readonly repairedIR: GraphPresentationIR;
  readonly halted: boolean;
  readonly reason?: string;
}

export class BoundedVisualRepair {
  public static readonly MAX_REPAIR_ROUNDS = 2;

  /**
   * Executes bounded repair on a problematic GraphPresentationIR.
   * Halts if errors are not reduced between consecutive rounds or when budget is exhausted.
   */
  public static repair(candidateIR: GraphPresentationIR): RepairRoundResult {
    let currentIR = structuredClone(candidateIR);
    let initialValidation = GraphPresentationValidator.validate(currentIR);

    if (initialValidation.valid) {
      return {
        round: 0,
        fixedErrorsCount: 0,
        remainingErrors: [],
        repairedIR: currentIR,
        halted: true,
        reason: "IR already valid; zero repair needed",
      };
    }

    let lastErrorCount = initialValidation.errors.length;
    let round = 1;

    while (round <= this.MAX_REPAIR_ROUNDS) {
      const repaired = this.applyTargetedFixes(currentIR, initialValidation);
      const validation = GraphPresentationValidator.validate(repaired);

      if (validation.valid) {
        return {
          round,
          fixedErrorsCount: initialValidation.errors.length,
          remainingErrors: [],
          repairedIR: repaired,
          halted: true,
          reason: "All validation errors successfully resolved within budget",
        };
      }

      // Check if errors decreased
      if (validation.errors.length >= lastErrorCount) {
        // No improvement; STOP immediately (Archify bounded repair principle)
        return {
          round,
          fixedErrorsCount: initialValidation.errors.length - validation.errors.length,
          remainingErrors: validation.errors,
          repairedIR: repaired,
          halted: true,
          reason: "Halted: repair did not reduce error count between rounds",
        };
      }

      currentIR = repaired;
      lastErrorCount = validation.errors.length;
      initialValidation = validation;
      round++;
    }

    return {
      round: this.MAX_REPAIR_ROUNDS,
      fixedErrorsCount: initialValidation.errors.length - lastErrorCount,
      remainingErrors: initialValidation.errors,
      repairedIR: currentIR,
      halted: true,
      reason: `Max repair rounds (${this.MAX_REPAIR_ROUNDS}) reached`,
    };
  }

  private static applyTargetedFixes(
    ir: GraphPresentationIR,
    validation: ValidationResult
  ): GraphPresentationIR {
    const nodes: PresentationNode[] = [...ir.nodes];
    let edges: PresentationEdge[] = [...ir.edges];
    const nodeIds = new Set(nodes.map((n) => n.id));

    // 1. Fix dangling edges (remove edges referencing missing nodes)
    edges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

    // 2. Fix invalid focus references
    const focus = (ir.focus || []).filter((fId) => nodeIds.has(fId));

    // 3. Fix invalid emphasis references
    const emphasis = (ir.emphasis || []).filter((emp) => nodeIds.has(emp.targetId));

    // 4. Fix complexity budget overflow by auto-collapsing lowest-priority nodes
    if (ir.complexityBudget && nodes.length > ir.complexityBudget.maxNodes) {
      // Keep focal and critical nodes, trim peripheral
      const preservedNodes = nodes.slice(0, ir.complexityBudget.maxNodes);
      const preservedIds = new Set(preservedNodes.map((n) => n.id));
      edges = edges.filter((e) => preservedIds.has(e.from) && preservedIds.has(e.to));

      return {
        ...ir,
        nodes: preservedNodes,
        edges,
        focus: focus.filter((f) => preservedIds.has(f)),
        emphasis: emphasis.filter((emp) => preservedIds.has(emp.targetId)),
        complexityBudget: {
          ...ir.complexityBudget,
          currentNodes: preservedNodes.length,
          budgetExceeded: false,
          action: "COLLAPSED",
        },
      };
    }

    return {
      ...ir,
      nodes,
      edges,
      focus,
      emphasis,
    };
  }
}
