import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

export interface OKFAttestationKeySource {
  readonly keyId: string;
  readonly keyVersion: number;
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
}

export interface OKFSignature {
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  readonly keyVersion: number;
  readonly signatureHex: string;
  readonly payloadSha256: string;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((key) => JSON.stringify(key) + ":" + canonicalize(obj[key])).join(",") + "}";
}

export class OKFAttestationSigner {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  public readonly keyId: string;
  public readonly keyVersion: number;

  public constructor(source: OKFAttestationKeySource) {
    if (!source.privateKeyPem || !source.publicKeyPem) throw new Error("[OKF] attestation key material is required");
    if (!source.keyId.trim()) throw new Error("[OKF] attestation keyId is required");
    this.privateKey = createPrivateKey(source.privateKeyPem);
    this.publicKey = createPublicKey(source.publicKeyPem);
    this.keyId = source.keyId;
    this.keyVersion = source.keyVersion;
  }

  public sign(payload: unknown): OKFSignature {
    const canonical = canonicalize(payload);
    const payloadSha256 = createHash("sha256").update(canonical, "utf8").digest("hex");
    const signatureHex = sign(null, Buffer.from(canonical, "utf8"), this.privateKey).toString("hex");
    return { algorithm: "Ed25519", keyId: this.keyId, keyVersion: this.keyVersion, signatureHex, payloadSha256 };
  }

  public verify(payload: unknown, signatureHex: string): boolean {
    try {
      const canonical = canonicalize(payload);
      return verify(null, Buffer.from(canonical, "utf8"), this.publicKey, Buffer.from(signatureHex, "hex"));
    } catch { return false; }
  }

  public static canonicalize(value: unknown): string { return canonicalize(value); }
  public static digest(payload: unknown): string { return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex"); }
}
