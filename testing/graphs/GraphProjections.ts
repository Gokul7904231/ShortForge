import type { MissionGraphIR, MissionGraphNode, MissionGraphEdge } from "./MissionGraph";
import type { EvidenceGraphIR } from "./EvidenceGraph";
import { GraphPresentationPlanner, type PresentationPlan } from "./GraphPresentationPlanner";
import type { SituationRecord, SituationGraphIR } from "../model/SituationRecord";
import type { TruthLevel } from "../contracts/execution.contract";


export interface OverseerBrowserSummary {
  readonly status: "PASS" | "FAIL" | "BLOCKED" | "DEGRADED" | "NOT_ATTEMPTED";
  readonly affectedPage?: string;
  readonly consoleErrorCount: number;
  readonly networkFailureCount: number;
}

export interface OverseerOperationalView {
  readonly missionId: string;
  readonly plan: PresentationPlan;
  readonly completedFloors: string[];
  readonly pendingFloors: string[];
  readonly failedFloors: string[];
  readonly currentPhase: string;
  readonly browserHealth?: OverseerBrowserSummary;
}

export interface SlayerForensicView {
  readonly missionId: string;
  readonly plan: PresentationPlan;
  readonly anomalyOrigin?: string;
  readonly affectedDescendants: string[];
  readonly causalEdges: string[];
  readonly primaryEvidencePath: string[];
  readonly browserEvidenceChain?: Array<{
    readonly evidenceId: string;
    readonly kind: string;
    readonly description: string;
  }>;
}

export class GraphProjections {
  public static createOverseerView(graph: MissionGraphIR, evidenceGraph?: EvidenceGraphIR): OverseerOperationalView {
    const plan = GraphPresentationPlanner.plan(graph, "OVERVIEW");
    const floorNodes = graph.nodes.filter((n) => n.type === "FLOOR");

    const completedFloors = floorNodes.filter((n) => n.status === "OBSERVED" || n.status === "VERIFIED").map((n) => n.label);
    const pendingFloors = floorNodes.filter((n) => n.status === "PLANNED").map((n) => n.label);
    const failedFloors = floorNodes.filter((n) => n.status === "FAILED").map((n) => n.label);

    let browserHealth: OverseerBrowserSummary | undefined = undefined;
    const uiNode = graph.nodes.find((n) => n.type === "UI_STATE");

    if (uiNode) {
      let consoleErrorCount = 0;
      let networkFailureCount = 0;

      if (evidenceGraph) {
        for (const ev of evidenceGraph.evidenceNodes) {
          if (ev.category === "BROWSER_CONSOLE_RECORD" && (ev.verifiedValue as any)?.level === "error") {
            consoleErrorCount++;
          }
          if (ev.category === "BROWSER_NETWORK_RECORD" && (ev.verifiedValue as any)?.isFailure) {
            networkFailureCount++;
          }
        }
      }

      const status =
        uiNode.status === "FAILED"
          ? "FAIL"
          : consoleErrorCount > 0 || networkFailureCount > 0
          ? "DEGRADED"
          : uiNode.status === "VERIFIED"
          ? "PASS"
          : "NOT_ATTEMPTED";

      browserHealth = {
        status,
        affectedPage: (uiNode.metadata?.targetUrl as string) || uiNode.label,
        consoleErrorCount,
        networkFailureCount,
      };
    }

    return {
      missionId: graph.missionId,
      plan,
      completedFloors,
      pendingFloors,
      failedFloors,
      currentPhase: failedFloors.length > 0 ? "FAILURE_TRIAGE" : pendingFloors.length === 0 ? "TERMINAL" : "EXECUTING",
      browserHealth,
    };
  }

  public static createSlayerView(
    graph: MissionGraphIR,
    failedNodeId?: string,
    evidenceGraph?: EvidenceGraphIR
  ): SlayerForensicView {
    const focalIds = failedNodeId ? [failedNodeId] : graph.nodes.filter((n) => n.status === "FAILED").map((n) => n.id);
    const plan = GraphPresentationPlanner.plan(graph, "FORENSIC", focalIds);

    const affectedDescendants: string[] = [];
    const causalEdges: string[] = [];

    for (const edge of plan.visibleEdges) {
      if (focalIds.includes(edge.from)) {
        affectedDescendants.push(edge.to);
        causalEdges.push(edge.id);
      }
    }

    const primaryEvidencePath = plan.visibleNodes
      .filter((n) => n.type === "ARTIFACT" || n.type === "VERIFICATION" || n.type === "UI_STATE")
      .map((n) => n.id);

    let browserEvidenceChain: Array<{ evidenceId: string; kind: string; description: string }> | undefined = undefined;

    if (evidenceGraph) {
      const browserEvs = evidenceGraph.evidenceNodes.filter(
        (ev) =>
          ev.category === "BROWSER_CONSOLE_RECORD" ||
          ev.category === "BROWSER_NETWORK_RECORD" ||
          ev.category === "BROWSER_DOM_STATE" ||
          ev.category === "BROWSER_SCREENSHOT" ||
          ev.category === "BROWSER_PERFORMANCE_METRIC"
      );

      if (browserEvs.length > 0) {
        browserEvidenceChain = browserEvs.map((ev) => ({
          evidenceId: ev.id,
          kind: ev.category,
          description: ev.description,
        }));
        primaryEvidencePath.push(...browserEvs.map((ev) => ev.id));
      }
    }

    return {
      missionId: graph.missionId,
      plan,
      anomalyOrigin: focalIds[0],
      affectedDescendants,
      causalEdges,
      primaryEvidencePath,
      browserEvidenceChain,
    };
  }

