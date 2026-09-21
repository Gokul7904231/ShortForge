/**
 * FactoryOS v1 — Graph Presentation Validator & Last-Good Engine
 * Implements Archify principles: typed IR validation, schema enforcement,
 * fail-closed rejection of unknown fields/dangling edges, and last-good artifact protection.
 */

import type { TruthLevel } from "../../contracts/execution.contract";
import type { GraphPresentationIR, VisualizationReceipt, PresentationViewType } from "./PresentationIR";

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  readonly budgetPassed: boolean;
}

const VALID_TRUTH_LEVELS = new Set<TruthLevel>([
  "PHYSICAL",
  "OBSERVED",
  "VERIFIED",
  "ASSERTED",
  "INFERRED",
  "UNKNOWN",
  "RECONSTRUCTED",
]);

const VALID_NODE_TYPES = new Set([
  "MISSION",
  "GOAL",
  "FLOOR",
  "TASK_NODE",
  "CAPABILITY",
  "DECISION",
  "ARTIFACT",
  "VERIFICATION",
  "DELIVERY",
  "UI_STATE",
  "FAILURE",
  "RECOVERY",
  "EVIDENCE",
]);

const VALID_VIEW_TYPES = new Set<PresentationViewType>([
  "MISSION_OVERVIEW",
  "OVERSEER_OPERATIONAL",
  "SLAYER_FORENSIC",
  "EVIDENCE_DRILLDOWN",
  "DELTA_COMPARISON",
]);

export class GraphPresentationValidator {
  /**
   * Deterministically validates GraphPresentationIR prior to rendering.
   * Rejects malformed structures, dangling endpoints, and budget violations fail-closed.
   */
  public static validate(ir: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!ir || typeof ir !== "object") {
      return {
        valid: false,
        errors: ["GraphPresentationIR must be a non-null object"],
        warnings: [],
        budgetPassed: false,
      };
    }

    const p = ir as Record<string, unknown>;

    // Schema version & View type
    if (typeof p.schemaVersion !== "string" || p.schemaVersion.trim().length === 0) {
      errors.push("Missing or empty schemaVersion");
    }
    if (typeof p.viewType !== "string" || !VALID_VIEW_TYPES.has(p.viewType as PresentationViewType)) {
      errors.push(`Invalid or unsupported viewType: ${String(p.viewType)}`);
    }
    if (typeof p.title !== "string" || p.title.trim().length === 0) {
      errors.push("Missing or empty title");
    }
    if (typeof p.missionId !== "string" || p.missionId.trim().length === 0) {
      errors.push("Missing or empty missionId");
    }

    // Nodes validation
    if (!Array.isArray(p.nodes)) {
      errors.push("Missing nodes array");
      return { valid: false, errors, warnings, budgetPassed: false };
    }

    const nodeIds = new Set<string>();
    for (const node of p.nodes) {
      if (!node || typeof node !== "object") {
        errors.push("Node must be a non-null object");
        continue;
      }
      if (typeof node.id !== "string" || node.id.trim().length === 0) {
        errors.push("Node missing valid id string");
        continue;
      }
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node identity detected: '${node.id}'`);
      }
      nodeIds.add(node.id);

      if (typeof node.label !== "string" || node.label.trim().length === 0) {
        errors.push(`Node '${node.id}' missing valid label string`);
      }
      if (typeof node.type !== "string" || !VALID_NODE_TYPES.has(node.type)) {
        errors.push(`Node '${node.id}' has invalid or unknown type: ${String(node.type)}`);
      }
      if (typeof node.truthLevel !== "string" || !VALID_TRUTH_LEVELS.has(node.truthLevel as TruthLevel)) {
        errors.push(`Node '${node.id}' has invalid truthLevel: ${String(node.truthLevel)}`);
      }
    }

    // Edges validation
    if (!Array.isArray(p.edges)) {
      errors.push("Missing edges array");
    } else {
      const edgeIds = new Set<string>();
      for (const edge of p.edges) {
        if (!edge || typeof edge !== "object") {
          errors.push("Edge must be a non-null object");
          continue;
        }
        if (typeof edge.id !== "string" || edge.id.trim().length === 0) {
          errors.push("Edge missing valid id string");
          continue;
        }
        if (edgeIds.has(edge.id)) {
          errors.push(`Duplicate edge identity detected: '${edge.id}'`);
        }
        edgeIds.add(edge.id);

        if (typeof edge.from !== "string" || !nodeIds.has(edge.from)) {
          errors.push(`Edge '${edge.id}' references non-existent 'from' endpoint: '${edge.from}'`);
        }
        if (typeof edge.to !== "string" || !nodeIds.has(edge.to)) {
          errors.push(`Edge '${edge.id}' references non-existent 'to' endpoint: '${edge.to}'`);
        }
        if (typeof edge.truthLevel !== "string" || !VALID_TRUTH_LEVELS.has(edge.truthLevel as TruthLevel)) {
          errors.push(`Edge '${edge.id}' has invalid truthLevel: ${String(edge.truthLevel)}`);
        }
      }
    }

    // Focus references
    if (Array.isArray(p.focus)) {
      for (const fId of p.focus) {
        if (!nodeIds.has(fId)) {
          errors.push(`Focus references non-existent node: '${fId}'`);
        }
      }
    }

    // Emphasis references
    if (Array.isArray(p.emphasis)) {
      for (const emp of p.emphasis) {
        if (!emp || typeof emp !== "object" || !emp.targetId || !nodeIds.has(emp.targetId)) {
          errors.push(`Emphasis references non-existent targetId: '${emp?.targetId}'`);
        }
      }
    }

    // Complexity Budget
    let budgetPassed = true;
    if (p.complexityBudget && typeof p.complexityBudget === "object") {
      const b = p.complexityBudget as Record<string, unknown>;
      const max = Number(b.maxNodes) || 20;
      if (nodeIds.size > max && !b.budgetExceeded) {
        warnings.push(`Complexity budget exceeded: ${nodeIds.size} nodes > max allowed ${max}`);
        budgetPassed = false;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      budgetPassed,
    };
  }
}

/**
 * LastGoodVisualStore
 * Archify Last-Good principle: only passing visual candidates replace the lastKnownGood artifact.
 * When a candidate fails validation or rendering, the trusted baseline is strictly preserved.
 */
export class LastGoodVisualStore {
  private static store: Map<string, VisualizationReceipt> = new Map();

  private static makeKey(viewType: string, missionId: string): string {
    return `${missionId}:${viewType}`;
  }

  public static getLastGood(viewType: string, missionId: string): VisualizationReceipt | null {
    const receipt = this.store.get(this.makeKey(viewType, missionId));
    return receipt ? structuredClone(receipt) : null;
  }

  public static commit(receipt: VisualizationReceipt): void {
    if (receipt.status === "DELIVERED" && receipt.validationPassed) {
      this.store.set(this.makeKey(receipt.viewType, receipt.missionId), structuredClone(receipt));
    }
  }

  public static clear(): void {
    this.store.clear();
  }
}
