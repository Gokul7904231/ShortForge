import fs from "node:fs";
import crypto from "node:crypto";

const [sweepPath,outPath] = process.argv.slice(2);
if (!sweepPath || !outPath) { console.error("Usage: node tools/okf/attest.mjs <sweep.json> <attestation.json>"); process.exit(2); }

function normalizeKey(raw, label) {
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
      // Keep the original value so createPrivateKey/createPublicKey can report the definitive parse error.
    }
  }
  if (!value.includes("-----BEGIN ")) throw new Error(`[OKF] ${label} key is not valid PEM text`);
  return value;
}

const privateRaw=process.env.OKF_ATTESTATION_PRIVATE_KEY_PEM;
const publicRaw=process.env.OKF_ATTESTATION_PUBLIC_KEY_PEM;
const keyId=process.env.OKF_ATTESTATION_KEY_ID;
const keyVersion=Number(process.env.OKF_ATTESTATION_KEY_VERSION||"1");
if (!privateRaw || !publicRaw || !keyId) { console.error("OKF_ATTESTATION_KEYS_REQUIRED"); process.exit(3); }

const privatePem=normalizeKey(privateRaw, "private");
const publicPem=normalizeKey(publicRaw, "public");
const privateKey=crypto.createPrivateKey(privatePem);
const publicKey=crypto.createPublicKey(publicPem);
if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") {
  console.error("OKF_ATTESTATION_ED25519_REQUIRED");
  process.exit(4);
}

const sweep=JSON.parse(fs.readFileSync(sweepPath,"utf8"));
const payload={schemaVersion:"1.0",attestationType:"OKF_SWEEP",repository:process.env.GITHUB_REPOSITORY||"UNKNOWN",commitSha:process.env.GITHUB_SHA||"UNKNOWN",branch:process.env.GITHUB_REF_NAME||"UNKNOWN",corpusSha256:sweep.corpusSha256,envelopeSha256:sweep.envelopeSha256,relevantRuleIds:[...(sweep.relevantRules||[])].sort(),generatedAt:new Date().toISOString(),generatorVersion:"okf-v3-attestation-1"};
const canonical=(v)=>v===null||typeof v!=="object"?(JSON.stringify(v)??"null"):Array.isArray(v)?`[${v.map(canonical).join(",")}]`:`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")}}`;
const text=canonical(payload);
const digest=crypto.createHash("sha256").update(text,"utf8").digest("hex");
const signatureHex=crypto.sign(null,Buffer.from(text,"utf8"),privateKey).toString("hex");
const valid=crypto.verify(null,Buffer.from(text,"utf8"),publicKey,Buffer.from(signatureHex,"hex"));
if (!valid) { console.error("OKF_ATTESTATION_SELF_VERIFY_FAILED"); process.exit(1); }
const attestation={...payload,signature:{algorithm:"Ed25519",keyId,keyVersion,signatureHex,payloadSha256:digest},authority:"EVIDENCE_ONLY"};
fs.writeFileSync(outPath,JSON.stringify(attestation,null,2)+"\n");
console.log(JSON.stringify({status:"SIGNED",keyId,keyVersion,payloadSha256:digest},null,2));
