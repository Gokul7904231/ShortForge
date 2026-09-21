/**
 * ShortForge / FactoryOS — Memory Writer Contracts
 * Controlled write pipeline enforcing sanitization, deduplication, provenance, and policy.
 */

import { KnowledgeContentType, KnowledgeDocument, KnowledgeProvenance } from "../knowledge/OKFContracts";

export interface CandidateMemoryProposal {
  readonly title: string;
  readonly type: KnowledgeContentType;
  readonly content: string;
  readonly tags?: string[];
  readonly provenance: KnowledgeProvenance;
  readonly confidenceScore?: number;
  readonly isVerified?: boolean;
  readonly isDisputed?: boolean;
  readonly verificationEvidence?: any;
}

export interface MemoryWritePolicyResult {
  readonly accepted: boolean;
  readonly reason: string;
  readonly category: "AUTO_ACCEPT" | "REQUIRES_VERIFICATION" | "REJECTED_NOISE" | "REJECTED_DISPUTED";
}

export interface IMemoryWriter {
  evaluatePolicy(proposal: CandidateMemoryProposal): MemoryWritePolicyResult;
  proposeAndCommit(proposal: CandidateMemoryProposal): Promise<KnowledgeDocument>;
}