  public static createOverseerSituationView(record: SituationRecord): OverseerSituationView {
    const currentBlockers: string[] = [];
    const recoveredFloors: string[] = [];
    let browserStatus: "PASS" | "FAIL" | "BLOCKED" | "DEGRADED" | "NOT_ATTEMPTED" = "NOT_ATTEMPTED";
    let browserDetails = "No browser interactions recorded.";

    for (const node of record.graph.nodes) {
      if (node.status === "FAILED" || node.status === "BLOCKED" || node.type === "FAILURE") {
        currentBlockers.push(node.label || node.id);
      }
      if (node.status === "RECOVERED" || node.type === "RECOVERY") {
        recoveredFloors.push(node.label || node.id);
      }
      if (node.type === "UI_STATE") {
        if (node.status === "FAILED") {
          browserStatus = "FAIL";
          browserDetails = `Browser UI failure detected on node '${node.label}'`;
        } else if (node.status === "BLOCKED") {
          browserStatus = "BLOCKED";
          browserDetails = `Browser UI blocked on node '${node.label}'`;
        } else if (browserStatus === "NOT_ATTEMPTED") {
          browserStatus = "PASS";
          browserDetails = `Browser UI node '${node.label}' operational`;
        }
      }
    }

    // Check evidence for browser errors
    for (const ev of record.evidence) {
      if (ev.type === "BROWSER_OBSERVATION") {
        if (ev.description.toLowerCase().includes("error") || ev.description.includes("500")) {
          browserStatus = "DEGRADED";
          browserDetails = ev.description;
        }
      }
    }

    return {
      situationId: record.id,
      missionId: record.missionId,
      summaryText: record.text,
      priority: record.priority,
      currentBlockers,
      recoveredFloors,
      browserHealth: {
        status: browserStatus,
        details: browserDetails,
      },
      focusedNodes: [...record.graph.focus],
      keyEvidenceRefs: record.evidence.map((e) => e.evidenceId),
    };
  }

  public static createSlayerSituationView(record: SituationRecord): SlayerSituationView {
    const failureNodes: string[] = [];
    const affectedNodes: string[] = [];
    const causalChain: Array<{ from: string; to: string; type: string; label?: string }> = [];
    const browserEvidenceChain: Array<{ evidenceId: string; kind: string; description: string }> = [];

    for (const node of record.graph.nodes) {
      if (node.type === "FAILURE" || node.status === "FAILED") {
        failureNodes.push(node.id);
      }
    }

    for (const edge of record.graph.edges) {
      if (failureNodes.includes(edge.from) || edge.type === "UI_ACTION" || edge.type === "ESCALATION" || edge.type === "RECOVERY") {
        causalChain.push({
          from: edge.from,
          to: edge.to,
          type: edge.type,
          label: edge.label,
        });
        if (!affectedNodes.includes(edge.to)) {
          affectedNodes.push(edge.to);
        }
      }
    }

    for (const emp of record.graph.emphasis) {
      if (!affectedNodes.includes(emp.targetId)) {
        affectedNodes.push(emp.targetId);
      }
    }

    for (const ev of record.evidence) {
      if (ev.type === "BROWSER_OBSERVATION") {
        browserEvidenceChain.push({
          evidenceId: ev.evidenceId,
          kind: ev.type,
          description: ev.description,
        });
      }
    }

    return {
      situationId: record.id,
      missionId: record.missionId,
      causalChain,
      failureNodes,
      affectedNodes,
      primaryEvidencePath: record.evidence.map((e) => e.evidenceId),
      browserEvidenceChain: browserEvidenceChain.length > 0 ? browserEvidenceChain : undefined,
    };
  }

