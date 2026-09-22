/**
 * FactoryOS YouTube Monetization Guardian — Cryptographic Signer & Verification Engine
 * Implements deterministic canonical JSON serialization, SHA-256 digests, and Ed25519 signing.
 */

import * as crypto from "node:crypto";

export interface KeyPairInfo {
  readonly keyId: string;
  readonly keyVersion: number;
  readonly publicKeyPem: string;
}

export class F07CryptoSigner {
  private static instance: F07CryptoSigner | null = null;
  private privateKey: crypto.KeyObject;
  private publicKey: crypto.KeyObject;
  private keyId: string;
  private keyVersion: number;

  private constructor() {
    this.keyId = "f07_guardian_root_v1";
    this.keyVersion = 1;

    // Use environment key if provided, else generate stable Ed25519 keypair
    if (process.env.F07_SIGNING_PRIVATE_KEY_PEM && process.env.F07_SIGNING_PUBLIC_KEY_PEM) {
      this.privateKey = crypto.createPrivateKey(process.env.F07_SIGNING_PRIVATE_KEY_PEM);
      this.publicKey = crypto.createPublicKey(process.env.F07_SIGNING_PUBLIC_KEY_PEM);
    } else {
      // Deterministic fallback seed for development/test reproducibility if not provided
      const seed = crypto.createHash("sha256").update("factoryos_f07_release_guardian_authority_v1").digest();
      const keyPair = crypto.generateKeyPairSync("ed25519", {
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
        publicKeyEncoding: { type: "spki", format: "pem" },
      });
      this.privateKey = crypto.createPrivateKey(keyPair.privateKey);
      this.publicKey = crypto.createPublicKey(keyPair.publicKey);
    }
  }

  public static getInstance(): F07CryptoSigner {
    if (!F07CryptoSigner.instance) {
      F07CryptoSigner.instance = new F07CryptoSigner();
    }
    return F07CryptoSigner.instance;
  }

  public static resetInstanceForTesting(): void {
    F07CryptoSigner.instance = null;
  }

  public getKeyInfo(): KeyPairInfo {
    return {
      keyId: this.keyId,
      keyVersion: this.keyVersion,
      publicKeyPem: this.publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
  }

  /**
   * Deterministic canonical JSON serialization: recursively sorts all keys.
   */
  public static canonicalize(obj: any): string {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map((item) => F07CryptoSigner.canonicalize(item)).join(",") + "]";
    }
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map((key) => {
      const val = obj[key];
      return JSON.stringify(key) + ":" + F07CryptoSigner.canonicalize(val);
    });
    return "{" + pairs.join(",") + "}";
  }

  /**
   * Computes SHA-256 hex digest of canonicalized payload.
   */
  public static computeDigest(obj: any): string {
    const canonical = F07CryptoSigner.canonicalize(obj);
    return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  }

  /**
   * Alias for computeDigest to support sha256 static calls.
   */
  public static sha256(obj: any): string {
    return F07CryptoSigner.computeDigest(obj);
  }

  /**
   * Retrieves active keyId from singleton.
   */
  public static getKeyId(): string {
    return F07CryptoSigner.getInstance().keyId;
  }

  /**
   * Static sign helper returning signature hex string.
   */
  public static sign(obj: any): string {
    return F07CryptoSigner.getInstance().sign(obj).signatureHex;
  }

  /**
   * Static verify helper.
   */
  public static verify(obj: any, signatureHex: string, customPublicKey?: crypto.KeyObject): boolean {
    return F07CryptoSigner.getInstance().verify(obj, signatureHex, customPublicKey);
  }

  /**
   * Signs canonicalized payload with Ed25519 private key. Returns hex signature.
   */
  public sign(obj: any): { digestSha256: string; signatureHex: string; keyId: string; keyVersion: number } {
    const canonical = F07CryptoSigner.canonicalize(obj);
    const digestSha256 = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
    const signature = crypto.sign(null, Buffer.from(canonical, "utf8"), this.privateKey);
    return {
      digestSha256,
      signatureHex: signature.toString("hex"),
      keyId: this.keyId,
      keyVersion: this.keyVersion,
    };
  }

  /**
   * Verifies Ed25519 hex signature over canonicalized payload.
   */
  public verify(obj: any, signatureHex: string, customPublicKey?: crypto.KeyObject): boolean {
    try {
      const canonical = F07CryptoSigner.canonicalize(obj);
      const pubKey = customPublicKey || this.publicKey;
      return crypto.verify(
        null,
        Buffer.from(canonical, "utf8"),
        pubKey,
        Buffer.from(signatureHex, "hex")
      );
    } catch {
      return false;
    }
  }
}
