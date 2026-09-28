/**
 * FactoryOS Frontier v2 — Contradiction Resolution Engine
 * Detects agent and telemetry disagreements, constructs diagnostic disambiguation tests, and resolves evidence conflicts.
 */

import { randomUUID } from "node:crypto";
import type { ConflictRecord } from "../CognitiveContracts";
import type { EvidenceGraphEngine } from "../graph/EvidenceGraphEngine";

export interface DisambiguationProbeResult {
  readonly supportedClaim: "A" | "B" | "SYNTHESIS" | "NEITHER";
  readonly objectiveMetrics: Record<string, unknown>;
  readonly confidence: number;
  readonly rationale: string;
}

export class ContradictionResolver {
  private conflicts: Map<string, ConflictRecord> = new Map();

  constructor(private evidenceGraph: EvidenceGraphEngine) {}

  detectConflict(
    caseId: string,
    claimA: { claimant: string; claim: string; evidenceIds: string[] },
    claimB: { claimant: string; claim: string; evidenceIds: string[] },
    telemetry?: { metrics: Record<string, unknown>; supports: "A" | "B" | "NEITHER" }
  ): ConflictRecord {
    const conflictId = `conf_${randomUUID().replace(/-/g, "").substring(0, 8)}`;

    const conflict: ConflictRecord = {
      conflictId,
      caseId,
      claimA: structuredClone(claimA),
      claimB: structuredClone(claimB),
      telemetryPerspective: telemetry ? structuredClone(telemetry) : undefined,
      status: "DETECTED",
    };

    this.conflicts.set(conflictId, conflict);

    // Record contradictory edge in evidence graph if nodes exist
    try {
      const g = this.evidenceGraph.getGraph(caseId);
      if (g) {
        const nodeA = Object.values(g.nodes).find((n) => n.title.includes(claimA.claim) || n.source === claimA.claimant);
        const nodeB = Object.values(g.nodes).find((n) => n.title.includes(claimB.claim) || n.source === claimB.claimant);
        if (nodeA && nodeB) {
          this.evidenceGraph.addEdge(caseId, {
            fromNodeId: nodeA.nodeId,
            toNodeId: nodeB.nodeId,
            relationship: "CONTRADICTS",
            explanation: `Conflict between ${claimA.claimant} ("${claimA.claim}") and ${claimB.claimant} ("${claimB.claim}")`,
          });
        }
      }
    } catch {
      // Non-fatal
    }

    return structuredClone(conflict);
  }

  resolveConflict(conflictId: string, probe: DisambiguationProbeResult): ConflictRecord {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

    let selectedClaim: "A" | "B" | "SYNTHESIS" = "A";
    if (probe.supportedClaim === "B") selectedClaim = "B";
    else if (probe.supportedClaim === "SYNTHESIS" || probe.supportedClaim === "NEITHER") selectedClaim = "SYNTHESIS";

    conflict.status = "RESOLVED";
    conflict.selectedClaim = selectedClaim;
    conflict.resolutionRationale = probe.rationale;
    conflict.resolutionConfidence = probe.confidence;
    conflict.resolvedAt = new Date().toISOString();

    return structuredClone(conflict);
  }

  /**
   * Autonomously executes a diagnostic probe against objective telemetry metrics to derive the resolution.
   */
  executeAutomatedDiagnosticProbe(
    conflictId: string,
    objectiveMetrics: { hostCpuPercent?: number; tcpRetransmits?: number; diskIoWaitMs?: number; [key: string]: unknown }
  ): ConflictRecord {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

    let supportedClaim: "A" | "B" | "SYNTHESIS" | "NEITHER" = "NEITHER";
    let rationale = "";
    let confidence = 0.95;

    // Evaluate metrics against claims
    const claimAText = `${conflict.claimA.claim}`.toLowerCase();
    const claimBText = `${conflict.claimB.claim}`.toLowerCase();

    const isCpuIssue = (objectiveMetrics.hostCpuPercent ?? 0) > 85;
    const isNetworkSocketIssue = (objectiveMetrics.tcpRetransmits ?? 0) > 20;
    const driveAvailable = objectiveMetrics.driveAvailable;
    const vramUsedMb = Number(objectiveMetrics.vramUsedMb ?? 0);
    const vramTotalMb = Number(objectiveMetrics.vramTotalMb ?? 8192);
    const vramSaturated = vramTotalMb > 0 && vramUsedMb / vramTotalMb >= 0.9;

    if (claimAText.includes("disk") && driveAvailable === false) {
      supportedClaim = "A";
      rationale = "Diagnostic probe confirmed the drive is unavailable, supporting the storage/disk failure claim.";
    } else if (
      (claimBText.includes("gpu") || claimBText.includes("vram")) &&
      vramSaturated
    ) {
      supportedClaim = "B";
      rationale = `Diagnostic probe confirmed GPU VRAM saturation at ${vramUsedMb}/${vramTotalMb} MB.`;
    } else if (claimAText.includes("cpu") && isCpuIssue && !isNetworkSocketIssue) {
      supportedClaim = "A";
      rationale = `Diagnostic probe confirmed Host CPU Saturation (${objectiveMetrics.hostCpuPercent}%), while socket buffers remained normal.`;
    } else if (claimBText.includes("tcp") || claimBText.includes("socket") || claimBText.includes("buffer")) {
      if (isNetworkSocketIssue && !isCpuIssue) {
        supportedClaim = "B";
        rationale = `Diagnostic probe confirmed TCP Socket Buffer Saturation (${objectiveMetrics.tcpRetransmits} retransmits), while CPU was nominal (${objectiveMetrics.hostCpuPercent}%).`;
      }
    }

    if (supportedClaim === "NEITHER") {
      if (isCpuIssue && isNetworkSocketIssue) {
        supportedClaim = "SYNTHESIS";
        rationale = "Compound degradation: both CPU and Network saturation confirmed.";
      } else {
        supportedClaim = "A";
        rationale = "Probe results inconclusive; defaulting to primary sensor evidence with lower confidence.";
        confidence = 0.6;
      }
    }

    return this.resolveConflict(conflictId, {
      supportedClaim,
      objectiveMetrics,
      confidence,
      rationale,
    });
  }

  getConflict(conflictId: string): ConflictRecord | undefined {
    const item = this.conflicts.get(conflictId);
    return item ? structuredClone(item) : undefined;
  }

  getConflictsForCase(caseId: string): ConflictRecord[] {
    return Array.from(this.conflicts.values())
      .filter((c) => c.caseId === caseId)
      .map((c) => structuredClone(c));
  }
}
