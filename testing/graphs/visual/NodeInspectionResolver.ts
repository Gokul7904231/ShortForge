/**
 * FactoryOS v1 / Frontier v3 — Node Inspection Resolver
 * Resolves a canonical node ID against authoritative MissionGraph and EvidenceGraph.
 * Enforces fail-closed behavior: unknown nodes return resolved=false and truthLevel=UNKNOWN.
 * Preserves strict execution-truth boundaries without synthesizing facts.
 */

import type { MissionGraphIR, MissionGraphNode } from "../MissionGraph";
import type { EvidenceGraphIR } from "../EvidenceGraph";
import type { CanonicalId, NodeInspectionResult } from "./InteractionIR";
import type { PresentationViewType } from "./PresentationIR";

export interface NodeInspectionContext {
  readonly missionGraph: MissionGraphIR;
  readonly evidenceGraph?: EvidenceGraphIR;
  readonly viewType?: PresentationViewType;
}

export class NodeInspectionResolver {
  public static resolve(canonicalId: CanonicalId, context: NodeInspectionContext): NodeInspectionResult {
    const { missionGraph, evidenceGraph, viewType = "MISSION_OVERVIEW" } = context;

    // 1. Locate node in authoritative MissionGraph
    const node: MissionGraphNode | undefined = missionGraph.nodes.find((n) => n.id === canonicalId);

    if (!node) {
      // If not in MissionGraph, check if it's an evidence node in EvidenceGraph
      const evNode = evidenceGraph?.evidenceNodes.find((e) => e.id === canonicalId);
      if (evNode) {
        return {
          canonicalId,
          label: evNode.description,
          type: "EVIDENCE",
          status: "VERIFIED",
          truthLevel: evNode.truthLevel,
          consumers: [],
          dependencies: [evNode.subjectId],
          evidenceRefs: [evNode.id],
          artifactRefs: evNode.physicalPath ? [evNode.physicalPath] : [],
          browserEvidenceRefs: evNode.category.startsWith("BROWSER_") ? [evNode.id] : [],
          timestamps: { startedAt: evNode.timestamp },
          currentProjectionView: viewType,
          metadata: { category: evNode.category, digest: evNode.digest },
          resolved: true,
        };
      }

      // Fail closed: return unresolvable record with UNKNOWN truth level
      return {
        canonicalId,
        label: `Unresolved [${canonicalId}]`,
        type: "UNKNOWN",
        status: "UNKNOWN",
        truthLevel: "UNKNOWN",
        consumers: [],
        dependencies: [],
        evidenceRefs: [],
        artifactRefs: [],
        browserEvidenceRefs: [],
        currentProjectionView: viewType,
        resolved: false,
      };
    }

    // 2. Discover incoming and outgoing edges
    const incomingEdges = missionGraph.edges.filter((e) => e.to === canonicalId);
    const outgoingEdges = missionGraph.edges.filter((e) => e.from === canonicalId);

    const dependencies = Array.from(new Set(incomingEdges.map((e) => e.from)));
    const consumers = Array.from(new Set(outgoingEdges.map((e) => e.to)));

    // 3. Resolve producer
    const producer = node.floorId || (incomingEdges.find((e) => e.type === "ARTIFACT_PRODUCED")?.from) || undefined;

    // 4. Resolve evidence links from EvidenceGraph
    const evidenceRefs: string[] = [];
    const browserEvidenceRefs: string[] = [];
    const artifactRefs: string[] = [];

    if (evidenceGraph) {
      for (const edge of evidenceGraph.evidenceEdges) {
        if (edge.targetGraphNodeId === canonicalId) {
          evidenceRefs.push(edge.evidenceNodeId);
        }
      }
      for (const ev of evidenceGraph.evidenceNodes) {
        if (ev.subjectId === canonicalId) {
          if (!evidenceRefs.includes(ev.id)) {
            evidenceRefs.push(ev.id);
          }
        }
        if (evidenceRefs.includes(ev.id)) {
          if (ev.category.startsWith("BROWSER_")) {
            browserEvidenceRefs.push(ev.id);
          }
          if (ev.physicalPath || ev.category === "PHYSICAL_FILE_ON_DISK" || ev.category === "SHA256_BYTE_DIGEST") {
            artifactRefs.push(ev.subjectId);
          }
        }
      }
    }

    // Add artifact references from node metadata
    if (node.metadata && typeof node.metadata.artifactPath === "string") {
      artifactRefs.push(node.metadata.artifactPath);
    }

    // 5. Recovery state
    let recoveryState: { recovered: boolean; recoveryEngine?: string; recoveryEvidenceRef?: string } | undefined;
    if (node.status === "VERIFIED" && node.metadata?.recovered) {
      recoveryState = {
        recovered: true,
        recoveryEngine: typeof node.metadata.recoveryEngine === "string" ? node.metadata.recoveryEngine : undefined,
        recoveryEvidenceRef: typeof node.metadata.recoveryEvidenceRef === "string" ? node.metadata.recoveryEvidenceRef : undefined,
      };
    }

    return {
      canonicalId: node.id,
      label: node.label,
      type: node.type,
      status: node.status,
      truthLevel: node.truthLevel,
      producer,
      consumers,
      dependencies,
      recoveryState,
      evidenceRefs: Array.from(new Set(evidenceRefs)),
      artifactRefs: Array.from(new Set(artifactRefs)),
      browserEvidenceRefs: Array.from(new Set(browserEvidenceRefs)),
      timestamps: {
        startedAt: node.timestamp,
        durationMs: typeof node.metadata?.durationMs === "number" ? node.metadata.durationMs : undefined,
      },
      currentProjectionView: viewType,
      metadata: node.metadata,
      resolved: true,
    };
  }
}
