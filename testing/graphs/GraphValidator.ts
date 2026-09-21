import type { MissionGraphIR } from "./MissionGraph";
import type { EvidenceGraphIR } from "./EvidenceGraph";
import type { Finding } from "../model/Finding";

export interface GraphValidationResult {
  readonly valid: boolean;
  readonly findings: Finding[];
  readonly ungroundedNodeIds: string[];
  readonly danglingEdgeIds: string[];
}

export class GraphValidator {
  public static validate(
    missionGraph: MissionGraphIR,
    evidenceGraph?: EvidenceGraphIR
  ): GraphValidationResult {
    const findings: Finding[] = [];
    const nodeIds = new Set<string>();
    const ungroundedNodeIds: string[] = [];
    const danglingEdgeIds: string[] = [];

    // 1. Validate Schema and Node Identities
    if (!missionGraph.schemaVersion) {
      findings.push({
        id: "find_missing_schema_version",
        rule: "graph/schema-version-required",
        severity: "error",
        subject: missionGraph.missionId || "graph",
        evidence: ["missionGraph.schemaVersion is undefined"],
        expected: "Explicit schemaVersion string (e.g. '1.0.0')",
        observed: "undefined",
        rootCause: "Graph IR serialized without required version header",
        confidence: 1.0,
        supportedRepairs: [],
      });
    }

    for (const node of missionGraph.nodes) {
      if (!node.id || node.id.trim() === "") {
        findings.push({
          id: `find_empty_node_id_${findings.length}`,
          rule: "graph/node-id-required",
          severity: "critical",
          subject: "unknown_node",
          evidence: [JSON.stringify(node)],
          expected: "Non-empty string ID",
          observed: "empty or missing ID",
          confidence: 1.0,
          supportedRepairs: [],
        });
      } else if (nodeIds.has(node.id)) {
        findings.push({
          id: `find_duplicate_node_${node.id}`,
          rule: "graph/duplicate-node-id",
          severity: "critical",
          subject: node.id,
          evidence: [`Duplicate node identity: ${node.id}`],
          expected: "Unique node ID across graph",
          observed: `Duplicate entry for ${node.id}`,
          confidence: 1.0,
          supportedRepairs: [],
        });
      } else {
        nodeIds.add(node.id);
      }
    }

    // 2. Validate Edge Endpoints (No Dangling Edges)
    for (const edge of missionGraph.edges) {
      const fromExists = nodeIds.has(edge.from);
      const toExists = nodeIds.has(edge.to);

      if (!fromExists || !toExists) {
        danglingEdgeIds.push(edge.id);
        findings.push({
          id: `find_dangling_edge_${edge.id}`,
          rule: "graph/no-dangling-edges",
          severity: "error",
          subject: edge.id,
          evidence: [`Edge ${edge.id}: from=${edge.from} (exists:${fromExists}), to=${edge.to} (exists:${toExists})`],
          expected: "Both edge endpoints must exist in nodes collection",
          observed: `Dangling edge reference: ${!fromExists ? edge.from : edge.to} missing`,
          rootCause: "Edge declared pointing to undeclared node ID",
          confidence: 1.0,
          supportedRepairs: [],
        });
      }
    }

    // 3. Validate Evidence Grounding for Verified Nodes
    if (evidenceGraph) {
      const groundedNodeIds = new Set<string>(
        evidenceGraph.evidenceEdges.map((e) => e.targetGraphNodeId)
      );

      for (const node of missionGraph.nodes) {
        if (node.truthLevel === "VERIFIED" && !groundedNodeIds.has(node.id)) {
          ungroundedNodeIds.push(node.id);
          findings.push({
            id: `find_ungrounded_verified_node_${node.id}`,
            rule: "graph/evidence-grounding-required",
            severity: "error",
            subject: node.id,
            evidence: [`Node ${node.id} has truthLevel=VERIFIED but zero supporting evidence edges in EvidenceGraph`],
            expected: "VERIFIED node must have at least one supporting EvidenceEdge",
            observed: "No supporting evidence found in EvidenceGraph",
            rootCause: "Node marked VERIFIED without authoritative backing evidence",
            confidence: 1.0,
            supportedRepairs: [],
          });
        }
      }
    }

    return {
      valid: findings.filter((f) => f.severity === "error" || f.severity === "critical").length === 0,
      findings,
      ungroundedNodeIds,
      danglingEdgeIds,
    };
  }
}
