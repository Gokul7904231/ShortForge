import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { canonicalize, verifySignedAttestation } from "../verify-attestation.mjs";

const pair = crypto.generateKeyPairSync("ed25519");
const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const trust = { publicKeyPem, keyId: "test-okf-key", keyVersion: 3 };

function signedFixture(overrides = {}) {
  const payload = {
    schemaVersion: "1.0",
    attestationType: "OKF_SWEEP",
    repository: "Gokul7904231/ShortForge",
    commitSha: "a".repeat(40),
    branch: "test-branch",
    corpusSha256: "b".repeat(64),
    envelopeSha256: "c".repeat(64),
    relevantRuleIds: ["OKF.PROCESS.FULL_SWEEP"],
    generatedAt: "2026-10-12T00:00:00.000Z",
    generatorVersion: "test",
  };
  const canonical = canonicalize(payload);
  const signatureHex = crypto.sign(null, Buffer.from(canonical, "utf8"), pair.privateKey).toString("hex");
  const payloadSha256 = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return {
    ...payload,
    ...overrides,
    signature: {
      algorithm: "Ed25519",
      keyId: trust.keyId,
      keyVersion: trust.keyVersion,
      signatureHex,
      payloadSha256,
    },
    authority: "EVIDENCE_ONLY",
  };
}

test("accepts a correctly signed attestation from the configured trust key", () => {
  const result = verifySignedAttestation(signedFixture(), trust);
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.keyId, trust.keyId);
  assert.equal(result.keyVersion, trust.keyVersion);
});

test("rejects a payload edited after signing", () => {
  const attestation = signedFixture();
  attestation.branch = "tampered-branch";
  assert.throws(() => verifySignedAttestation(attestation, trust), /payload digest mismatch/);
});

test("rejects a signature modified after signing", () => {
  const attestation = signedFixture();
  attestation.signature.signatureHex = "00".repeat(64);
  assert.throws(() => verifySignedAttestation(attestation, trust), /verification failed/);
});

test("rejects an untrusted key ID or version", () => {
  assert.throws(() => verifySignedAttestation(signedFixture(), { ...trust, keyId: "other-key" }), /keyId/);
  assert.throws(() => verifySignedAttestation(signedFixture(), { ...trust, keyVersion: 4 }), /keyVersion/);
});

test("rejects non-evidence authority and non-Ed25519 signatures", () => {
  const wrongAuthority = signedFixture();
  wrongAuthority.authority = "PRODUCTION_AUTHORITY";
  assert.throws(() => verifySignedAttestation(wrongAuthority, trust), /EVIDENCE_ONLY/);
  const wrongAlgorithm = signedFixture();
  wrongAlgorithm.signature.algorithm = "RSA";
  assert.throws(() => verifySignedAttestation(wrongAlgorithm, trust), /Ed25519/);
});
