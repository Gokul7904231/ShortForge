import { VerificationReceiptVerifier, type VerificationReceipt } from "../verification/youtube/VerificationReceipt";
import type { MemoryGateProof } from "./MemorySemanticsContracts";

export interface TrustedMemoryProofAnchor {
  readonly kind: "F07_VERIFICATION_RECEIPT";
  readonly id: string;
  readonly digestSha256: string;
  readonly signerKeyId: string;
  readonly artifactSha256?: string;
}

/**
 * Converts an F07 VerificationReceipt into a trusted memory-proof anchor.
 * The receipt is cryptographically verified before the anchor can be created.
 */
export class MemoryProofAnchor {
  public static fromF07Receipt(receipt: VerificationReceipt): TrustedMemoryProofAnchor {
    const verification = VerificationReceiptVerifier.verify(receipt);
    if (!verification.valid) {
      throw new Error(
        "[MemoryProofAnchor] F07 VerificationReceipt is not authentic: " +
          (verification.reason ?? "verification failed"),
      );
    }

    if (!receipt.receiptDigestSha256 || !receipt.receiptSignature) {
      throw new Error("[MemoryProofAnchor] receipt digest/signature missing");
    }

    return {
      kind: "F07_VERIFICATION_RECEIPT",
      id: receipt.receiptId,
      digestSha256: receipt.receiptDigestSha256,
      signerKeyId: receipt.signerKeyId,
      artifactSha256: receipt.artifactSha256,
    };
  }

  public static bind(
    proof: Omit<MemoryGateProof, "anchor">,
    receipt: VerificationReceipt,
  ): MemoryGateProof {
    return {
      ...proof,
      anchor: this.fromF07Receipt(receipt),
    };
  }
}
