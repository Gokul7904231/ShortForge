import type { TruthLevel } from "../contracts/execution.contract";
import type { MissionRun } from "../model/MissionRun";

export type MissionNodeType =
  | "MISSION"
  | "GOAL"
  | "FLOOR"
  | "TASK_NODE"
  | "CAPABILITY"
  | "DECISION"
  | "ARTIFACT"
  | "VERIFICATION"
  | "DELIVERY"
  | "UI_STATE";

export interface MissionGraphNode {
  readonly id: string;
  readonly type: MissionNodeType;
  readonly label: string;
  readonly floorId?: string;
  readonly truthLevel: TruthLevel;
  readonly status: "PLANNED" | "OBSERVED" | "VERIFIED" | "FAILED" | "SKIPPED";
  readonly timestamp?: string;
  readonly metadata?: Record<string, unknown>;
}

export type MissionEdgeType =
  | "PLANNED_DEPENDENCY"
  | "EXECUTION_SEQUENCE"
  | "ARTIFACT_PRODUCED"
  | "ARTIFACT_CONSUMED"
  | "VERIFICATION"
  | "DELIVERY"
  | "EVIDENCE_SUPPORT"
  | "UI_ACTION";

export interface MissionGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: MissionEdgeType;
  readonly truthLevel: TruthLevel;
  readonly status: "PLANNED" | "OBSERVED" | "VERIFIED" | "FAILED";
  readonly label?: string;
}

export interface MissionGraphIR {
  readonly schemaVersion: string;
  readonly missionId: string;
  readonly runId: string;
  readonly nodes: MissionGraphNode[];
  readonly edges: MissionGraphEdge[];
  readonly createdAt: string;
}

const CANONICAL_PIPELINE_FLOORS = [
  "floor00_analyst",
  "floor01_strategy",
  "floor02_scripting",
  "floor03_asset_realization",
  "floor04_media_synthesis",
  "floor05_timeline_composition",
  "floor06_rendering",
  "floor07_compliance",
];

