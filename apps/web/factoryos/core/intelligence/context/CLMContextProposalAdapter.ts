/**
 * CLM context-policy shadow adapter.
 *
 * This adapter is a typed seam only. It is not wired into production by
 * default, does not own context state, and can only return ContextEdit
 * proposals to ContextFabric for deterministic validation.
 */

import { randomUUID } from "node:crypto";
import type {
  CLMContextProposal,
  CLMContextProposalPort,
  CLMContextProposalRequest,
  ContextEdit,
} from "../../cognitive/context/ContextFabricContracts";
import { fingerprintCLMShadowProposal } from "../../cognitive/context/ContextProposalIntegrity";

export interface CLMContextProposalModelOutput {
  readonly edits: readonly ContextEdit[];
  readonly confidence: number;
  readonly estimatedCost: number;
  readonly estimatedContextGrowthTokens: number;
  readonly rationale: string;
  readonly modelVersion?: string;
}

export type CLMContextProposalGenerator = (
  request: CLMContextProposalRequest,
) => Promise<CLMContextProposalModelOutput>;

export interface CLMContextProposalAdapterConfig {
  readonly modelRef: string;
  readonly modelVersion: string;
  readonly enabled?: boolean;
  readonly generator: CLMContextProposalGenerator;
}

export class CLMContextProposalAdapter implements CLMContextProposalPort {
  public readonly modelRef: string;

  private readonly modelVersion: string;
  private readonly enabled: boolean;
  private readonly generator: CLMContextProposalGenerator;

  public constructor(config: CLMContextProposalAdapterConfig) {
    if (!config.modelRef.trim()) throw new Error("CLM modelRef is required");
    if (!config.modelVersion.trim()) throw new Error("CLM modelVersion is required");

    this.modelRef = config.modelRef;
    this.modelVersion = config.modelVersion;
    this.enabled = config.enabled ?? false;
    this.generator = config.generator;
  }

  public async propose(request: CLMContextProposalRequest): Promise<CLMContextProposal> {
    if (!this.enabled) {
      throw new Error("CLM context shadow adapter is disabled by policy");
    }

    const output = await this.generator(request);
    const proposalWithoutFingerprint: Omit<CLMContextProposal, "proposalFingerprint"> = {
      schemaVersion: "1.0.0",
      proposalId: "clmctx_" + randomUUID().replaceAll("-", ""),
      workspaceId: request.workspace.workspaceId,
      missionId: request.workspace.missionId,
      taskId: request.workspace.taskId,
      baseVersion: request.workspace.version,
      generatedAt: new Date().toISOString(),
      provenance: {
        source: "CLM_SHADOW",
        modelRef: this.modelRef,
        modelVersion: output.modelVersion?.trim() || this.modelVersion,
        traceId: request.traceId,
        policyVersion: request.policyVersion,
      },
      authorityScope: "WORKING_CONTEXT_ONLY",
      confidence: output.confidence,
      estimatedCost: output.estimatedCost,
      estimatedContextGrowthTokens: output.estimatedContextGrowthTokens,
      budget: request.budget,
      edits: output.edits,
      rationale: output.rationale,
    };

    const proposal: CLMContextProposal = {
      ...proposalWithoutFingerprint,
      proposalFingerprint: fingerprintCLMShadowProposal({
        ...proposalWithoutFingerprint,
        proposalFingerprint: "",
      }),
    };

    return proposal;
  }
}
