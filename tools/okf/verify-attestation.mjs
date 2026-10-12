import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonicalize(value[key])).join(",") + "}";
}

function normalizePublicKey(raw) {
  let value = String(raw ?? "").replace(/^\uFEFF/, "").trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  value = value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\r\n?/g, "\n").trim();
  if (!value.includes("-----BEGIN ")) {
    try {
      const decoded = Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8").replace(/^\uFEFF/, "").trim();
      if (decoded.includes("-----BEGIN ")) value = decoded;
    } catch {
      // createPublicKey below will produce the definitive key parse error.
    }
  }
  if (!value.includes("-----BEGIN ")) throw new Error("[OKF] trusted attestation public key is not valid PEM text");
  return value;
}

/**
 * Verify a signed OKF sweep against independently supplied public-key trust.
 * The signature never grants execution or release authority.
 */
export function verifySignedAttestation(attestation, trust) {
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) {
    throw new Error("[OKF] signed attestation must be an object");
  }
  if (attestation.schemaVersion !== "1.0" || attestation.attestationType !== "OKF_SWEEP") {
    throw new Error("[OKF] unsupported signed attestation schema/type");
  }
  if (attestation.authority !== "EVIDENCE_ONLY") {
    throw new Error("[OKF] attestation authority must be EVIDENCE_ONLY");
  }
  const signature = attestation.signature;
  if (!signature || signature.algorithm !== "Ed25519") {
    throw new Error("[OKF] Ed25519 signature is required");
  }
  if (typeof trust.keyId !== "string" || !trust.keyId.trim() || signature.keyId !== trust.keyId) {
    throw new Error("[OKF] attestation keyId does not match trusted key configuration");
  }
  const trustedVersion = Number(trust.keyVersion);
  if (!Number.isSafeInteger(trustedVersion) || trustedVersion < 1 || signature.keyVersion !== trustedVersion) {
    throw new Error("[OKF] attestation keyVersion does not match trusted key configuration");
  }
  if (typeof signature.signatureHex !== "string" || !/^(?:[a-f0-9]{2})+$/i.test(signature.signatureHex)) {
    throw new Error("[OKF] signatureHex is invalid");
  }
  if (typeof signature.payloadSha256 !== "string" || !/^[a-f0-9]{64}$/.test(signature.payloadSha256)) {
    throw new Error("[OKF] payloadSha256 is invalid");
  }

  const publicKey = crypto.createPublicKey(normalizePublicKey(trust.publicKeyPem));
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("[OKF] trusted attestation key must be Ed25519");
  }
  const payload = { ...attestation };
  delete payload.signature;
  delete payload.authority;
  const canonical = canonicalize(payload);
  const payloadSha256 = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  if (payloadSha256 !== signature.payloadSha256) {
    throw new Error("[OKF] signed payload digest mismatch");
  }
  const valid = crypto.verify(
    null,
    Buffer.from(canonical, "utf8"),
    publicKey,
    Buffer.from(signature.signatureHex, "hex"),
  );
  if (!valid) throw new Error("[OKF] signed attestation verification failed");

  return {
    status: "VERIFIED",
    authority: "EVIDENCE_ONLY",
    keyId: signature.keyId,
    keyVersion: signature.keyVersion,
    payloadSha256,
  };
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node tools/okf/verify-attestation.mjs <signed-attestation.json>");
    process.exitCode = 2;
    return;
  }
  try {
    const publicKeyPem = process.env.OKF_ATTESTATION_PUBLIC_KEY_PEM;
    const keyId = process.env.OKF_ATTESTATION_KEY_ID;
    const keyVersion = process.env.OKF_ATTESTATION_KEY_VERSION;
    if (!publicKeyPem || !keyId || !keyVersion) {
      throw new Error("[OKF] trusted public key, key ID and key version are required");
    }
    const attestation = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
    const result = verifySignedAttestation(attestation, { publicKeyPem, keyId, keyVersion });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