export class MissionGraphBuilder {
  public static fromMissionRun(run: MissionRun): MissionGraphIR {
    const nodes: MissionGraphNode[] = [];
    const edges: MissionGraphEdge[] = [];
    const nodeMap = new Map<string, MissionGraphNode>();

    const addOrUpdateNode = (node: MissionGraphNode) => {
      const existing = nodeMap.get(node.id);
      if (existing) {
        // Upgrade status if new status is more authoritative
        const priority: Record<string, number> = { PLANNED: 0, INFERRED: 1, ASSERTED: 2, OBSERVED: 3, VERIFIED: 4 };
        if ((priority[node.truthLevel] || 0) > (priority[existing.truthLevel] || 0)) {
          const idx = nodes.findIndex((n) => n.id === node.id);
          if (idx !== -1) nodes[idx] = node;
          nodeMap.set(node.id, node);
        }
      } else {
        nodeMap.set(node.id, node);
        nodes.push(node);
      }
    };

    // 1. Root Mission Node
    addOrUpdateNode({
      id: `node_${run.missionId}`,
      type: "MISSION",
      label: `Mission: ${run.goal}`,
      truthLevel: "OBSERVED",
      status: run.finalVerdict === "PASS" ? "VERIFIED" : "OBSERVED",
      timestamp: run.startedAt,
    });

    // 2. Populate Planned Pipeline Skeleton
    for (let i = 0; i < CANONICAL_PIPELINE_FLOORS.length; i++) {
      const floorId = CANONICAL_PIPELINE_FLOORS[i];
      const floorNodeId = `node_${floorId}`;
      addOrUpdateNode({
        id: floorNodeId,
        type: "FLOOR",
        label: `Floor: ${floorId}`,
        floorId,
        truthLevel: "INFERRED",
        status: "PLANNED",
      });

      if (i > 0) {
        const prevFloorId = CANONICAL_PIPELINE_FLOORS[i - 1];
        edges.push({
          id: `edge_plan_${prevFloorId}_to_${floorId}`,
          from: `node_${prevFloorId}`,
          to: floorNodeId,
          type: "PLANNED_DEPENDENCY",
          truthLevel: "INFERRED",
          status: "PLANNED",
        });
      }
    }

    // 3. Update with Observed Floor & Decision Events
    let prevObservedNodeId: string | null = null;
    for (const evt of run.events) {
      if (evt.action.type === "floor_complete" || (evt.actor.floor && evt.action.type === "floor_start")) {
        const floorId = evt.actor.floor || evt.subjectId;
        const floorNodeId = `node_${floorId}`;

        addOrUpdateNode({
          id: floorNodeId,
          type: "FLOOR",
          label: `Floor: ${floorId}`,
          floorId,
          truthLevel: evt.truthLevel,
          status: "OBSERVED",
          timestamp: evt.timestamp,
          metadata: evt.metadata,
        });

        // Update corresponding planned edge to OBSERVED sequence edge
        if (prevObservedNodeId) {
          const existingEdge = edges.find((e) => e.from === prevObservedNodeId && e.to === floorNodeId);
          if (existingEdge) {
            (existingEdge as any).type = "EXECUTION_SEQUENCE";
            (existingEdge as any).truthLevel = "OBSERVED";
            (existingEdge as any).status = "OBSERVED";
          } else {
            edges.push({
              id: `edge_seq_${prevObservedNodeId}_to_${floorNodeId}`,
              from: prevObservedNodeId,
              to: floorNodeId,
              type: "EXECUTION_SEQUENCE",
              truthLevel: "OBSERVED",
              status: "OBSERVED",
            });
          }
        }
        prevObservedNodeId = floorNodeId;
      }

      if (evt.action.type === "decision") {
        const decId = `node_decision_${evt.id}`;
        addOrUpdateNode({
          id: decId,
          type: "DECISION",
          label: `Decision: ${evt.action.name || "Overseer"}`,
          truthLevel: "OBSERVED",
          status: "OBSERVED",
          timestamp: evt.timestamp,
          metadata: evt.metadata,
        });
        edges.push({
          id: `edge_dec_${evt.id}`,
          from: `node_${run.missionId}`,
          to: decId,
          type: "EXECUTION_SEQUENCE",
          truthLevel: "OBSERVED",
          status: "OBSERVED",
        });
      }
    }

    // 3. Artifact Nodes & Lineage Edges
    for (const art of run.artifacts) {
      const artNodeId = `node_art_${art.id}`;
      addOrUpdateNode({
        id: artNodeId,
        type: "ARTIFACT",
        label: `${art.kind} (${art.byteLength} bytes)`,
        floorId: art.producerFloor,
        truthLevel: art.existsPhysically ? "VERIFIED" : "ASSERTED",
        status: art.existsPhysically ? "VERIFIED" : "PLANNED",
        metadata: {
          sha256: art.sha256,
          byteLength: art.byteLength,
          localPath: art.localPath,
        },
      });

      // Producer Floor -> Artifact
      edges.push({
        id: `edge_prod_${art.producerFloor}_${art.id}`,
        from: `node_${art.producerFloor}`,
        to: artNodeId,
        type: "ARTIFACT_PRODUCED",
        truthLevel: "VERIFIED",
        status: "VERIFIED",
      });

      // Artifact -> Consumer Floor
      if (art.consumerFloor) {
        edges.push({
          id: `edge_cons_${art.id}_${art.consumerFloor}`,
          from: artNodeId,
          to: `node_${art.consumerFloor}`,
          type: "ARTIFACT_CONSUMED",
          truthLevel: "VERIFIED",
          status: "VERIFIED",
        });
      }
    }

    // 4. Lineage Edges recorded directly in run
    for (const lin of run.lineage) {
      const artNodeId = `node_art_${lin.artifactId}`;
      const prodNodeId = `node_${lin.producerFloor}`;
      const consNodeId = `node_${lin.consumerFloor}`;

      if (nodeMap.has(prodNodeId) && nodeMap.has(artNodeId)) {
        const edgeId = `edge_lin_prod_${lin.producerFloor}_${lin.artifactId}`;
        if (!edges.some((e) => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            from: prodNodeId,
            to: artNodeId,
            type: "ARTIFACT_PRODUCED",
            truthLevel: "VERIFIED",
            status: "VERIFIED",
          });
        }
      }

      if (nodeMap.has(artNodeId) && nodeMap.has(consNodeId)) {
        const edgeId = `edge_lin_cons_${lin.artifactId}_${lin.consumerFloor}`;
        if (!edges.some((e) => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            from: artNodeId,
            to: consNodeId,
            type: "ARTIFACT_CONSUMED",
            truthLevel: "VERIFIED",
            status: "VERIFIED",
          });
        }
      }
    }

    // 5. Verification Node
    if (run.verificationResult) {
      const verNodeId = "node_verification_f07";
      addOrUpdateNode({
        id: verNodeId,
        type: "VERIFICATION",
        label: `F7 Probe: ${run.verificationResult.overallStatus || "PASSED"}`,
        floorId: "floor07_compliance",
        truthLevel: "VERIFIED",
        status: "VERIFIED",
        metadata: run.verificationResult,
      });

      edges.push({
        id: "edge_ver_compliance",
        from: "node_floor07_compliance",
        to: verNodeId,
        type: "VERIFICATION",
        truthLevel: "VERIFIED",
        status: "VERIFIED",
      });
    }

    // 6. Delivery Node
    if (run.deliveryRecord) {
      const delNodeId = "node_delivery_outbox";
      addOrUpdateNode({
        id: delNodeId,
        type: "DELIVERY",
        label: `Delivery: ${run.deliveryRecord.method}`,
        truthLevel: run.deliveryRecord.verified ? "VERIFIED" : "ASSERTED",
        status: run.deliveryRecord.verified ? "VERIFIED" : "FAILED",
        metadata: { ...run.deliveryRecord },
      });

      edges.push({
        id: "edge_delivery_handoff",
        from: "node_floor07_compliance",
        to: delNodeId,
        type: "DELIVERY",
        truthLevel: "VERIFIED",
        status: "VERIFIED",
      });
    }

    // 7. UI State & Browser Interaction Node
    if (run.browserRecord && run.browserRecord.records.length > 0) {
      const uiNodeId = "node_ui_state";
      const hasFailure = run.browserRecord.status === "FAIL" || run.browserRecord.records.some((r) => (r.metadata as any)?.isFailure || (r.metadata as any)?.level === "error");
      addOrUpdateNode({
        id: uiNodeId,
        type: "UI_STATE",
        label: `UI: ${run.browserRecord.records[0].page || "ShortForge Dashboard"}`,
        truthLevel: "OBSERVED",
        status: hasFailure ? "FAILED" : run.browserRecord.status === "PASS" ? "VERIFIED" : "OBSERVED",
        metadata: {
          executionMode: run.browserRecord.executionMode,
          status: run.browserRecord.status,
          targetUrl: run.browserRecord.targetUrl,
          totalRecords: run.browserRecord.records.length,
        },
      });

      edges.push({
        id: "edge_mission_to_ui",
        from: `node_${run.missionId}`,
        to: uiNodeId,
        type: "UI_ACTION",
        truthLevel: "OBSERVED",
        status: "OBSERVED",
      });
    }

    return {
      schemaVersion: "1.0.0",
      missionId: run.missionId,
      runId: run.runId,
      nodes,
      edges,
      createdAt: new Date().toISOString(),
    };
  }
}
