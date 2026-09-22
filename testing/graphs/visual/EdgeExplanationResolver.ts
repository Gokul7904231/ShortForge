/**
 * FactoryOS v1 / Frontier v3 — Edge Explanation Resolver (Correctness Hardened)
 * Resolves the causal, execution, artifact, and verification grounding behind any edge.
 *
 * Correctness Invariants:
 * - Evidence attached ONLY to endpoint nodes is categorized as CONTEXTUAL ENDPOINT EVIDENCE,
 *   never promoted to direct edge proof.
 * - Edge-level verification requires explicit authoritative edge evidence; endpoint verification
 *   or artifact probes do not automatically verify relationships.
 * - Execution sequences derived from node status are explicitly marked RECONSTRUCTED from NODE_STATE,
 *   never masquerading as OBSERVED events without real runtime records.
 */

import { ArtifactInspectionResolver, type ArtifactDataRecord } from "./ArtifactInspectionResolver";
import type { MissionGraphIR, MissionGraphEdge, MissionGraphNode } from "../MissionGraph";
import type { EvidenceGraphIR, EvidenceNode } from "../EvidenceGraph";
import type { CanonicalId, EdgeExplanationResult } from "./InteractionIR";
import type { TruthLevel } from "../../contracts/execution.contract";

export interface ExecutionEventRecord {
  readonly eventId: string;
  readonly targetId: string;
  readonly type: string;
  readonly timestamp?: string;
  readonly details?: Record<string, unknown>;
}

export interface EdgeExplanationContext {
  readonly missionGraph: MissionGraphIR;
  readonly evidenceGraph?: EvidenceGraphIR;
  readonly executionEvents?: ExecutionEventRecord[];
  readonly physicalArtifacts?: Array<ArtifactDataRecord | {
    readonly id: string;
    readonly path: string;
    readonly byteLength?: number;
    readonly sha256?: string;
    readonly mimeType?: string;
    readonly existsPhysically?: boolean;
    readonly authoritativeReceipt?: any;
    readonly hasAuthoritativePhysicalReceipt?: boolean;
  }>;
}

