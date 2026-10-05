import { createPrivateKey, createPublicKey, sign, verify, KeyObject } from "node:crypto";

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
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`).join(",")}}`;
}

export class OKFAttestationSigner {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  public readonly keyId: string;
  public readonly keyVersion: number;

  public constructor(source: OKFAttestationKeySource) {
    if (!source.privateKeyPem || !source.publicKeyPem) throw new Error("[OKF] attestation key material is required");
    this.privateKey=createPrivateKey(source.privateKeyPem);
    this.publicKey=createPublicKey(source.publicKeyPem);
    this.keyId=source.keyId;
    this.keyVersion=source.keyVersion;
  }

  public sign(payload: unknown): OKFSignature {
    const canonical=canonicalize(payload);
    const digestSha256=Buffer.from(awaitSha256(canonical));
    const signature=sign(null,Buffer.from(canonical,"utf8"),this.privateKey);
    return {algorithm:"Ed25519",keyId:this.keyId,keyVersion:this.keyVersion,signatureHex:signature.toString("hex"),payloadSha256:digestSha256.toString("utf8")};
  }

  public verify(payload: unknown, signatureHex: string): boolean {
    const canonical=canonicalize(payload);
    return verify(null,Buffer.from(canonical,"utf8"),this.publicKey,Buffer.from(signatureHex,"hex"));
  }

  public static canonicalize(value: unknown): string { return canonicalize(value); }
}

function awaitSha256(value: string): string {
  return require("node:crypto").createHash("sha256").update(value,"utf8").digest("hex");
}
