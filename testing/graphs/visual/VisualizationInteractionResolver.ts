/**
 * FactoryOS v1 / Frontier v3 — Visualization Interaction Resolver (Correctness Hardened)
 * Main interaction orchestrator dispatching user & agent actions to specialized resolvers.
 * Generates deterministic VisualizationInteractionReceipts, handles Focus Subgraphs respecting
 * complexity budgets, resolves Delta comparisons, and maintains strict read-only execution boundaries.
 *
 * Correctness Invariants:
 * - Interaction IDs are 100% deterministic (zero Date.now() or wall-clock entropy in identity).
 * - OPEN_GRAPH_VIEW strictly validates viewType and subjectId; fails closed on unknown subjects.
 * - FOCUS_SUBGRAPH derives truthLevel from authoritative subject state, never hardcoded VERIFIED.
 * - Every displayed evidence node in FOCUS_SUBGRAPH has a supporting presentation edge (no orphan islands).
 * - Resolution status (resolved=true/false) and Truth Level (PHYSICAL, OBSERVED, UNKNOWN) remain separate.
 */

import { createHash } from "node:crypto";
import type { MissionGraphIR, MissionGraphNode, MissionGraphEdge } from "../MissionGraph";
import type { EvidenceGraphIR } from "../EvidenceGraph";
import type { SituationRecord } from "../../model/SituationRecord";
import type { BrowserEvidenceRecord, BrowserRunRecord } from "../../contracts/browser.contract";
import type { GraphDelta } from "../GraphDiff";
import type {
  CanonicalId,
  PresentationAction,
  VisualizationInteractionReceipt,
  NodeInspectionResult,
  EdgeExplanationResult,
  ArtifactInspectionResult,
  BrowserEvidenceInspectionResult,
  SituationInspectionResult,
  DeltaInspectionResult,
  Diagnostic,
} from "./InteractionIR";
import { NodeInspectionResolver } from "./NodeInspectionResolver";
import { EdgeExplanationResolver } from "./EdgeExplanationResolver";
import { ArtifactInspectionResolver, type ArtifactDataRecord } from "./ArtifactInspectionResolver";
import { BrowserEvidenceResolver } from "./BrowserEvidenceResolver";
import { SituationInspectionResolver } from "./SituationInspectionResolver";
import { GraphNavigationState } from "./GraphNavigationState";
import type { GraphPresentationIR, PresentationViewType, PresentationEdge } from "./PresentationIR";

export interface InteractionResolverEnvironment {
  readonly missionGraph: MissionGraphIR;
  readonly evidenceGraph?: EvidenceGraphIR;
  readonly situationRecords?: SituationRecord[];
  readonly browserRecords?: BrowserEvidenceRecord[];
  readonly browserRunContext?: Partial<BrowserRunRecord>;
  readonly physicalArtifacts?: ArtifactDataRecord[];
  readonly graphDelta?: GraphDelta;
  readonly viewType?: PresentationViewType;
}

const SUPPORTED_GRAPH_VIEWS: readonly PresentationViewType[] = [
  "MISSION_OVERVIEW",
  "OVERSEER_OPERATIONAL",
  "SLAYER_FORENSIC",
  "EVIDENCE_DRILLDOWN",
  "DELTA_COMPARISON",
];

export class VisualizationInteractionResolver {
  /**
   * Computes a deterministic interaction ID without wall-clock entropy.
   */
  public static computeDeterministicInteractionId(
    action: PresentationAction,
    env: InteractionResolverEnvironment,
    sourceView: PresentationViewType
  ): string {
    const payload = {
      missionId: env.missionGraph.missionId,
      runId: env.missionGraph.runId,
      sourceView,
      action,
    };
    return `int_${createHash("sha256").update(JSON.stringify(payload)).digest("hex").substring(0, 16)}`;
  }

