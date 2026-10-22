/**
 * Restart-persistence regression tests against the REAL SQLite backend.
 *
 * Proves that production-critical stores persisted with actual better-sqlite3
 * survive a full close/reopen cycle (new process simulation). Skipped with an
 * explicit message when the native binding is genuinely unavailable on this
 * machine — the fail-closed suite covers that case instead.
 */
import { describe, it, expect } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import crypto from "crypto";

import { getSqliteHealth } from "../lib/safe-sqlite";
import { SQLiteRenderQueue } from "../lib/core/SQLiteRenderQueue";
import { DurableAuthorizationStore } from "../publishing/authorization/DurableAuthorizationStore";
import { ProviderApiOperationJournal } from "../factoryos/core/compute/api/ProviderApiOperationJournal";
import type { ReleaseAuthorization } from "../factoryos/core/verification/youtube/contracts/F07ReleaseContracts";

const health = getSqliteHealth();
if (!health.available) {
  console.warn(
    `[restart-persistence] better-sqlite3 native binding unavailable (${health.error}); ` +
      "restart tests SKIPPED. Run `npm rebuild better-sqlite3` to enable them."
  );
}

const d = describe.skipIf(!health.available);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sf-restart-persist-"));

function synthAuthorization(id: string): ReleaseAuthorization {
  return {
    authorizationId: id,
    issuedAt: new Date().toISOString(),
    issuer: "F07_RELEASE_GUARDIAN",
    authorizationVersion: 1,
    nonce: "nonce-" + id,
    receiptId: "receipt-" + id,
    receiptDigestSha256: crypto.randomBytes(32).toString("hex"),
    receiptSignature: "sig-" + id,
    artifactId: "artifact-" + id,
    artifactSha256: crypto.randomBytes(32).toString("hex"),
    artifactCasRef: "cas://" + id,
    targetChannelId: "UC_test",
    targetPlatform: "youtube",
    publicationIntentId: "intent-" + id,
    publicationIntentHash: crypto.randomBytes(32).toString("hex"),
    canonicalPayloadHash: crypto.randomBytes(32).toString("hex"),
    scope: {
      allowedPrivacy: "private",
      containsSyntheticMedia: true,
      selfDeclaredMadeForKids: false,
      title: "restart persistence probe",
    },
    policySnapshotIds: ["snap-1"],
    evidenceVersion: "1",
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    signature: "ed25519-sig-" + id,
    signerKeyId: "test-signer",
  } as unknown as ReleaseAuthorization;
}

d("restart persistence with real SQLite", () => {
  it("render queue survives a full reopen (new instance, same file)", async () => {
    const jobId = `restart-test-${Date.now()}`;
    const q1 = new SQLiteRenderQueue();
    await q1.enqueue({ jobId, payload: { probe: "restart" } });

    const q2 = new SQLiteRenderQueue();
    const job = await q2.getJob(jobId);
    expect(job).not.toBeNull();
    expect(job!.jobId).toBe(jobId);

    // Cleanup: remove the synthetic row regardless of cancel semantics.
    await q2.cancel(jobId);
  });

  it("release authorization state (ACTIVE + consume CAS) survives a reopen", () => {
    const id = `auth-restart-${Date.now()}`;
    const dbPath = path.join(tmp, `auth-${id}.db`);
    const s1 = DurableAuthorizationStore.resetInstanceForTesting(dbPath);
    s1.save(synthAuthorization(id));
    expect(s1.consume(id)).toBe(true);

    const s2 = DurableAuthorizationStore.resetInstanceForTesting(dbPath);
    const reloaded = s2.get(id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.status).toBe("CONSUMED");
    expect(reloaded!.consumedAt).toBeDefined();
  });

  it("provider API idempotency key survives a reopen (no duplicate operations)", () => {
    const dbPath = path.join(tmp, `journal-${Date.now()}.db`);
    const key = `idem-${Date.now()}`;
    const j1 = new ProviderApiOperationJournal(dbPath);
    const record = j1.start({
      providerId: "probe-provider",
      providerType: "VAST" as const,
      operation: "AUTH_VALIDATE" as const,
      idempotencyKey: key,
      requestPayload: { probe: true },
    });

    const j2 = new ProviderApiOperationJournal(dbPath);
    const replayed = j2.findByIdempotencyKey("probe-provider", key);
    expect(replayed).toBeDefined();
    expect(replayed!.operationId).toBe(record.operationId);
  });
});
