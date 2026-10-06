import { createHash } from "node:crypto";
import type { CLMContextProposal } from "./ContextFabricContracts";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonicalize(record[key])).join(",") + "}";
}

export function fingerprintCLMShadowProposal(proposal: CLMContextProposal): string {
  const payload = {
    schemaVersion: proposal.schemaVersion,
    proposalId: proposal.proposalId,
    workspaceId: proposal.workspaceId,
    missionId: proposal.missionId,
    taskId: proposal.taskId,
    baseVersion: proposal.baseVersion,
    generatedAt: proposal.generatedAt,
    provenance: proposal.provenance,
    authorityScope: proposal.authorityScope,
    confidence: proposal.confidence,
    estimatedCost: proposal.estimatedCost,
    estimatedContextGrowthTokens: proposal.estimatedContextGrowthTokens,
    budget: proposal.budget,
    edits: proposal.edits,
    rationale: proposal.rationale,
  };
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}
