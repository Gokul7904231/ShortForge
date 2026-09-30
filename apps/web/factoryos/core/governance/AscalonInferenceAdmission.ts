import { createHash } from "node:crypto";
import type { ActionProposal, FloorSnapshot } from "./FloorGovernanceContracts";

export type AscalonInferenceMode = "SHADOW" | "ADMITTED";

export interface AscalonInferenceMetadata {
  readonly inferenceId: string;
  readonly modelRef: string;
  readonly adapterVersion: string;
  readonly mode: AscalonInferenceMode;
  readonly contextFingerprint: string;
  readonly observedAt: string;
}

export interface AscalonInferenceEnvelope {
  readonly metadata: AscalonInferenceMetadata;
  readonly proposal: ActionProposal;
}

export interface AscalonAdmissionDecision {
  readonly admitted: boolean;
  readonly shadowOnly: boolean;
  readonly reason: string;
  readonly contextFingerprint: string;
  readonly proposal?: ActionProposal;
}

function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item
  ) ?? "null";
}

export function fingerprintAscalonContext(
  snapshot: FloorSnapshot,
  availableActions: readonly string[],
  evidenceRefs: readonly string[],
): string {
  return createHash("sha256")
    .update(
      canonicalize({
        floorId: snapshot.floorId,
        state: snapshot.state,
        stateVersion: snapshot.stateVersion,
        observedAt: snapshot.observedAt,
        constraints: snapshot.constraints,
        activeIncidents: snapshot.activeIncidents,
        availableActions: [...availableActions].sort(),
        evidenceRefs: [...evidenceRefs].sort(),
      }),
      "utf8",
    )
    .digest("hex");
}

export class AscalonInferenceAdmissionGate {
  constructor(
    private readonly minConfidence = 0.7,
    private readonly allowedModelRefs: ReadonlySet<string> = new Set(),
  ) {}

  evaluate(input: {
    snapshot: FloorSnapshot;
    availableActions: readonly string[];
    verifiedEvidenceRefs: readonly string[];
    envelope: AscalonInferenceEnvelope;
  }): AscalonAdmissionDecision {
    const expectedFingerprint = fingerprintAscalonContext(
      input.snapshot,
      input.availableActions,
      input.verifiedEvidenceRefs,
    );

    const { metadata, proposal } = input.envelope;
    const failures: string[] = [];

    if (proposal.proposer !== "ASCALON") failures.push("proposal_proposer_not_ascalon");
    if (proposal.floorId !== input.snapshot.floorId) failures.push("proposal_floor_mismatch");
    if (proposal.stateVersion !== input.snapshot.stateVersion) failures.push("proposal_state_version_stale");
    if (!input.availableActions.includes(proposal.actionName)) failures.push("action_not_available");
    if (proposal.inputTrust === "UNTRUSTED_EVIDENCE") failures.push("proposal_input_untrusted");
    if (typeof proposal.confidence !== "number" || proposal.confidence < this.minConfidence) {
      failures.push("proposal_confidence_below_threshold");
    }
    if (!metadata.modelRef.trim()) failures.push("model_ref_missing");
    if (!metadata.adapterVersion.trim()) failures.push("adapter_version_missing");
    if (metadata.contextFingerprint !== expectedFingerprint) failures.push("context_fingerprint_mismatch");
    if (this.allowedModelRefs.size === 0) {
      failures.push("model_ref_allowlist_not_configured");
    } else if (!this.allowedModelRefs.has(metadata.modelRef)) {
      failures.push("model_ref_not_allowlisted");
    }

    if (metadata.mode === "SHADOW") {
      return {
        admitted: false,
        shadowOnly: true,
        reason: failures.length ? failures.join(",") : "shadow_inference_recorded_without_runtime_admission",
        contextFingerprint: expectedFingerprint,
      };
    }

    if (failures.length > 0) {
      return {
        admitted: false,
        shadowOnly: false,
        reason: failures.join(","),
        contextFingerprint: expectedFingerprint,
      };
    }

    return {
      admitted: true,
      shadowOnly: false,
      reason: "ascalon_inference_admitted_to_council_only",
      contextFingerprint: expectedFingerprint,
      proposal,
    };
  }
}
