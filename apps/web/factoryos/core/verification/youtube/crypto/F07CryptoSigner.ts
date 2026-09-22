/**
 * FactoryOS YouTube Monetization Guardian — Cryptographic Signer & Verification Engine
 * Implements deterministic canonical JSON serialization, SHA-256 digests, and Ed25519 signing.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { F07TrustedKeyStore } from "./F07TrustedKeyStore";

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

    // 1. Environment keys take highest precedence
    if (process.env.F07_SIGNING_PRIVATE_KEY_PEM && process.env.F07_SIGNING_PUBLIC_KEY_PEM) {
      this.privateKey = crypto.createPrivateKey(process.env.F07_SIGNING_PRIVATE_KEY_PEM);
      this.publicKey = crypto.createPublicKey(process.env.F07_SIGNING_PUBLIC_KEY_PEM);
    } else {
      // 2. Load or persist stable durable keypair on disk to survive process restarts
      const keysDir = path.resolve(process.cwd(), "data", "keys");
      const privPath = path.join(keysDir, `${this.keyId}.priv.pem`);
      const pubPath = path.join(keysDir, `${this.keyId}.pub.pem`);

      if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
        try {
          const privPem = fs.readFileSync(privPath, "utf8");
          const pubPem = fs.readFileSync(pubPath, "utf8");
          this.privateKey = crypto.createPrivateKey(privPem);
          this.publicKey = crypto.createPublicKey(pubPem);
        } catch {
          // Fallback to generation if file corrupted
          const keyPair = crypto.generateKeyPairSync("ed25519", {
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
            publicKeyEncoding: { type: "spki", format: "pem" },
          });
          this.privateKey = crypto.createPrivateKey(keyPair.privateKey);
          this.publicKey = crypto.createPublicKey(keyPair.publicKey);
        }
      } else {
        if (!fs.existsSync(keysDir)) {
          fs.mkdirSync(keysDir, { recursive: true });
        }
        const keyPair = crypto.generateKeyPairSync("ed25519", {
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
          publicKeyEncoding: { type: "spki", format: "pem" },
        });
        this.privateKey = crypto.createPrivateKey(keyPair.privateKey);
        this.publicKey = crypto.createPublicKey(keyPair.publicKey);
        try {
          fs.writeFileSync(privPath, keyPair.privateKey, "utf8");
          fs.writeFileSync(pubPath, keyPair.publicKey, "utf8");
        } catch {}
      }
    }

    // Register active root key into trusted key store
    F07TrustedKeyStore.getInstance().registerTrustedKey({
      keyId: this.keyId,
      keyVersion: this.keyVersion,
      publicKeyPem: this.publicKey.export({ type: "spki", format: "pem" }).toString(),
      status: "ACTIVE",
      addedAt: new Date().toISOString(),
      description: "Authoritative F07 Release Guardian root key",
    });
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
   * Deterministic canonical JSON serialization: recursively sorts all keys and normalizes undefined values.
   */
  public static canonicalize(obj: any): string {
    if (obj === undefined || obj === null || typeof obj !== "object") {
      return JSON.stringify(obj ?? null);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map((item) => F07CryptoSigner.canonicalize(item)).join(",") + "]";
    }
    const sortedKeys = Object.keys(obj)
      .filter((key) => obj[key] !== undefined)
      .sort();
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
  public static verify(
    obj: any,
    signatureHex: string,
    optionsOrKey?: crypto.KeyObject | { signerKeyId?: string; customPublicKey?: crypto.KeyObject }
  ): boolean {
    return F07CryptoSigner.getInstance().verify(obj, signatureHex, optionsOrKey);
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
   * Verifies Ed25519 hex signature over canonicalized payload using trusted key.
   */
  public verify(
    obj: any,
    signatureHex: string,
    optionsOrKey?: crypto.KeyObject | { signerKeyId?: string; customPublicKey?: crypto.KeyObject }
  ): boolean {
    try {
      let pubKey: crypto.KeyObject | null = null;
      if (optionsOrKey && typeof (optionsOrKey as any).export === "function") {
        pubKey = optionsOrKey as crypto.KeyObject;
      } else if (optionsOrKey && typeof optionsOrKey === "object") {
        const opts = optionsOrKey as { signerKeyId?: string; customPublicKey?: crypto.KeyObject };
        if (opts.customPublicKey) {
          pubKey = opts.customPublicKey;
        } else if (opts.signerKeyId) {
          const trustStore = F07TrustedKeyStore.getInstance();
          if (!trustStore.isKeyTrusted(opts.signerKeyId)) {
            return false; // Unknown or revoked key identity
          }
          pubKey = trustStore.getPublicKey(opts.signerKeyId);
        }
      }

      if (!pubKey) {
        pubKey = this.publicKey;
      }

      const canonical = F07CryptoSigner.canonicalize(obj);
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
