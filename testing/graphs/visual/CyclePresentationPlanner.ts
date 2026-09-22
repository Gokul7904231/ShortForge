/**
 * FactoryOS v1 / Frontier v3 — Cycle Presentation Planner (Correctness Hardened)
 * Detects strongly connected components (SCCs) and cycles within MissionGraphs.
 * Preserves retry loops, iteration edges, and recovery paths as explicit CYCLIC SUBGRAPHS
 * without destroying topology or falsely claiming root cause.
 *
 * Correctness Invariants:
 * - Recovery edges are identified strictly by canonical edge/node type or explicit metadata,
 *   never through fragile string matching (e.g. id.includes('recovery')).
 * - Evidence references for cycles are populated from actual EvidenceGraph relationships.
 * - Cycle presence or entry point is never used as proof of root cause.
 */

import type { MissionGraphIR, MissionGraphNode, MissionGraphEdge } from "../MissionGraph";
import type { EvidenceGraphIR } from "../EvidenceGraph";
import type { GraphPresentationIR, PresentationNode, PresentationGroup } from "./PresentationIR";

export interface DetectedCycle {
  readonly cycleId: string;
  readonly entryNodeId: string;
  readonly memberNodeIds: string[];
  readonly cycleEdgeIds: string[];
  readonly recoveryEdgeIds: string[];
  readonly iterationCount?: number;
  readonly evidenceRefs: string[];
}

export class CyclePresentationPlanner {
  /**
   * Detects strongly connected components with 2 or more nodes using Tarjan's algorithm.
   */
  public static detectCycles(missionGraph: MissionGraphIR, evidenceGraph?: EvidenceGraphIR): DetectedCycle[] {
    const nodes = missionGraph.nodes;
    const edges = missionGraph.edges;

    const adj = new Map<string, string[]>();
    const nodeMap = new Map<string, MissionGraphNode>();

    for (const node of nodes) {
      adj.set(node.id, []);
      nodeMap.set(node.id, node);
    }
    for (const edge of edges) {
      if (adj.has(edge.from)) {
        adj.get(edge.from)!.push(edge.to);
      }
    }

    let index = 0;
    const indices = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];

    function strongConnect(v: string) {
      indices.set(v, index);
      lowlink.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);

      for (const w of adj.get(v) || []) {
        if (!indices.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      }

      if (lowlink.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);

        if (scc.length > 1) {
          sccs.push(scc.reverse());
        }
      }
    }

    for (const node of nodes) {
      if (!indices.has(node.id)) {
        strongConnect(node.id);
      }
    }

    // Convert SCCs to DetectedCycle structures
    const detected: DetectedCycle[] = [];
    let cycleCounter = 1;

    for (const scc of sccs) {
      const memberSet = new Set(scc);
      const cycleEdgeIds: string[] = [];
      const recoveryEdgeIds: string[] = [];
      const evidenceRefs: string[] = [];

      // Find entry node (node with incoming edge from outside the SCC)
      let entryNodeId = scc[0];
      for (const edge of edges) {
        if (memberSet.has(edge.to) && !memberSet.has(edge.from)) {
          entryNodeId = edge.to;
          break;
        }
      }

      // Collect internal edges and identify recovery relationships by canonical type/metadata
      for (const edge of edges) {
        if (memberSet.has(edge.from) && memberSet.has(edge.to)) {
          cycleEdgeIds.push(edge.id);

          const fromNode = nodeMap.get(edge.from);
          const toNode = nodeMap.get(edge.to);

          const isExplicitRecoveryEdge =
            edge.type === "RECOVERY" ||
            (edge as any).metadata?.isRecovery === true ||
            (edge as any).metadata?.recoveryEngine !== undefined ||
            fromNode?.type === "RECOVERY" ||
            toNode?.type === "RECOVERY";

          if (isExplicitRecoveryEdge) {
            recoveryEdgeIds.push(edge.id);
          }
        }
      }

      // Gather iteration metadata
      let maxIterations: number | undefined;
      for (const memberId of scc) {
        const node = nodeMap.get(memberId);
        if (node?.metadata?.retryCount && typeof node.metadata.retryCount === "number") {
          maxIterations = Math.max(maxIterations ?? 0, node.metadata.retryCount);
        }
      }

      // Populate evidence references strictly from authoritative EvidenceGraph
      if (evidenceGraph) {
        for (const evEdge of evidenceGraph.evidenceEdges) {
          if (memberSet.has(evEdge.targetGraphNodeId)) {
            if (!evidenceRefs.includes(evEdge.evidenceNodeId)) {
              evidenceRefs.push(evEdge.evidenceNodeId);
            }
          }
        }
      }

      detected.push({
        cycleId: `cycle_${cycleCounter++}`,
        entryNodeId,
        memberNodeIds: scc,
        cycleEdgeIds,
        recoveryEdgeIds,
        iterationCount: maxIterations,
        evidenceRefs,
      });
    }

    return detected;
  }

  /**
   * Augments GraphPresentationIR to explicitly visualize cycles as CYCLIC SUBGRAPHs.
   */
  public static augmentPresentationWithCycles(
    ir: GraphPresentationIR,
    cycles: DetectedCycle[]
  ): GraphPresentationIR {
    if (cycles.length === 0) {
      return ir;
    }

    const newGroups: PresentationGroup[] = [...ir.groups];
    const newAnnotations = [...ir.annotations];
    const newNodes: PresentationNode[] = ir.nodes.map((n) => {
      const matchingCycle = cycles.find((c) => c.memberNodeIds.includes(n.id));
      if (!matchingCycle) return n;

      return {
        ...n,
        group: matchingCycle.cycleId,
        visualHints: {
          ...n.visualHints,
          badge: n.id === matchingCycle.entryNodeId ? "LOOP ENTRY" : "↺ RETRY",
        },
      };
    });

    for (const cycle of cycles) {
      newGroups.push({
        id: cycle.cycleId,
        label: `CYCLIC SUBGRAPH (${cycle.memberNodeIds.length} steps${cycle.iterationCount ? `, retry #${cycle.iterationCount}` : ""})`,
        collapsed: false,
        nodeIds: cycle.memberNodeIds,
      });

      newAnnotations.push({
        targetId: cycle.entryNodeId,
        text: `Cycle detected: members [${cycle.memberNodeIds.join(" → ")}]`,
        type: "WARNING",
      });
    }

    return {
      ...ir,
      nodes: newNodes,
      groups: newGroups,
      annotations: newAnnotations,
    };
  }
}