  public static dispatch(
    action: PresentationAction,
    env: InteractionResolverEnvironment,
    navState?: GraphNavigationState
  ): {
    receipt: VisualizationInteractionReceipt;
    result?:
      | NodeInspectionResult
      | EdgeExplanationResult
      | ArtifactInspectionResult
      | BrowserEvidenceInspectionResult
      | SituationInspectionResult
      | DeltaInspectionResult
      | GraphPresentationIR;
  } {
    const sourceView: PresentationViewType = env.viewType ?? navState?.current().viewType ?? "MISSION_OVERVIEW";
    const interactionId = this.computeDeterministicInteractionId(action, env, sourceView);
    const diagnostics: Diagnostic[] = [];

    switch (action.type) {
      case "OPEN_SUBJECT": {
        const nodeRes = NodeInspectionResolver.resolve(action.subjectId, {
          missionGraph: env.missionGraph,
          evidenceGraph: env.evidenceGraph,
          viewType: sourceView,
        });

        if (!nodeRes.resolved) {
          diagnostics.push({
            code: "NODE_NOT_FOUND",
            message: `Subject '${action.subjectId}' does not exist in authoritative graph.`,
            severity: "ERROR",
            targetId: action.subjectId,
          });
        }

        if (navState && nodeRes.resolved) {
          navState.push({
            viewType: sourceView,
            subjectId: action.subjectId,
            selectedNodeId: action.subjectId,
            selectionReason: `Opened subject ${action.subjectId}`,
          });
        }

        const receipt: VisualizationInteractionReceipt = {
          interactionId,
          action,
          sourceView,
          subjectId: action.subjectId,
          resolved: nodeRes.resolved,
          truthLevel: nodeRes.truthLevel,
          authoritativeRefs: nodeRes.resolved ? [nodeRes.canonicalId] : [],
          evidenceRefs: nodeRes.evidenceRefs,
          artifactRefs: nodeRes.artifactRefs,
          diagnostics,
          generatedAt: new Date().toISOString(),
        };

        return { receipt, result: nodeRes };
      }

      case "EXPLAIN_EDGE": {
        const edgeRes = EdgeExplanationResolver.resolve(action.edgeId, {
          missionGraph: env.missionGraph,
          evidenceGraph: env.evidenceGraph,
          physicalArtifacts: env.physicalArtifacts,
        });

        if (!edgeRes.resolved) {
          diagnostics.push({
            code: "EDGE_NOT_FOUND",
            message: `Edge '${action.edgeId}' does not exist in authoritative graph.`,
            severity: "ERROR",
            targetId: action.edgeId,
          });
        }

        if (navState && edgeRes.resolved) {
          navState.push({
            viewType: sourceView,
            selectedEdgeId: action.edgeId,
            selectionReason: `Explain edge ${action.edgeId}`,
          });
        }

        const receipt: VisualizationInteractionReceipt = {
          interactionId,
          action,
          sourceView,
          subjectId: edgeRes.resolved ? edgeRes.edgeId : undefined,
          resolved: edgeRes.resolved,
          truthLevel: edgeRes.truthLevel,
          authoritativeRefs: edgeRes.resolved ? [edgeRes.edgeId, edgeRes.fromNodeId, edgeRes.toNodeId] : [],
          evidenceRefs: edgeRes.evidenceRefs,
          artifactRefs: edgeRes.artifactTransferred ? [edgeRes.artifactTransferred.artifactId] : [],
          diagnostics,
          generatedAt: new Date().toISOString(),
        };

        return { receipt, result: edgeRes };
      }

      case "OPEN_ARTIFACT": {
        const artRes = ArtifactInspectionResolver.resolve(action.artifactId, env.physicalArtifacts ?? []);

        if (!artRes.resolved) {
          diagnostics.push({
            code: "ARTIFACT_NOT_FOUND",
            message: `Artifact '${action.artifactId}' could not be resolved.`,
            severity: "ERROR",
            targetId: action.artifactId,
          });
        }

        const receipt: VisualizationInteractionReceipt = {
          interactionId,
          action,
          sourceView,
          subjectId: action.artifactId,
          resolved: artRes.resolved,
          truthLevel: artRes.truthLevel ?? (artRes.physicalExistenceProven ? "PHYSICAL" : "UNKNOWN"),
          authoritativeRefs: artRes.resolved ? [artRes.artifactId] : [],
          evidenceRefs: [],
          artifactRefs: artRes.resolved ? [artRes.path] : [],
          diagnostics,
          generatedAt: new Date().toISOString(),
        };

        return { receipt, result: artRes };
      }

      case "OPEN_BROWSER_EVIDENCE": {
        const brRes = BrowserEvidenceResolver.resolve(action.evidenceId, env.browserRecords ?? [], env.browserRunContext);

        if (!brRes.resolved) {
          diagnostics.push({
            code: "BROWSER_EVIDENCE_NOT_FOUND",
            message: `Browser evidence '${action.evidenceId}' not found.`,
            severity: "ERROR",
            targetId: action.evidenceId,
          });
        }

        const receipt: VisualizationInteractionReceipt = {
          interactionId,
          action,
          sourceView,
          subjectId: action.evidenceId,
          resolved: brRes.resolved,
          truthLevel: brRes.truthLevel,
          authoritativeRefs: brRes.resolved ? [brRes.evidenceId] : [],
          evidenceRefs: brRes.resolved ? [brRes.evidenceId] : [],
          artifactRefs: brRes.screenshotPath ? [brRes.screenshotPath] : [],
          diagnostics,
          generatedAt: new Date().toISOString(),
        };

        return { receipt, result: brRes };
      }

      case "OPEN_SITUATION": {
        const sitRes = SituationInspectionResolver.resolve(action.situationId, env.situationRecords ?? [], env.evidenceGraph);

        if (!sitRes.resolved) {
          diagnostics.push({
            code: "SITUATION_NOT_FOUND",
            message: `SituationRecord '${action.situationId}' not found.`,
            severity: "ERROR",
            targetId: action.situationId,
          });
        }

        const receipt: VisualizationInteractionReceipt = {
          interactionId,
          action,
          sourceView,
          subjectId: action.situationId,
          resolved: sitRes.resolved,
          truthLevel: sitRes.resolved ? "VERIFIED" : "UNKNOWN",
          authoritativeRefs: sitRes.resolved ? [sitRes.situationId] : [],
          evidenceRefs: sitRes.evidenceRefs,
          artifactRefs: [],
          diagnostics,
          generatedAt: new Date().toISOString(),
        };

        return { receipt, result: sitRes };
      }

      case "OPEN_GRAPH_VIEW": {
        // Section 8: Harden OPEN_GRAPH_VIEW validation
        const isValidView = SUPPORTED_GRAPH_VIEWS.includes(action.viewType);
        if (!isValidView) {
          diagnostics.push({
            code: "INVALID_VIEW_TYPE",
            message: `Requested view type '${action.viewType}' is not supported.`,
            severity: "ERROR",
          });
          const receipt: VisualizationInteractionReceipt = {
            interactionId,
            action,
            sourceView: action.viewType,
            subjectId: action.subjectId,
            resolved: false,
            truthLevel: "UNKNOWN",
            authoritativeRefs: [],
            evidenceRefs: [],
            artifactRefs: [],
            diagnostics,
            generatedAt: new Date().toISOString(),
          };
          return { receipt };
        }

        // Validate subjectId if supplied
        if (action.subjectId) {
          const subjectExists =
            env.missionGraph.nodes.some((n) => n.id === action.subjectId) ||
            env.evidenceGraph?.evidenceNodes.some((e) => e.id === action.subjectId) ||
            env.physicalArtifacts?.some((a) => a.id === action.subjectId);

          if (!subjectExists) {
            diagnostics.push({
              code: "UNKNOWN_SUBJECT",
              message: `Requested subject '${action.subjectId}' does not exist for view '${action.viewType}'.`,
              severity: "ERROR",
              targetId: action.subjectId,
            });
            const receipt: VisualizationInteractionReceipt = {
              interactionId,
              action,
              sourceView: action.viewType,
              subjectId: action.subjectId,
              resolved: false,
              truthLevel: "UNKNOWN",
              authoritativeRefs: [],
              evidenceRefs: [],
              artifactRefs: [],
              diagnostics,
              generatedAt: new Date().toISOString(),
            };
            return { receipt };
          }
        }

        if (navState) {
          navState.push({
            viewType: action.viewType,
            subjectId: action.subjectId,
            selectionReason: `Switch to view ${action.viewType}`,
          });
        }

        const receipt: VisualizationInteractionReceipt = {
          interactionId,
          action,
          sourceView: action.viewType,
          subjectId: action.subjectId,
          resolved: true,
          authoritativeRefs: action.subjectId ? [action.subjectId] : [],
          evidenceRefs: [],
          artifactRefs: [],
          diagnostics,
          generatedAt: new Date().toISOString(),
        };

        return { receipt };
      }

      case "RETURN_TO_PARENT": {
        const popped = navState?.pop();
        const newCurrent = navState?.current();

        const receipt: VisualizationInteractionReceipt = {
          interactionId,
          action,
          sourceView: newCurrent?.viewType ?? "MISSION_OVERVIEW",
          subjectId: newCurrent?.subjectId,
          resolved: !!popped,
          authoritativeRefs: newCurrent?.subjectId ? [newCurrent.subjectId] : [],
          evidenceRefs: [],
          artifactRefs: [],
          diagnostics,
          generatedAt: new Date().toISOString(),
        };

        return { receipt };
      }

      case "FOCUS_SUBGRAPH": {
        const subjectNode = env.missionGraph.nodes.find((n) => n.id === action.subjectId);
        const focused = this.buildFocusSubgraph(action.subjectId, env, 15);

        // Section 9: Truth level derived strictly from authoritative subject state
        const subjectTruthLevel = subjectNode ? subjectNode.truthLevel : "UNKNOWN";

        if (navState && focused) {
          navState.push({
            viewType: "EVIDENCE_DRILLDOWN",
            subjectId: action.subjectId,
            selectionReason: `Focus subgraph around ${action.subjectId}`,
          });
        }

        const receipt: VisualizationInteractionReceipt = {
          interactionId,
          action,
          sourceView: "EVIDENCE_DRILLDOWN",
          subjectId: action.subjectId,
          resolved: !!focused,
          truthLevel: subjectTruthLevel,
          authoritativeRefs: [action.subjectId],
          evidenceRefs: [],
          artifactRefs: [],
          diagnostics,
          generatedAt: new Date().toISOString(),
        };

        return { receipt, result: focused };
      }
    }
  }