  public static mergeSituationGraphIntoMissionGraph(
    missionGraph: MissionGraphIR,
    situationGraph: SituationGraphIR
  ): GraphMergeResult {
    const nodes: MissionGraphNode[] = [...missionGraph.nodes];
    const edges: MissionGraphEdge[] = [...missionGraph.edges];
    const nodeMap = new Map<string, MissionGraphNode>(nodes.map((n) => [n.id, n]));
    const edgeMap = new Map<string, MissionGraphEdge>(edges.map((e) => [e.id, e]));

    let nodesAdded = 0;
    let nodesUpdated = 0;
    let edgesAdded = 0;
    const conflictsDetected: Array<{
      nodeId: string;
      existingStatus: string;
      incomingStatus: string;
      resolution: string;
    }> = [];

    const truthRanks: Record<string, number> = {
      UNKNOWN: 0,
      INFERRED: 1,
      ASSERTED: 2,
      OBSERVED: 3,
      VERIFIED: 4,
      PHYSICAL: 5,
    };

    for (const sNode of situationGraph.nodes) {
      const existing = nodeMap.get(sNode.id);
      if (!existing) {
        // Map node type safely
        const validNodeType = sNode.type as any;
        const newNode: MissionGraphNode = {
          id: sNode.id,
          type: validNodeType,
          label: sNode.label,
          truthLevel: "OBSERVED",
          status: sNode.status === "COMPLETED" ? "VERIFIED" : sNode.status === "FAILED" ? "FAILED" : "OBSERVED",
          timestamp: new Date().toISOString(),
          metadata: sNode.metadata,
        };
        nodes.push(newNode);
        nodeMap.set(sNode.id, newNode);
        nodesAdded++;
      } else {
        // Controlled merge
        const incomingStatus = sNode.status || "OBSERVED";
        if (existing.status !== incomingStatus && existing.status !== "PLANNED") {
          // Detect conflicting claims
          conflictsDetected.push({
            nodeId: sNode.id,
            existingStatus: existing.status,
            incomingStatus,
            resolution: "Preserved existing authoritative status without destructive overwrite",
          });
        } else if (existing.status === "PLANNED" && sNode.status) {
          const updated: MissionGraphNode = {
            ...existing,
            status: sNode.status === "COMPLETED" ? "VERIFIED" : sNode.status === "FAILED" ? "FAILED" : "OBSERVED",
            metadata: { ...existing.metadata, ...sNode.metadata },
          };
          const idx = nodes.findIndex((n) => n.id === sNode.id);
          if (idx !== -1) nodes[idx] = updated;
          nodeMap.set(sNode.id, updated);
          nodesUpdated++;
        }
      }
    }

    for (const sEdge of situationGraph.edges) {
      if (!edgeMap.has(sEdge.id)) {
        const newEdge: MissionGraphEdge = {
          id: sEdge.id,
          from: sEdge.from,
          to: sEdge.to,
          type: sEdge.type as any,
          truthLevel: "OBSERVED",
          status: "OBSERVED",
          label: sEdge.label,
        };
        edges.push(newEdge);
        edgeMap.set(sEdge.id, newEdge);
        edgesAdded++;
      }
    }

    return {
      mergedGraph: {
        ...missionGraph,
        nodes,
        edges,
      },
      nodesAdded,
      nodesUpdated,
      edgesAdded,
      conflictsDetected,
    };
  }
}

export interface OverseerSituationView {
  readonly situationId: string;
  readonly missionId: string;
  readonly summaryText: string;
  readonly priority: string;
  readonly currentBlockers: string[];
  readonly recoveredFloors: string[];
  readonly browserHealth?: {
    readonly status: "PASS" | "FAIL" | "BLOCKED" | "DEGRADED" | "NOT_ATTEMPTED";
    readonly details: string;
  };
  readonly focusedNodes: string[];
  readonly keyEvidenceRefs: string[];
}

export interface SlayerSituationView {
  readonly situationId: string;
  readonly missionId: string;
  readonly causalChain: Array<{
    readonly from: string;
    readonly to: string;
    readonly type: string;
    readonly label?: string;
  }>;
  readonly failureNodes: string[];
  readonly affectedNodes: string[];
  readonly primaryEvidencePath: string[];
  readonly browserEvidenceChain?: Array<{
    readonly evidenceId: string;
    readonly kind: string;
    readonly description: string;
  }>;
}

export interface GraphMergeResult {
  readonly mergedGraph: MissionGraphIR;
  readonly nodesAdded: number;
  readonly nodesUpdated: number;
  readonly edgesAdded: number;
  readonly conflictsDetected: Array<{
    readonly nodeId: string;
    readonly existingStatus: string;
    readonly incomingStatus: string;
    readonly resolution: string;
  }>;
}

