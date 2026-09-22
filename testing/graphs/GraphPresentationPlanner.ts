import type { MissionGraphIR, MissionGraphNode, MissionGraphEdge } from "./MissionGraph";

export type PresentationDetailLevel = "OVERVIEW" | "FOCUSED_DETAIL" | "FORENSIC" | "DEPENDENCY";

export interface PresentationPlan {
  readonly detailLevel: PresentationDetailLevel;
  readonly focalNodeIds: string[];
  readonly visibleNodes: MissionGraphNode[];
  readonly visibleEdges: MissionGraphEdge[];
  readonly emphasisMap: Record<string, "CRITICAL" | "PRIMARY" | "MUTED">;
}

export class GraphPresentationPlanner {
  public static plan(
    graph: MissionGraphIR,
    detailLevel: PresentationDetailLevel = "OVERVIEW",
    focalNodeIds: string[] = []
  ): PresentationPlan {
    const focalSet = new Set<string>(focalNodeIds);
    let visibleNodes: MissionGraphNode[] = [];
    const emphasisMap: Record<string, "CRITICAL" | "PRIMARY" | "MUTED"> = {};

    switch (detailLevel) {
      case "OVERVIEW":
        // Show Mission, Floors, Verification, Delivery. Filter out fine-grained decisions.
        visibleNodes = graph.nodes.filter(
          (n) => n.type === "MISSION" || n.type === "FLOOR" || n.type === "DELIVERY" || n.type === "VERIFICATION"
        );
        break;

      case "FOCUSED_DETAIL":
        // Show focal nodes plus their direct 1-hop predecessors and successors
        if (focalSet.size === 0) {
          visibleNodes = [...graph.nodes];
        } else {
          const neighborIds = new Set<string>(focalSet);
          for (const edge of graph.edges) {
            if (focalSet.has(edge.from)) neighborIds.add(edge.to);
            if (focalSet.has(edge.to)) neighborIds.add(edge.from);
          }
          visibleNodes = graph.nodes.filter((n) => neighborIds.has(n.id));
        }
        break;

      case "FORENSIC":
        // Prioritize failures, degraded nodes, decisions, artifacts, and verification
        visibleNodes = graph.nodes.filter(
          (n) => n.status === "FAILED" || n.type === "VERIFICATION" || n.type === "DECISION" || n.type === "ARTIFACT" || n.type === "FLOOR"
        );
        break;

      case "DEPENDENCY":
        // Pure dependency topology: Floors and Artifacts
        visibleNodes = graph.nodes.filter((n) => n.type === "FLOOR" || n.type === "ARTIFACT");
        break;
    }

    const visibleNodeIds = new Set<string>(visibleNodes.map((n) => n.id));

    // Retain only edges where both endpoints are visible
    const visibleEdges = graph.edges.filter(
      (e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to)
    );

    // Compute emphasis
    for (const node of visibleNodes) {
      if (node.status === "FAILED") {
        emphasisMap[node.id] = "CRITICAL";
      } else if (focalSet.has(node.id) || node.type === "VERIFICATION" || node.type === "DELIVERY") {
        emphasisMap[node.id] = "PRIMARY";
      } else {
        emphasisMap[node.id] = "MUTED";
      }
    }

    return {
      detailLevel,
      focalNodeIds,
      visibleNodes,
      visibleEdges,
      emphasisMap,
    };
  }
}