  /**
   * Resolves before, delta, and after states for a modified or added node from GraphDelta.
   */
  public static resolveDelta(subjectId: CanonicalId, delta?: GraphDelta): DeltaInspectionResult {
    if (!delta) {
      return {
        subjectId,
        deltaType: "UNCHANGED",
        resolved: false,
      };
    }

    const added = delta.addedNodes.find((n) => n.id === subjectId);
    if (added) {
      return {
        subjectId,
        deltaType: "ADDED",
        after: { status: added.status, truthLevel: added.truthLevel, metadata: added.metadata },
        resolved: true,
      };
    }

    const removed = delta.removedNodes.find((n) => n.id === subjectId);
    if (removed) {
      return {
        subjectId,
        deltaType: "REMOVED",
        before: { status: removed.status, truthLevel: removed.truthLevel, metadata: removed.metadata },
        resolved: true,
      };
    }

    const modified = delta.modifiedNodes.find((m) => m.id === subjectId);
    if (modified) {
      return {
        subjectId,
        deltaType: "MODIFIED",
        before: { status: modified.before.status, truthLevel: modified.before.truthLevel },
        delta: {
          statusChange: `${modified.before.status} → ${modified.after.status}`,
          truthLevelChange: `${modified.before.truthLevel} → ${modified.after.truthLevel}`,
        },
        after: { status: modified.after.status, truthLevel: modified.after.truthLevel },
        resolved: true,
      };
    }

    return {
      subjectId,
      deltaType: "UNCHANGED",
      resolved: true,
    };
  }

