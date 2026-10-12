export interface OKFSweepAttestationPayload {
  readonly schemaVersion: "1.0";
  readonly attestationType: "OKF_SWEEP";
  readonly repository: string;
  readonly commitSha: string;
  readonly branch: string;
  readonly corpusSha256: string;
  readonly envelopeSha256: string;
  readonly relevantRuleIds: readonly string[];
  readonly generatedAt: string;
  readonly generatorVersion: string;
}
export interface OKFSignedAttestation extends OKFSweepAttestationPayload {
  readonly signature: { algorithm: "Ed25519"; keyId: string; keyVersion: number; signatureHex: string; payloadSha256: string };
  readonly authority: "EVIDENCE_ONLY";
}

export function assertSweepAttestationPayload(value: OKFSweepAttestationPayload): void {
  if (value.schemaVersion !== "1.0") throw new Error("[OKF] invalid attestation schema");
  if (value.attestationType !== "OKF_SWEEP") throw new Error("[OKF] invalid attestation type");
  for (const [field, expected] of [["corpusSha256", /^[a-f0-9]{64}$/],["envelopeSha256", /^[a-f0-9]{64}$/]] as const) {
    const actual = field === "corpusSha256" ? value.corpusSha256 : value.envelopeSha256;
    if (typeof actual!=="string" || !expected.test(actual)) throw new Error(`[OKF] invalid ${field}`);
  }
  if (!value.commitSha || !value.repository || !value.branch) throw new Error("[OKF] repository identity is required");
  if (!value.relevantRuleIds.length) throw new Error("[OKF] attestation requires relevant rules");
}
