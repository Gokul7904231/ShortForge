/**
 * FactoryOS YouTube Monetization Guardian — Durable Authorization Store
 * SQLite-backed persistent store for ReleaseAuthorization capabilities.
 * Survives process restarts, crashes, and multi-process worker contention.
 *
 * Invariants:
 * 1. Process-local Map/Set is NOT the final authority.
 * 2. State machine transitions: ACTIVE -> CONSUMED | INVALIDATED.
 * 3. Atomic CAS transitions: CONSUMED -> ACTIVE and INVALIDATED -> ACTIVE are impossible.
 */

import path from "path";
import fs from "fs";
import getSafeDatabase, { SafeDatabase } from "../../lib/safe-sqlite";
import type { ReleaseAuthorization, ReleaseAuthorizationScope } from "../../factoryos/core/verification/youtube/contracts/F07ReleaseContracts";

export class DurableAuthorizationStore {
  private static instance: DurableAuthorizationStore | null = null;
  private db: SafeDatabase;

  private constructor(customDbPath?: string) {
    const dataDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = customDbPath || path.join(dataDir, "queues.db");
    this.db = getSafeDatabase(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.initSchema();
  }

  public static getInstance(customDbPath?: string): DurableAuthorizationStore {
    if (!DurableAuthorizationStore.instance || (customDbPath && DurableAuthorizationStore.instance)) {
      DurableAuthorizationStore.instance = new DurableAuthorizationStore(customDbPath);
    }
    return DurableAuthorizationStore.instance;
  }

  public static resetInstanceForTesting(customDbPath?: string): DurableAuthorizationStore {
    DurableAuthorizationStore.instance = new DurableAuthorizationStore(customDbPath);
    return DurableAuthorizationStore.instance;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS release_authorizations (
        authorization_id        TEXT PRIMARY KEY,
        status                  TEXT NOT NULL,
        issued_at               TEXT NOT NULL,
        expires_at              TEXT NOT NULL,
        nonce                   TEXT NOT NULL,
        receipt_id              TEXT NOT NULL,
        receipt_digest_sha256   TEXT NOT NULL,
        receipt_signature       TEXT NOT NULL,
        artifact_id             TEXT NOT NULL,
        artifact_sha256         TEXT NOT NULL,
        artifact_cas_ref        TEXT NOT NULL,
        target_channel_id       TEXT NOT NULL,
        target_platform         TEXT NOT NULL,
        publication_intent_id   TEXT NOT NULL,
        publication_intent_hash TEXT NOT NULL,
        canonical_payload_hash  TEXT NOT NULL,
        scope_json              TEXT NOT NULL,
        policy_snapshot_ids_json TEXT NOT NULL,
        evidence_version        TEXT NOT NULL,
        signer_key_id           TEXT NOT NULL,
        signature               TEXT NOT NULL,
        upload_session_uri      TEXT,
        invalidated_at          TEXT,
        invalidated_by          TEXT,
        invalidation_reason     TEXT,
        consumed_at             TEXT,
        updated_at              INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_auth_status ON release_authorizations(status);
      CREATE INDEX IF NOT EXISTS idx_auth_artifact ON release_authorizations(artifact_sha256);
    `);
  }

  /**
   * Persists an issued ReleaseAuthorization.
   */
  public save(auth: ReleaseAuthorization): void {
    const stmt = this.db.prepare(`
      INSERT INTO release_authorizations (
        authorization_id, status, issued_at, expires_at, nonce,
        receipt_id, receipt_digest_sha256, receipt_signature,
        artifact_id, artifact_sha256, artifact_cas_ref,
        target_channel_id, target_platform, publication_intent_id,
        publication_intent_hash, canonical_payload_hash, scope_json,
        policy_snapshot_ids_json, evidence_version, signer_key_id,
        signature, upload_session_uri, invalidated_at, invalidated_by,
        invalidation_reason, consumed_at, updated_at
      ) VALUES (
        @authorizationId, @status, @issuedAt, @expiresAt, @nonce,
        @receiptId, @receiptDigestSha256, @receiptSignature,
        @artifactId, @artifactSha256, @artifactCasRef,
        @targetChannelId, @targetPlatform, @publicationIntentId,
        @publicationIntentHash, @canonicalPayloadHash, @scopeJson,
        @policySnapshotIdsJson, @evidenceVersion, @signerKeyId,
        @signature, @uploadSessionUri, @invalidatedAt, @invalidatedBy,
        @invalidationReason, @consumedAt, unixepoch()
      )
      ON CONFLICT(authorization_id) DO UPDATE SET
        status = excluded.status,
        upload_session_uri = COALESCE(excluded.upload_session_uri, release_authorizations.upload_session_uri),
        invalidated_at = excluded.invalidated_at,
        invalidated_by = excluded.invalidated_by,
        invalidation_reason = excluded.invalidation_reason,
        consumed_at = excluded.consumed_at,
        updated_at = unixepoch();
    `);

    stmt.run({
      authorizationId: auth.authorizationId,
      status: auth.status,
      issuedAt: auth.issuedAt,
      expiresAt: auth.expiresAt,
      nonce: auth.nonce,
      receiptId: auth.receiptId,
      receiptDigestSha256: auth.receiptDigestSha256,
      receiptSignature: auth.receiptSignature,
      artifactId: auth.artifactId,
      artifactSha256: auth.artifactSha256,
      artifactCasRef: auth.artifactCasRef,
      targetChannelId: auth.targetChannelId,
      targetPlatform: auth.targetPlatform,
      publicationIntentId: auth.publicationIntentId,
      publicationIntentHash: auth.publicationIntentHash,
      canonicalPayloadHash: auth.canonicalPayloadHash,
      scopeJson: JSON.stringify(auth.scope),
      policySnapshotIdsJson: JSON.stringify(auth.policySnapshotIds || []),
      evidenceVersion: auth.evidenceVersion || "1.0",
      signerKeyId: auth.signerKeyId,
      signature: auth.signature,
      uploadSessionUri: (auth as any).uploadSessionUri || null,
      invalidatedAt: auth.invalidatedAt || null,
      invalidatedBy: auth.invalidatedBy || null,
      invalidationReason: auth.invalidationReason || null,
      consumedAt: (auth as any).consumedAt || null,
    });
  }

  /**
   * Reads a durable authorization by ID.
   */
  public get(authorizationId: string): ReleaseAuthorization | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM release_authorizations WHERE authorization_id = ?
    `);
    const row = stmt.get(authorizationId) as any;
    if (!row) return undefined;

    return {
      authorizationId: row.authorization_id,
      status: row.status,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      nonce: row.nonce,
      receiptId: row.receipt_id,
      receiptDigestSha256: row.receipt_digest_sha256,
      receiptSignature: row.receipt_signature,
      artifactId: row.artifact_id,
      artifactSha256: row.artifact_sha256,
      artifactCasRef: row.artifact_cas_ref,
      targetChannelId: row.target_channel_id,
      targetPlatform: row.target_platform,
      publicationIntentId: row.publication_intent_id,
      publicationIntentHash: row.publication_intent_hash,
      canonicalPayloadHash: row.canonical_payload_hash,
      scope: JSON.parse(row.scope_json) as ReleaseAuthorizationScope,
      policySnapshotIds: JSON.parse(row.policy_snapshot_ids_json),
      evidenceVersion: row.evidence_version,
      issuer: "F07_RELEASE_GUARDIAN",
      authorizationVersion: 1,
      signerKeyId: row.signer_key_id,
      signature: row.signature,
      invalidatedAt: row.invalidated_at || undefined,
      invalidatedBy: row.invalidated_by || undefined,
      invalidationReason: row.invalidation_reason || undefined,
      uploadSessionUri: row.upload_session_uri || undefined,
    } as ReleaseAuthorization;
  }

  /**
   * Atomically consumes an active authorization.
   * Enforces single-winner atomic SQL CAS: UPDATE ... WHERE status = 'ACTIVE'.
   * Returns true if successfully transitioned from ACTIVE to CONSUMED, false otherwise.
   */
  public consume(authorizationId: string, uploadSessionUri?: string): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE release_authorizations
      SET status = 'CONSUMED',
          upload_session_uri = COALESCE(?, upload_session_uri),
          consumed_at = ?,
          updated_at = unixepoch()
      WHERE authorization_id = ?
        AND status = 'ACTIVE'
    `);

    const result = stmt.run(uploadSessionUri || null, now, authorizationId);
    return result.changes === 1;
  }

  /**
   * Atomically invalidates an active authorization.
   * Returns true if successfully transitioned, false if already consumed/invalidated.
   */
  public invalidate(authorizationId: string, reason: string, invalidatedBy = "F07_RELEASE_GUARDIAN"): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE release_authorizations
      SET status = 'INVALIDATED',
          invalidated_at = ?,
          invalidated_by = ?,
          invalidation_reason = ?,
          updated_at = unixepoch()
      WHERE authorization_id = ?
        AND status = 'ACTIVE'
    `);

    const result = stmt.run(now, invalidatedBy, reason, authorizationId);
    return result.changes === 1;
  }

  /**
   * Clears table for testing isolation.
   */
  public clear(): void {
    this.db.exec(`DELETE FROM release_authorizations;`);
  }
}