  /**
   * Builds a focused subgraph respecting a complexity budget.
   * Section 10: Ensures every displayed evidence node has a supporting presentation edge.
   * Zero orphan presentation nodes.
   */
  public static buildFocusSubgraph(
    subjectId: CanonicalId,
    env: InteractionResolverEnvironment,
    maxBudget: number = 15
  ): GraphPresentationIR | undefined {
    const { missionGraph, evidenceGraph } = env;
    const subjectNode = missionGraph.nodes.find((n) => n.id === subjectId);
    if (!subjectNode) return undefined;

    const keptNodeIds = new Set<string>([subjectId]);
    const keptEdges: MissionGraphEdge[] = [];
    const evidencePresentationEdges: PresentationEdge[] = [];

    // 1. Direct producer and consumer edges
    for (const edge of missionGraph.edges) {
      if (edge.to === subjectId || edge.from === subjectId) {
        keptEdges.push(edge);
        keptNodeIds.add(edge.from);
        keptNodeIds.add(edge.to);
        if (keptNodeIds.size >= maxBudget) break;
      }
    }

    // 2. Direct evidence nodes from EvidenceGraph with explicit supporting presentation edges
    if (evidenceGraph) {
      for (const evEdge of evidenceGraph.evidenceEdges) {
        if (evEdge.targetGraphNodeId === subjectId && keptNodeIds.size < maxBudget) {
          keptNodeIds.add(evEdge.evidenceNodeId);
          // Add supporting presentation relation so evidence node is NOT an orphan island
          evidencePresentationEdges.push({
            id: `pres_edge_${evEdge.id}`,
            from: subjectId,
            to: evEdge.evidenceNodeId,
            type: "EVIDENCE_SUPPORT",
            truthLevel: "OBSERVED",
            status: "VERIFIED",
            visualHints: {
              style: "dashed",
              color: "#10b981",
              marker: "arrow",
            },
            metadata: {
              isPresentationOnly: true,
              presentationRelation: "Evidence shown because it supports selected subject",
              authoritativeRelation: `EvidenceGraph relationship: ${(evEdge as any).relationship || "PROVES_ARTIFACT_INTEGRITY"}`,
            },
          });
        }
      }
    }

    // 3. Assemble PresentationNodes
    const nodes = Array.from(keptNodeIds).map((id) => {
      const mNode = missionGraph.nodes.find((n) => n.id === id);
      if (mNode) {
        return {
          id: mNode.id,
          label: mNode.label,
          type: mNode.type,
          status: mNode.status as any,
          truthLevel: mNode.truthLevel,
          evidenceRefs: [],
          visualHints: {
            isFocal: id === subjectId,
            emphasis: (id === subjectId ? "CRITICAL" : "PRIMARY") as any,
            icon: id === subjectId ? "🎯" : "📦",
            shape: "RECT" as any,
            badge: id === subjectId ? "TARGET" : "CONTEXT",
          },
        };
      }
      const evNode = evidenceGraph?.evidenceNodes.find((e) => e.id === id);
      return {
        id,
        label: evNode?.description ?? id,
        type: "EVIDENCE" as any,
        status: "COMPLETED" as any,
        truthLevel: evNode?.truthLevel ?? "OBSERVED",
        evidenceRefs: [id],
        visualHints: {
          isFocal: false,
          emphasis: "MUTED" as any,
          icon: "🔍",
          shape: "PILL" as any,
          badge: "DIRECT EVIDENCE",
        },
      };
    });

    // 4. Combine mission presentation edges with supporting evidence edges
    const missionPresEdges: PresentationEdge[] = keptEdges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      type: e.type,
      truthLevel: e.truthLevel,
      status: e.status,
      visualHints: {
        style: "solid" as any,
        color: "#38bdf8",
        marker: "arrow" as any,
      },
    }));

    const edges: PresentationEdge[] = [...missionPresEdges, ...evidencePresentationEdges];

    return {
      schemaVersion: "2.0.0",
      viewType: "EVIDENCE_DRILLDOWN",
      title: `Focus Subgraph: ${subjectNode.label}`,
      subtitle: `Canonical Subject: ${subjectId} | Bounded to ${nodes.length} nodes (Budget: ${maxBudget})`,
      missionId: missionGraph.missionId,
      runId: missionGraph.runId,
      nodes,
      edges,
      groups: [],
      focus: [subjectId],
      emphasis: [{ targetId: subjectId, visualWeight: "CRITICAL", reason: "Focus Subject" }],
      collapsedGroups: [],
      annotations: [
        {
          targetId: subjectId,
          text: `Focus view bounded to direct causal context and direct evidence. Warning: EVIDENCE_SUPPORT edges are presentation-only projection links, not causal graph edges. Authoritative evidence relationships remain grounded in EvidenceGraph.`,
          type: "INFO",
        },
      ],
      complexityBudget: {
        maxNodes: maxBudget,
        currentNodes: nodes.length,
        budgetExceeded: false,
        action: "NONE",
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
