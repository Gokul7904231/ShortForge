/**
 * FactoryOS YouTube Monetization Guardian — Cryptographic Trusted Signer Store
 * Manages trusted signer identities, keys, rotation, and revocation for F07 release capabilities.
 *
 * Invariants:
 * 1. "The process has a key" != "The key is trusted".
 * 2. Unregistered or revoked keys strictly fail verification.
 * 3. Signatures must verify against the trusted public key associated with signerKeyId.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export interface TrustedKeyEntry {
  readonly keyId: string;
  readonly keyVersion: number;
  readonly publicKeyPem: string;
  readonly status: "ACTIVE" | "REVOKED";
  readonly addedAt: string;
  readonly revokedAt?: string;
  readonly description?: string;
}

export class F07TrustedKeyStore {
  private static instance: F07TrustedKeyStore | null = null;
  private trustedKeys = new Map<string, TrustedKeyEntry>();
  private keyObjects = new Map<string, crypto.KeyObject>();

  private constructor() {
    this.initializeDefaultTrust();
  }

  public static getInstance(): F07TrustedKeyStore {
    if (!F07TrustedKeyStore.instance) {
      F07TrustedKeyStore.instance = new F07TrustedKeyStore();
    }
    return F07TrustedKeyStore.instance;
  }

  public static resetInstanceForTesting(): void {
    F07TrustedKeyStore.instance = null;
  }

  private initializeDefaultTrust(): void {
    // Attempt to load durable trusted keys registry from data/keys/trusted_keys.json if present
    const keysDir = path.resolve(process.cwd(), "data", "keys");
    const registryPath = path.join(keysDir, "trusted_keys.json");

    if (fs.existsSync(registryPath)) {
      try {
        const raw = fs.readFileSync(registryPath, "utf8");
        const list: TrustedKeyEntry[] = JSON.parse(raw);
        for (const entry of list) {
          this.registerTrustedKey(entry, false);
        }
        return;
      } catch (e: any) {
        console.warn(`[F07TrustedKeyStore] Could not read ${registryPath}: ${e.message}`);
      }
    }
  }

  /**
   * Registers a trusted public key entry.
   */
  public registerTrustedKey(entry: TrustedKeyEntry, persist = false): void {
    try {
      const keyObj = crypto.createPublicKey(entry.publicKeyPem);
      this.trustedKeys.set(entry.keyId, entry);
      this.keyObjects.set(entry.keyId, keyObj);

      if (persist) {
        this.persistRegistry();
      }
    } catch (err: any) {
      throw new Error(`Cannot register invalid trusted key ${entry.keyId}: ${err.message}`);
    }
  }

  /**
   * Revokes a signer key by keyId.
   */
  public revokeKey(keyId: string, persist = false): boolean {
    const entry = this.trustedKeys.get(keyId);
    if (!entry) return false;

    const revoked: TrustedKeyEntry = {
      ...entry,
      status: "REVOKED",
      revokedAt: new Date().toISOString(),
    };
    this.trustedKeys.set(keyId, revoked);

    if (persist) {
      this.persistRegistry();
    }
    return true;
  }

  /**
   * Checks if a keyId is currently trusted and active.
   */
  public isKeyTrusted(keyId: string): boolean {
    const entry = this.trustedKeys.get(keyId);
    return Boolean(entry && entry.status === "ACTIVE");
  }

  /**
   * Retrieves KeyObject for a trusted keyId.
   */
  public getPublicKey(keyId: string): crypto.KeyObject | null {
    if (!this.isKeyTrusted(keyId)) return null;
    return this.keyObjects.get(keyId) || null;
  }

  /**
   * Retrieves metadata entry for a key.
   */
  public getKeyEntry(keyId: string): TrustedKeyEntry | undefined {
    return this.trustedKeys.get(keyId);
  }

  /**
   * Lists all trusted key IDs.
   */
  public listTrustedKeyIds(): string[] {
    return Array.from(this.trustedKeys.keys());
  }

  private persistRegistry(): void {
    try {
      const keysDir = path.resolve(process.cwd(), "data", "keys");
      if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
      }
      const registryPath = path.join(keysDir, "trusted_keys.json");
      const list = Array.from(this.trustedKeys.values());
      fs.writeFileSync(registryPath, JSON.stringify(list, null, 2), "utf8");
    } catch (err: any) {
      console.warn(`[F07TrustedKeyStore] Failed to persist trusted keys registry: ${err.message}`);
    }
  }
}
