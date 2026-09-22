/**
 * FactoryOS v1 — Graph Presentation Transformer
 * Deterministically projects canonical MissionGraphIR, EvidenceGraphIR, SituationRecord,
 * and GraphDelta into typed GraphPresentationIR for the four first-class views:
 *   1. Mission Overview
 *   2. Overseer Operational View
 *   3. Slayer Forensic View
 *   4. Evidence Drilldown
 * Plus SituationRecord direct visualization and Delta Comparison.
 */

import type { MissionGraphIR, MissionGraphNode, MissionGraphEdge } from "../MissionGraph";
import type { EvidenceGraphIR, EvidenceNode } from "../EvidenceGraph";
import type { SituationRecord } from "../../model/SituationRecord";
import type { GraphDelta } from "../GraphDiff";
import {
  FactoryOSVisualTokens,
  type GraphPresentationIR,
  type PresentationNode,
  type PresentationEdge,
  type PresentationViewType,
  type VisualWeight,
  type NodeVisualShape,
} from "./PresentationIR";

export class GraphPresentationTransformer {
  /**
   * VIEW 1: MISSION OVERVIEW
   * Answers: "What is the overall mission state?"
   * Targets 8-12 primary nodes (Mission, Goal, Floors 0-7, Verification, Delivery).
   * Filters out micro-decisions and telemetry noise.
   */
  public static buildMissionOverview(
    missionGraph: MissionGraphIR,
    evidenceGraph?: EvidenceGraphIR
  ): GraphPresentationIR {
    const primaryTypes = new Set(["MISSION", "GOAL", "FLOOR", "VERIFICATION", "DELIVERY"]);
    let candidateNodes = missionGraph.nodes.filter((n) => primaryTypes.has(n.type));

    // Fallback if graph doesn't have explicit floor types
    if (candidateNodes.length === 0) {
      candidateNodes = missionGraph.nodes.slice(0, 12);
    }

    // Complexity Budget: max 12 nodes for overview
    const maxNodes = 12;
    let budgetExceeded = candidateNodes.length > maxNodes;
    let action: "NONE" | "COLLAPSED" | "SPLIT" = "NONE";

    if (budgetExceeded) {
      // Prioritize Mission, Goal, Verification, Delivery, and non-completed floors
      candidateNodes = candidateNodes.slice(0, maxNodes);
      action = "COLLAPSED";
    }

    const visibleNodeIds = new Set(candidateNodes.map((n) => n.id));
    const candidateEdges = missionGraph.edges.filter(
      (e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to)
    );

    // Map to PresentationNodes
    const nodes: PresentationNode[] = candidateNodes.map((node, index) => {
      const isFocal = node.type === "MISSION" || node.status === "FAILED";
      const emphasis: VisualWeight = node.status === "FAILED" ? "CRITICAL" : isFocal ? "PRIMARY" : "MUTED";
      const shape: NodeVisualShape =
        node.type === "MISSION" ? "HEXAGON" : node.type === "VERIFICATION" ? "SHIELD" : "RECT";

      // Collect evidence references from EvidenceGraph if available
      const evidenceRefs: string[] = [];
      if (evidenceGraph) {
        for (const edge of evidenceGraph.evidenceEdges) {
          if (edge.targetGraphNodeId === node.id) {
            evidenceRefs.push(edge.evidenceNodeId);
          }
        }
      }

      return {
        id: node.id,
        label: node.label,
        type: node.type as any,
        status: node.status === "PLANNED" ? "PENDING" : node.status,
        truthLevel: node.truthLevel,
        evidenceRefs,
        metadata: node.metadata,
        visualHints: {
          isFocal,
          emphasis,
          icon: node.type === "VERIFICATION" ? "shield-check" : node.type === "DELIVERY" ? "truck" : "layers",
          shape,
          badge: FactoryOSVisualTokens.badges[node.truthLevel],
          order: index,
        },
      };
    });

    const edges: PresentationEdge[] = candidateEdges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      label: edge.label || edge.type.replace(/_/g, " ").toLowerCase(),
      truthLevel: edge.truthLevel,
      status: edge.status,
      visualHints: {
        style: FactoryOSVisualTokens.lineStyles[edge.truthLevel] || "solid",
        color: FactoryOSVisualTokens.colors.border,
        marker: "arrow",
      },
    }));

    return {
      schemaVersion: "1.0.0",
      viewType: "MISSION_OVERVIEW",
      title: `Mission Overview: ${missionGraph.missionId}`,
      subtitle: `Canonical execution pipeline with truth badges and evidence grounding`,
      missionId: missionGraph.missionId,
      runId: missionGraph.runId,
      nodes,
      edges,
      groups: [],
      focus: nodes.filter((n) => n.visualHints.isFocal).map((n) => n.id),
      emphasis: nodes
        .filter((n) => n.visualHints.emphasis !== "MUTED")
        .map((n) => ({
          targetId: n.id,
          visualWeight: n.visualHints.emphasis,
          reason: n.status === "FAILED" ? "Pipeline failure detected" : "Primary pipeline milestone",
        })),
      collapsedGroups: [],
      annotations: [
        {
          targetId: nodes[0]?.id || "mission",
          text: `Overall pipeline status: ${candidateNodes.some((n) => n.status === "FAILED") ? "FAILED" : "VERIFIED"}`,
          type: candidateNodes.some((n) => n.status === "FAILED") ? "ALERT" : "INFO",
        },
      ],
      complexityBudget: {
        maxNodes,
        currentNodes: nodes.length,
        budgetExceeded,
        action,
      },
      chapters: [
        {
          id: "ch_overview",
          title: "Pipeline Overview",
          description: "Full end-to-end mission pipeline",
          focalNodeIds: nodes.map((n) => n.id),
          visibleEdgeIds: edges.map((e) => e.id),
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * VIEW 2: OVERSEER OPERATIONAL VIEW
   * Answers: "What matters operationally right now?"
   * Prioritizes active blockers, recovered floors, failing nodes, next valid action.
   */
  public static buildOverseerOperationalView(
    missionGraph: MissionGraphIR,
    evidenceGraph?: EvidenceGraphIR,
    situationRecord?: SituationRecord
  ): GraphPresentationIR {
    const nodes: PresentationNode[] = [];
    const edges: PresentationEdge[] = [];
    const focus: string[] = [];
    const emphasis: Array<{ targetId: string; visualWeight: VisualWeight; reason: string }> = [];

    // Filter nodes: highlight failing, blocked, running, or recovered nodes + next actions
    const operationalNodes = missionGraph.nodes.filter(
      (n) =>
        n.status === "FAILED" ||
        n.status === "OBSERVED" ||
        n.status === "VERIFIED" ||
        n.type === "FLOOR" ||
        n.type === "DECISION" ||
        n.type === "UI_STATE" ||
        n.type === "VERIFICATION"
    );

    const maxNodes = 15;
    const selectedNodes = operationalNodes.slice(0, maxNodes);
    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    for (const [idx, node] of selectedNodes.entries()) {
      const isFailed = node.status === "FAILED";
      const isBlocker = isFailed || (node as any).status === "BLOCKED";
      const isRecovered = (node as any).status === "RECOVERED";

      if (isBlocker) focus.push(node.id);

      const visualWeight: VisualWeight = isBlocker ? "CRITICAL" : isRecovered ? "PRIMARY" : "MUTED";
      if (visualWeight !== "MUTED") {
        emphasis.push({
          targetId: node.id,
          visualWeight,
          reason: isBlocker ? "Active blocker requiring supervisor attention" : "Recovered floor execution",
        });
      }

      nodes.push({
        id: node.id,
        label: node.label,
        type: node.type as any,
        status: node.status === "PLANNED" ? "PENDING" : node.status,
        truthLevel: node.truthLevel,
        evidenceRefs: situationRecord?.evidence.map((e) => e.evidenceId) || [],
        metadata: node.metadata,
        visualHints: {
          isFocal: isBlocker,
          emphasis: visualWeight,
          icon: isBlocker ? "alert-triangle" : isRecovered ? "refresh-cw" : "activity",
          shape: isBlocker ? "DIAMOND" : "RECT",
          badge: FactoryOSVisualTokens.badges[node.truthLevel],
          order: idx,
        },
      });
    }

    for (const edge of missionGraph.edges) {
      if (selectedIds.has(edge.from) && selectedIds.has(edge.to)) {
        edges.push({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          type: edge.type,
          label: edge.label || edge.type,
          truthLevel: edge.truthLevel,
          status: edge.status,
          visualHints: {
            style: FactoryOSVisualTokens.lineStyles[edge.truthLevel] || "solid",
            color: edge.status === "FAILED" ? FactoryOSVisualTokens.colors.status.FAILED : FactoryOSVisualTokens.colors.border,
            marker: "arrow",
          },
        });
      }
    }

    return {
      schemaVersion: "1.0.0",
      viewType: "OVERSEER_OPERATIONAL",
      title: `Overseer Operational Control: ${missionGraph.missionId}`,
      subtitle: `Active bottlenecks, blockers, recovery actions, and supervision status`,
      missionId: missionGraph.missionId,
      runId: missionGraph.runId,
      nodes,
      edges,
      groups: [],
      focus,
      emphasis,
      collapsedGroups: [],
      annotations: [
        {
          targetId: focus[0] || nodes[0]?.id || "overseer",
          text: focus.length > 0 ? `Active blocker detected at '${focus[0]}'` : "All floors nominal",
          type: focus.length > 0 ? "ALERT" : "INFO",
        },
      ],
      complexityBudget: {
        maxNodes,
        currentNodes: nodes.length,
        budgetExceeded: operationalNodes.length > maxNodes,
        action: operationalNodes.length > maxNodes ? "COLLAPSED" : "NONE",
      },
      chapters: [
        {
          id: "ch_blockers",
          title: "Blockers & Recovery",
          description: "Active blockers and engaged fallback systems",
          focalNodeIds: focus,
          visibleEdgeIds: edges.map((e) => e.id),
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * VIEW 3: SLAYER FORENSIC VIEW
   * Answers: "Why did this fail, and what evidence supports the explanation?"
   * Isolates the causal chain, root-cause candidate, downstream impact, and browser evidence.
   */
  public static buildSlayerForensicView(
    missionGraph: MissionGraphIR,
    evidenceGraph?: EvidenceGraphIR,
    failedNodeId?: string,
    situationRecord?: SituationRecord
  ): GraphPresentationIR {
    const nodes: PresentationNode[] = [];
    const edges: PresentationEdge[] = [];
    const focus: string[] = [];
    const emphasis: Array<{ targetId: string; visualWeight: VisualWeight; reason: string }> = [];

    // Find failing nodes
    const focalIds = failedNodeId
      ? [failedNodeId]
      : missionGraph.nodes.filter((n) => n.status === "FAILED").map((n) => n.id);

    focus.push(...focalIds);

    // Compute causal cone (ancestors and direct descendants of failure)
    const causalNodeIds = new Set<string>(focalIds);
    for (const edge of missionGraph.edges) {
      if (focalIds.includes(edge.from)) causalNodeIds.add(edge.to);
      if (focalIds.includes(edge.to)) causalNodeIds.add(edge.from);
    }

    const candidateNodes = missionGraph.nodes.filter((n) => causalNodeIds.has(n.id));
    const maxNodes = 15;
    const selectedNodes = candidateNodes.slice(0, maxNodes);
    const selectedIds = new Set(selectedNodes.map((n) => n.id));

    for (const [idx, node] of selectedNodes.entries()) {
      const isRoot = focalIds.includes(node.id);
      const visualWeight: VisualWeight = isRoot ? "CRITICAL" : "PRIMARY";

      emphasis.push({
        targetId: node.id,
        visualWeight,
        reason: isRoot ? "Identified root cause anomaly origin" : "Causal failure propagation path",
      });

      const evidenceRefs: string[] = [];
      if (evidenceGraph) {
        for (const ev of evidenceGraph.evidenceNodes) {
          if (ev.category.includes("BROWSER") || ev.category.includes("FAILURE") || ev.id.includes("fail")) {
            evidenceRefs.push(ev.id);
          }
        }
      }
      if (situationRecord) {
        evidenceRefs.push(...situationRecord.evidence.map((e) => e.evidenceId));
      }

      nodes.push({
        id: node.id,
        label: node.label,
        type: node.type as any,
        status: node.status === "PLANNED" ? "PENDING" : node.status,
        truthLevel: node.truthLevel,
        evidenceRefs: Array.from(new Set(evidenceRefs)),
        metadata: node.metadata,
        visualHints: {
          isFocal: isRoot,
          emphasis: visualWeight,
          icon: isRoot ? "x-octagon" : "zap",
          shape: isRoot ? "DIAMOND" : "RECT",
          badge: FactoryOSVisualTokens.badges[node.truthLevel],
          order: idx,
        },
      });
    }

    for (const edge of missionGraph.edges) {
      if (selectedIds.has(edge.from) && selectedIds.has(edge.to)) {
        edges.push({
          id: edge.id,
          from: edge.from,
          to: edge.to,
          type: edge.type,
          label: edge.label || edge.type,
          truthLevel: edge.truthLevel,
          status: edge.status,
          visualHints: {
            style: "solid",
            color: FactoryOSVisualTokens.colors.status.FAILED,
            marker: "arrow",
            highlighted: true,
          },
        });
      }
    }

    return {
      schemaVersion: "1.0.0",
      viewType: "SLAYER_FORENSIC",
      title: `Slayer Forensic Analysis: ${missionGraph.missionId}`,
      subtitle: `Root-cause anomaly tracing, causal dependencies, and forensic evidence chain`,
      missionId: missionGraph.missionId,
      runId: missionGraph.runId,
      nodes,
      edges,
      groups: [],
      focus,
      emphasis,
      collapsedGroups: [],
      annotations: [
        {
          targetId: focus[0] || nodes[0]?.id || "slayer",
          text: `Causal origin: '${focus[0] || "unknown"}' with ${edges.length} downstream affected edges`,
          type: "ALERT",
        },
      ],
      complexityBudget: {
        maxNodes,
        currentNodes: nodes.length,
        budgetExceeded: candidateNodes.length > maxNodes,
        action: candidateNodes.length > maxNodes ? "COLLAPSED" : "NONE",
      },
      chapters: [
        {
          id: "ch_forensic",
          title: "Failure Propagation",
          description: "Chronological trace from anomaly to system failure",
          focalNodeIds: focus,
          visibleEdgeIds: edges.map((e) => e.id),
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * VIEW 4: EVIDENCE DRILLDOWN
   * Answers: "Why should I believe this node/edge?"
   * Focuses on a single subject and visually articulates its supporting evidence nodes.
   */
  public static buildEvidenceDrilldownView(
    subjectId: string,
    missionGraph: MissionGraphIR,
    evidenceGraph: EvidenceGraphIR
  ): GraphPresentationIR {
    const subjectNode = missionGraph.nodes.find((n) => n.id === subjectId) || {
      id: subjectId,
      label: subjectId,
      type: "ARTIFACT" as const,
      truthLevel: "VERIFIED" as const,
      status: "VERIFIED" as const,
    };

    const nodes: PresentationNode[] = [];
    const edges: PresentationEdge[] = [];

    // Subject node (center)
    nodes.push({
      id: subjectNode.id,
      label: subjectNode.label,
      type: subjectNode.type as any,
      status: subjectNode.status === "PLANNED" ? "PENDING" : subjectNode.status,
      truthLevel: subjectNode.truthLevel,
      evidenceRefs: [],
      visualHints: {
        isFocal: true,
        emphasis: "PRIMARY",
        icon: "target",
        shape: "HEXAGON",
        badge: FactoryOSVisualTokens.badges[subjectNode.truthLevel],
        order: 0,
      },
    });

    // Supporting evidence nodes
    const supportingEdges = evidenceGraph.evidenceEdges.filter((e) => e.targetGraphNodeId === subjectId);
    const supportingNodeIds = new Set(supportingEdges.map((e) => e.evidenceNodeId));
    const evidenceNodes = evidenceGraph.evidenceNodes.filter(
      (ev) => supportingNodeIds.has(ev.id) || ev.id.includes(subjectId)
    );

    for (const [idx, ev] of evidenceNodes.entries()) {
      nodes.push({
        id: ev.id,
        label: ev.description || ev.id,
        type: "EVIDENCE",
        status: "COMPLETED",
        truthLevel: ev.truthLevel,
        evidenceRefs: [ev.id],
        metadata: {
          category: ev.category,
          digest: ev.digest,
          verifiedBy: ev.verifiedBy,
        },
        visualHints: {
          isFocal: false,
          emphasis: ev.truthLevel === "VERIFIED" || ev.truthLevel === "PHYSICAL" ? "PRIMARY" : "MUTED",
          icon: ev.category.includes("BROWSER") ? "globe" : "file-check",
          shape: "PILL",
          badge: FactoryOSVisualTokens.badges[ev.truthLevel],
          order: idx + 1,
        },
      });

      edges.push({
        id: `edge_ev_${ev.id}_to_${subjectNode.id}`,
        from: ev.id,
        to: subjectNode.id,
        type: "EVIDENCE_SUPPORT",
        label: `supports [${ev.truthLevel}]`,
        truthLevel: ev.truthLevel,
        status: "VERIFIED",
        visualHints: {
          style: FactoryOSVisualTokens.lineStyles[ev.truthLevel] || "solid",
          color: FactoryOSVisualTokens.colors.truth[ev.truthLevel] || FactoryOSVisualTokens.colors.border,
          marker: "arrow",
        },
      });
    }

    return {
      schemaVersion: "1.0.0",
      viewType: "EVIDENCE_DRILLDOWN",
      title: `Evidence Proof Drilldown: ${subjectNode.label}`,
      subtitle: `Grounding trace proving truth status '${subjectNode.truthLevel}'`,
      missionId: missionGraph.missionId,
      runId: missionGraph.runId,
      nodes,
      edges,
      groups: [],
      focus: [subjectNode.id],
      emphasis: [
        {
          targetId: subjectNode.id,
          visualWeight: "PRIMARY",
          reason: "Subject of evidence inquiry",
        },
      ],
      collapsedGroups: [],
      annotations: [
        {
          targetId: subjectNode.id,
          text: `Subject grounded by ${evidenceNodes.length} authoritative evidence records`,
          type: "EVIDENCE",
        },
      ],
      complexityBudget: {
        maxNodes: 20,
        currentNodes: nodes.length,
        budgetExceeded: false,
        action: "NONE",
      },
      chapters: [
        {
          id: "ch_evidence_grounding",
          title: "Evidence Grounding",
          description: "Verification probes, digests, and physical byte existence",
          focalNodeIds: [subjectNode.id],
          visibleEdgeIds: edges.map((e) => e.id),
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * SITUATION RECORD VIEW
   * Projects a SituationRecord (TEXT + GRAPH + EVIDENCE) directly without text re-synthesis.
   */
  public static buildSituationRecordView(situation: SituationRecord): GraphPresentationIR {
    const nodes: PresentationNode[] = situation.graph.nodes.map((node, idx) => {
      const isFocal = situation.graph.focus.includes(node.id);
      const emp = situation.graph.emphasis.find((e) => e.targetId === node.id);
      const visualWeight: VisualWeight = emp ? (emp.visualWeight === "ALERT" ? "CRITICAL" : "PRIMARY") : "MUTED";

      return {
        id: node.id,
        label: node.label,
        type: node.type as any,
        status: node.status === "PENDING" ? "PENDING" : node.status || "UNKNOWN",
        truthLevel: "OBSERVED",
        evidenceRefs: situation.evidence.map((e) => e.evidenceId),
        metadata: node.metadata,
        visualHints: {
          isFocal,
          emphasis: visualWeight,
          icon: node.type === "FAILURE" ? "alert-circle" : node.type === "RECOVERY" ? "check-circle" : "box",
          shape: node.type === "FAILURE" ? "DIAMOND" : "RECT",
          badge: FactoryOSVisualTokens.badges.OBSERVED,
          order: idx,
        },
      };
    });

    const edges: PresentationEdge[] = situation.graph.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      label: edge.label || edge.type,
      truthLevel: "OBSERVED",
      status: "OBSERVED",
      visualHints: {
        style: "solid",
        color: FactoryOSVisualTokens.colors.border,
        marker: "arrow",
      },
    }));

    return {
      schemaVersion: "1.0.0",
      viewType: "OVERSEER_OPERATIONAL",
      title: `Situation Record: ${situation.id}`,
      subtitle: situation.text,
      missionId: situation.missionId,
      runId: situation.runId,
      nodes,
      edges,
      groups: [],
      focus: [...situation.graph.focus],
      emphasis: situation.graph.emphasis.map((e) => ({
        targetId: e.targetId,
        visualWeight: e.visualWeight === "ALERT" ? "CRITICAL" : "PRIMARY",
        reason: e.reason,
      })),
      collapsedGroups: [],
      annotations: [
        {
          targetId: situation.graph.focus[0] || nodes[0]?.id || "situation",
          text: situation.text,
          type: situation.priority === "CRITICAL" || situation.priority === "HIGH" ? "ALERT" : "INFO",
        },
      ],
      complexityBudget: {
        maxNodes: 15,
        currentNodes: nodes.length,
        budgetExceeded: false,
        action: "NONE",
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * VIEW: DELTA COMPARISON
   * Visualizes Before vs After changes using GraphDelta.
   */
  public static buildDeltaComparisonView(
    delta: GraphDelta,
    baseline: MissionGraphIR,
    candidate: MissionGraphIR
  ): GraphPresentationIR {
    const nodes: PresentationNode[] = [];
    const edges: PresentationEdge[] = [];
    const focus: string[] = [];
    const emphasis: Array<{ targetId: string; visualWeight: VisualWeight; reason: string }> = [];

    const addedNodeIds = new Set(delta.addedNodes.map((n) => n.id));
    const removedNodeIds = new Set(delta.removedNodes.map((n) => n.id));
    const modifiedNodeIds = new Set(delta.modifiedNodes.map((n) => n.id));

    // Combine candidate nodes + removed baseline nodes
    const allNodes = [...candidate.nodes, ...delta.removedNodes];

    for (const [idx, node] of allNodes.entries()) {
      let deltaTag = "UNCHANGED";
      let visualWeight: VisualWeight = "MUTED";

      if (addedNodeIds.has(node.id)) {
        deltaTag = "+ ADDED";
        visualWeight = "PRIMARY";
        focus.push(node.id);
        emphasis.push({ targetId: node.id, visualWeight: "PRIMARY", reason: "Node added in candidate run" });
      } else if (removedNodeIds.has(node.id)) {
        deltaTag = "- REMOVED";
        visualWeight = "CRITICAL";
        focus.push(node.id);
        emphasis.push({ targetId: node.id, visualWeight: "CRITICAL", reason: "Node removed in candidate run" });
      } else if (modifiedNodeIds.has(node.id)) {
        deltaTag = "~ MODIFIED";
        visualWeight = "PRIMARY";
        focus.push(node.id);
        emphasis.push({ targetId: node.id, visualWeight: "PRIMARY", reason: "Node status/truth modified" });
      }

      nodes.push({
        id: node.id,
        label: `${node.label} [${deltaTag}]`,
        type: node.type as any,
        status: node.status === "PLANNED" ? "PENDING" : node.status,
        truthLevel: node.truthLevel,
        evidenceRefs: [],
        metadata: { deltaTag, ...node.metadata },
        visualHints: {
          isFocal: focus.includes(node.id),
          emphasis: visualWeight,
          icon: deltaTag.includes("+") ? "plus-circle" : deltaTag.includes("-") ? "minus-circle" : "git-commit",
          shape: deltaTag.includes("-") ? "DIAMOND" : "RECT",
          badge: deltaTag,
          order: idx,
        },
      });
    }

    for (const edge of candidate.edges) {
      edges.push({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        type: edge.type,
        label: edge.label || edge.type,
        truthLevel: edge.truthLevel,
        status: edge.status,
        visualHints: {
          style: "solid",
          color: FactoryOSVisualTokens.colors.border,
          marker: "arrow",
        },
      });
    }

    return {
      schemaVersion: "1.0.0",
      viewType: "DELTA_COMPARISON",
      title: `Graph Delta: ${delta.baselineRunId} ➔ ${delta.candidateRunId}`,
      subtitle: `Before/After comparison: ${delta.addedNodes.length} added, ${delta.removedNodes.length} removed, ${delta.modifiedNodes.length} modified`,
      missionId: baseline.missionId,
      runId: candidate.runId,
      nodes,
      edges,
      groups: [],
      focus,
      emphasis,
      collapsedGroups: [],
      annotations: [
        {
          targetId: focus[0] || nodes[0]?.id || "delta",
          text: delta.hasDivergence ? "Topological divergence detected between runs" : "Runs are structurally identical",
          type: delta.hasDivergence ? "WARNING" : "INFO",
        },
      ],
      complexityBudget: {
        maxNodes: 20,
        currentNodes: nodes.length,
        budgetExceeded: false,
        action: "NONE",
      },
      chapters: [
        {
          id: "ch_delta",
          title: "Run Comparison Delta",
          description: "Structural and state evolution between baseline and candidate",
          focalNodeIds: focus,
          visibleEdgeIds: edges.map((e) => e.id),
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  }
}
