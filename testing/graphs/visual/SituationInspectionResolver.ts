/**
 * FactoryOS v1 / Frontier v3 — Situation Inspection Resolver (Correctness Hardened)
 * Resolves SituationRecord communications into structured inspection data.
 * Guarantees that the tripartite TEXT + GRAPH + EVIDENCE contract is strictly preserved
 * without semantic loss, synthetic truncation, or lossy identity normalization.
 *
 * Correctness Invariants:
 * - Canonical evidence IDs are preserved exactly.
 * - Raw URI/path references without a canonical ID are traced against EvidenceGraph.
 * - If untraced, raw URI/path references are marked as UNRESOLVED_REFERENCE,
 *   never mislabeled as canonical EvidenceGraph IDs.
 */

import type { SituationRecord } from "../../model/SituationRecord";
import type { EvidenceGraphIR } from "../EvidenceGraph";
import type { SituationInspectionResult } from "./InteractionIR";

export class SituationInspectionResolver {
  public static resolve(
    situationId: string,
    records: SituationRecord[] = [],
    evidenceGraph?: EvidenceGraphIR
  ): SituationInspectionResult {
    const rec = records.find((r) => r.id === situationId);

    if (!rec) {
      return {
        situationId,
        missionId: "UNKNOWN",
        sender: { agentId: "UNKNOWN", role: "UNKNOWN" },
        recipients: [],
        priority: "NORMAL",
        type: "UNKNOWN",
        text: "Unresolved SituationRecord",
        graphNodesCount: 0,
        graphEdgesCount: 0,
        evidenceRefs: [],
        unresolvedReferences: [],
        createdAt: new Date().toISOString(),
        resolved: false,
      };
    }

    const canonicalEvidenceRefs: string[] = [];
    const unresolvedReferences: string[] = [];
    const sourceEvidenceRefs: Array<{
      source: string;
      canonicalId?: string;
      resolved: boolean;
    }> = [];

    for (const ev of rec.evidence || []) {
      const explicitId = (ev as any).evidenceId || (ev as any).id;
      const uriOrPath = ev.uriOrPath;
      const originalSource = uriOrPath || explicitId || (ev as any).description || "UNRESOLVED_REFERENCE";

      // STEP 1: If explicit evidence ID exists, verify against EvidenceGraphIR
      if (explicitId && typeof explicitId === "string") {
        const match = evidenceGraph?.evidenceNodes.find((n) => n.id === explicitId);
        if (match) {
          canonicalEvidenceRefs.push(match.id);
          sourceEvidenceRefs.push({ source: explicitId, canonicalId: match.id, resolved: true });
        } else {
          // Never trust naming convention (e.g. startsWith('ev_')) without EvidenceGraph existence!
          unresolvedReferences.push(explicitId);
          sourceEvidenceRefs.push({ source: explicitId, resolved: false });
        }
      }
      // STEP 2: If only URI/path exists, resolve against EvidenceGraphIR
      else if (uriOrPath && typeof uriOrPath === "string") {
        const match = evidenceGraph?.evidenceNodes.find(
          (n) => n.physicalPath === uriOrPath || n.subjectId === uriOrPath || n.id === uriOrPath
        );
        if (match) {
          canonicalEvidenceRefs.push(match.id);
          sourceEvidenceRefs.push({ source: uriOrPath, canonicalId: match.id, resolved: true });
        } else {
          unresolvedReferences.push(uriOrPath);
          sourceEvidenceRefs.push({ source: uriOrPath, resolved: false });
        }
      }
      // STEP 3: Malformed or ungrounded reference
      else {
        unresolvedReferences.push("UNRESOLVED_REFERENCE");
        sourceEvidenceRefs.push({ source: originalSource, resolved: false });
      }
    }

    const uniqueCanonical = Array.from(new Set(canonicalEvidenceRefs));
    const uniqueUnresolved = Array.from(new Set(unresolvedReferences));

    return {
      situationId: rec.id,
      missionId: rec.missionId,
      runId: rec.runId,
      sender: {
        agentId: rec.sender.agentId,
        role: rec.sender.role,
        floorId: rec.sender.floorId,
      },
      recipients: [...rec.recipients],
      priority: rec.priority,
      type: rec.type,
      text: rec.text, // Preserves original text verbatim
      graphNodesCount: rec.graph?.nodes?.length ?? 0,
      graphEdgesCount: rec.graph?.edges?.length ?? 0,
      evidenceRefs: uniqueCanonical,
      canonicalEvidenceRefs: uniqueCanonical,
      unresolvedReferences: uniqueUnresolved,
      sourceEvidenceRefs,
      createdAt: rec.createdAt,
      resolved: true,
    };
  }
}