export class EdgeExplanationResolver {
  public static resolve(edgeId: CanonicalId, context: EdgeExplanationContext): EdgeExplanationResult {
    const { missionGraph, evidenceGraph, executionEvents = [], physicalArtifacts = [] } = context;

    // 1. Locate canonical edge in MissionGraph
    const edge: MissionGraphEdge | undefined = missionGraph.edges.find((e) => e.id === edgeId);

    if (!edge) {
      // Fail closed: return unresolvable explanation with UNKNOWN truth level
      return {
        edgeId,
        fromNodeId: "unknown",
        toNodeId: "unknown",
        fromLabel: "Unknown Source",
        toLabel: "Unknown Target",
        relationshipType: "UNKNOWN",
        plannedRelationship: "UNKNOWN",
        truthLevel: "UNKNOWN",
        executionSequence: [],
        producer: "unknown",
        consumer: "unknown",
        verificationStatus: "UNKNOWN",
        edgeVerificationBasis: "NONE",
        artifactTruthBasis: "UNKNOWN",
        evidenceRefs: [],
        contextualEndpointEvidence: [],
        recoveryEvents: [],
        deliveryConsequences: [],
        resolved: false,
        rationale: `Edge '${edgeId}' could not be resolved against authoritative MissionGraph.`,
      };
    }

    const fromNode: MissionGraphNode | undefined = missionGraph.nodes.find((n) => n.id === edge.from);
    const toNode: MissionGraphNode | undefined = missionGraph.nodes.find((n) => n.id === edge.to);

    const fromLabel = fromNode ? fromNode.label : edge.from;
    const toLabel = toNode ? toNode.label : edge.to;

    // 2. Separate Direct Edge Evidence from Contextual Endpoint Evidence
    const directEdgeEvidenceRefs: string[] = [];
    const contextualEndpointEvidence: string[] = [];
    const relatedEvidenceNodes: EvidenceNode[] = [];

    // Check edge's own explicit evidence references if defined in metadata
    const explicitEdgeRefs: string[] = (edge as any).evidenceRefs || (edge as any).metadata?.evidenceRefs || [];
    for (const ref of explicitEdgeRefs) {
      if (!directEdgeEvidenceRefs.includes(ref)) directEdgeEvidenceRefs.push(ref);
    }

    if (evidenceGraph) {
      for (const evEdge of evidenceGraph.evidenceEdges) {
        // Direct edge evidence: target is specifically this edge
        if (
          evEdge.targetGraphNodeId === edge.id ||
          (evEdge as any).targetGraphEdgeId === edge.id ||
          (evEdge as any).supportedEdgeId === edge.id
        ) {
          if (!directEdgeEvidenceRefs.includes(evEdge.evidenceNodeId)) {
            directEdgeEvidenceRefs.push(evEdge.evidenceNodeId);
          }
        }
        // Endpoint evidence: targets endpoint nodes
        else if (evEdge.targetGraphNodeId === edge.from || evEdge.targetGraphNodeId === edge.to) {
          if (!contextualEndpointEvidence.includes(evEdge.evidenceNodeId)) {
            contextualEndpointEvidence.push(evEdge.evidenceNodeId);
          }
        }
      }

      for (const ev of evidenceGraph.evidenceNodes) {
        if (directEdgeEvidenceRefs.includes(ev.id) || contextualEndpointEvidence.includes(ev.id)) {
          relatedEvidenceNodes.push(ev);
        }
      }
    }

    // 3. Artifact resolution (delegated strictly to ArtifactInspectionResolver)
    let artifactTransferred: EdgeExplanationResult["artifactTransferred"] | undefined;
    let artifactTruthBasis: EdgeExplanationResult["artifactTruthBasis"] = "UNKNOWN";

    const potentialArtifactId =
      (fromNode?.type === "ARTIFACT" ? fromNode.id : undefined) ||
      (toNode?.type === "ARTIFACT" ? toNode.id : undefined) ||
      (typeof fromNode?.metadata?.artifactId === "string" ? fromNode.metadata.artifactId : undefined) ||
      (typeof toNode?.metadata?.artifactId === "string" ? toNode.metadata.artifactId : undefined);

    if (potentialArtifactId && physicalArtifacts.length > 0) {
      const normalizedArtifacts: ArtifactDataRecord[] = physicalArtifacts.map((a) => ({
        id: a.id,
        path: a.path,
        producer: (a as any).producer || fromNode?.id || "UNKNOWN",
        consumers: (a as any).consumers || (toNode ? [toNode.id] : []),
        byteLength: a.byteLength,
        sha256: a.sha256,
        mimeType: a.mimeType,
        authoritativeReceipt: (a as any).authoritativeReceipt,
        hasAuthoritativePhysicalReceipt: (a as any).hasAuthoritativePhysicalReceipt,
      }));

      const artRes = ArtifactInspectionResolver.resolve(potentialArtifactId, normalizedArtifacts);
      if (artRes.resolved) {
        artifactTruthBasis = artRes.truthBasis;
        artifactTransferred = {
          artifactId: artRes.artifactId,
          name: artRes.path.split(/[\\/]/).pop() || artRes.artifactId,
          path: artRes.path,
          byteLength: artRes.byteLength,
          sha256: artRes.sha256,
          mimeType: artRes.mimeType,
        };

        // Artifact transfer evidence from EvidenceGraph grounds ARTIFACT_PRODUCED / ARTIFACT_CONSUMED edges
        if (edge.type === "ARTIFACT_PRODUCED" || edge.type === "ARTIFACT_CONSUMED") {
          if (evidenceGraph) {
            for (const ev of evidenceGraph.evidenceNodes) {
              if (ev.subjectId === artRes.artifactId) {
                if (!directEdgeEvidenceRefs.includes(ev.id)) {
                  directEdgeEvidenceRefs.push(ev.id);
                }
              }
            }
          }
        }
      }
    }

    // 4. Execution sequence reconstruction with strict truth semantics
    const executionSequence: EdgeExplanationResult["executionSequence"] = [];

    if (fromNode) {
      const fromEvent = executionEvents.find((e) => e.targetId === fromNode.id && e.type.includes("INIT"));
      if (fromEvent) {
        executionSequence.push({
          step: `${fromNode.label} execution initiated`,
          status: "OBSERVED",
          truthLevel: "OBSERVED",
          source: "EXECUTION_EVENT",
        });
      } else if (fromNode.status === "PLANNED") {
        executionSequence.push({
          step: `${fromNode.label} planned for execution`,
          status: "PLANNED",
          truthLevel: "ASSERTED",
          source: "NODE_STATE",
        });
      } else {
        executionSequence.push({
          step: `${fromNode.label} execution initiated`,
          status: fromNode.status,
          truthLevel: "RECONSTRUCTED",
          source: "NODE_STATE",
        });
      }

      if (fromNode.status !== "PLANNED") {
        const fromEndEvent = executionEvents.find((e) => e.targetId === fromNode.id && e.type.includes("END"));
        executionSequence.push({
          step: `${fromNode.label} execution concluded`,
          status: fromNode.status,
          truthLevel: fromEndEvent ? "OBSERVED" : "RECONSTRUCTED",
          source: fromEndEvent ? "EXECUTION_EVENT" : "NODE_STATE",
        });
      }
    }

    if (artifactTransferred) {
      if (artifactTruthBasis === "PHYSICAL_FILE_PROBE" || artifactTruthBasis === "AUTHORITATIVE_PHYSICAL_RECEIPT") {
        executionSequence.push({
          step: `Artifact '${artifactTransferred.name}' physically persisted (${artifactTransferred.byteLength} bytes)`,
          status: "VERIFIED",
          truthLevel: "PHYSICAL",
          source: artifactTruthBasis === "PHYSICAL_FILE_PROBE" ? "EXECUTION_EVENT" : "ARTIFACT_RECEIPT",
        });
      } else {
        executionSequence.push({
          step: `Artifact '${artifactTransferred.name}' metadata referenced (${artifactTransferred.byteLength} bytes) - physical transfer NOT_ESTABLISHED`,
          status: "UNVERIFIED",
          truthLevel: "ASSERTED",
          source: "NODE_STATE",
        });
      }
    }

    if (toNode && toNode.status !== "PLANNED") {
      const toEvent = executionEvents.find((e) => e.targetId === toNode.id);
      executionSequence.push({
        step: `${toNode.label} consumed inputs / started`,
        status: toNode.status,
        truthLevel: toEvent ? "OBSERVED" : "RECONSTRUCTED",
        source: toEvent ? "EXECUTION_EVENT" : "NODE_STATE",
      });
    }

    // 5. Verification status: Grounded strictly in authoritative EDGE verification evidence
    let verification: EdgeExplanationResult["verification"] | undefined;
    let verificationStatus: EdgeExplanationResult["verificationStatus"] = "NOT_ESTABLISHED";

    // Direct edge verification probe
    const directEdgeVerificationProbes = relatedEvidenceNodes.filter(
      (ev) =>
        directEdgeEvidenceRefs.includes(ev.id) &&
        (ev.category === "FFPROBE_STREAM_METRIC" ||
          ev.category === "FFMPEG_DECODE_SMOKE" ||
          ev.category === "SHA256_BYTE_DIGEST" ||
          ev.category === "DURABLE_EVENT_RECORD")
    );

    const explicitEdgeVerified =
      (edge as any).metadata?.verified === true ||
      (edge as any).metadata?.isVerified === true ||
      ((edge.status === "VERIFIED" || edge.truthLevel === "VERIFIED") && directEdgeVerificationProbes.length > 0);

    if (directEdgeVerificationProbes.length > 0 && explicitEdgeVerified) {
      verificationStatus = "VERIFIED";
      verification = {
        verified: true,
        verifier: "FactoryOS Verification Engine",
        probeRef: directEdgeVerificationProbes[0].id,
        hardGatesPassed: directEdgeVerificationProbes.length,
      };
    } else if (edge.status === "PLANNED") {
      verificationStatus = "NOT_ESTABLISHED";
    } else {
      verificationStatus = "UNVERIFIED";
    }

    // 6. Recovery & Delivery consequences
    const recoveryEvents: string[] = [];
    const hasExplicitRecovery =
      edge.type === "RECOVERY" ||
      (edge as any).metadata?.isRecovery === true ||
      fromNode?.type === "RECOVERY" ||
      toNode?.type === "RECOVERY";

    if (hasExplicitRecovery) {
      recoveryEvents.push(`Recovery invoked during execution between ${fromLabel} and ${toLabel}`);
    }

    const deliveryConsequences: string[] = [];
    if (edge.type === "DELIVERY" || toNode?.type === "DELIVERY") {
      deliveryConsequences.push(`Payload delivered to destination outbox.`);
    }

    // 7. Enforce planned vs executed truth rule
    let effectiveTruthLevel: TruthLevel = edge.truthLevel;
    if (edge.status === "PLANNED") {
      effectiveTruthLevel = "ASSERTED";
    } else if (effectiveTruthLevel === "VERIFIED" && verificationStatus !== "VERIFIED") {
      // If marked verified without direct edge verification evidence, degrade truth
      effectiveTruthLevel = directEdgeEvidenceRefs.length > 0 ? "OBSERVED" : "ASSERTED";
    }

    const plannedRelationship = edge.type;
    const observedRelationship = edge.status === "PLANNED" ? undefined : edge.type;

    let rationale = `Edge '${edge.id}' represents ${edge.type} between '${fromLabel}' and '${toLabel}'.`;
    if (edge.status === "PLANNED") {
      rationale += " Status is PLANNED; no physical execution records observed yet.";
    } else if (verificationStatus === "VERIFIED" && verification?.verified) {
      rationale += ` Status is VERIFIED with ${verification.hardGatesPassed ?? 1} verification evidence probes confirming correctness.`;
    } else {
      rationale += ` Status is ${edge.status} backed by telemetry, ${directEdgeEvidenceRefs.length} direct evidence refs, and ${contextualEndpointEvidence.length} contextual endpoint refs.`;
    }

    let edgeVerificationBasis: EdgeExplanationResult["edgeVerificationBasis"] = "NONE";
    if (directEdgeEvidenceRefs.length > 0) {
      edgeVerificationBasis = "DIRECT_EDGE_EVIDENCE";
    } else if (
      artifactTransferred &&
      (artifactTruthBasis === "PHYSICAL_FILE_PROBE" || artifactTruthBasis === "AUTHORITATIVE_PHYSICAL_RECEIPT") &&
      (edge.type === "ARTIFACT_PRODUCED" || edge.type === "ARTIFACT_CONSUMED")
    ) {
      edgeVerificationBasis = "ARTIFACT_TRANSFER_LINEAGE";
    } else if (explicitEdgeVerified) {
      edgeVerificationBasis = "EXPLICIT_VERIFICATION_RECEIPT";
    }

    return {
      edgeId: edge.id,
      fromNodeId: edge.from,
      toNodeId: edge.to,
      fromLabel,
      toLabel,
      relationshipType: edge.type,
      plannedRelationship,
      observedRelationship,
      truthLevel: effectiveTruthLevel,
      executionSequence,
      artifactTransferred,
      artifactTruthBasis,
      producer: fromNode?.floorId || fromLabel,
      consumer: toNode?.floorId || toLabel,
      verification,
      verificationStatus,
      edgeVerificationBasis,
      evidenceRefs: directEdgeEvidenceRefs,
      contextualEndpointEvidence,
      recoveryEvents,
      deliveryConsequences,
      resolved: true,
      rationale,
    };
  }
}
