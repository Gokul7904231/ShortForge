import type { MissionGraphIR, MissionGraphNode, MissionGraphEdge } from "./MissionGraph";

export interface GraphDelta {
  readonly baselineRunId: string;
  readonly candidateRunId: string;
  readonly addedNodes: MissionGraphNode[];
  readonly removedNodes: MissionGraphNode[];
  readonly modifiedNodes: Array<{
    readonly id: string;
    readonly before: Partial<MissionGraphNode>;
    readonly after: Partial<MissionGraphNode>;
  }>;
  readonly addedEdges: MissionGraphEdge[];
  readonly removedEdges: MissionGraphEdge[];
  readonly hasDivergence: boolean;
}

export class GraphDiff {
  public static compare(baseline: MissionGraphIR, candidate: MissionGraphIR): GraphDelta {
    const baseNodeMap = new Map<string, MissionGraphNode>(baseline.nodes.map((n) => [n.id, n]));
    const candNodeMap = new Map<string, MissionGraphNode>(candidate.nodes.map((n) => [n.id, n]));

    const addedNodes: MissionGraphNode[] = [];
    const removedNodes: MissionGraphNode[] = [];
    const modifiedNodes: Array<{ id: string; before: Partial<MissionGraphNode>; after: Partial<MissionGraphNode> }> = [];

    for (const [id, node] of candNodeMap.entries()) {
      if (!baseNodeMap.has(id)) {
        addedNodes.push(node);
      } else {
        const baseNode = baseNodeMap.get(id)!;
        if (baseNode.status !== node.status || baseNode.truthLevel !== node.truthLevel) {
          modifiedNodes.push({
            id,
            before: { status: baseNode.status, truthLevel: baseNode.truthLevel },
            after: { status: node.status, truthLevel: node.truthLevel },
          });
        }
      }
    }

    for (const [id, node] of baseNodeMap.entries()) {
      if (!candNodeMap.has(id)) {
        removedNodes.push(node);
      }
    }

    const baseEdgeMap = new Map<string, MissionGraphEdge>(baseline.edges.map((e) => [e.id, e]));
    const candEdgeMap = new Map<string, MissionGraphEdge>(candidate.edges.map((e) => [e.id, e]));

    const addedEdges: MissionGraphEdge[] = [];
    const removedEdges: MissionGraphEdge[] = [];

    for (const [id, edge] of candEdgeMap.entries()) {
      if (!baseEdgeMap.has(id)) {
        addedEdges.push(edge);
      }
    }

    for (const [id, edge] of baseEdgeMap.entries()) {
      if (!candEdgeMap.has(id)) {
        removedEdges.push(edge);
      }
    }

    const hasDivergence =
      addedNodes.length > 0 ||
      removedNodes.length > 0 ||
      modifiedNodes.length > 0 ||
      addedEdges.length > 0 ||
      removedEdges.length > 0;

    return {
      baselineRunId: baseline.runId,
      candidateRunId: candidate.runId,
      addedNodes,
      removedNodes,
      modifiedNodes,
      addedEdges,
      removedEdges,
      hasDivergence,
    };
  }
}
