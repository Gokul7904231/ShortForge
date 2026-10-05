import fs from "node:fs";
import crypto from "node:crypto";

const [sweepPath,outPath] = process.argv.slice(2);
if (!sweepPath || !outPath) { console.error("Usage: node tools/okf/attest.mjs <sweep.json> <attestation.json>"); process.exit(2); }
const privatePem=process.env.OKF_ATTESTATION_PRIVATE_KEY_PEM;
const publicPem=process.env.OKF_ATTESTATION_PUBLIC_KEY_PEM;
const keyId=process.env.OKF_ATTESTATION_KEY_ID;
const keyVersion=Number(process.env.OKF_ATTESTATION_KEY_VERSION||"1");
if (!privatePem || !publicPem || !keyId) { console.error("OKF_ATTESTATION_KEYS_REQUIRED"); process.exit(3); }
const sweep=JSON.parse(fs.readFileSync(sweepPath,"utf8"));
const payload={schemaVersion:"1.0",attestationType:"OKF_SWEEP",repository:process.env.GITHUB_REPOSITORY||"UNKNOWN",commitSha:process.env.GITHUB_SHA||"UNKNOWN",branch:process.env.GITHUB_REF_NAME||"UNKNOWN",corpusSha256:sweep.corpusSha256,envelopeSha256:sweep.envelopeSha256,relevantRuleIds:[...(sweep.relevantRules||[])].sort(),generatedAt:new Date().toISOString(),generatorVersion:"okf-v3-attestation-1"};
const canonical=(v)=>v===null||typeof v!=="object"?(JSON.stringify(v)??"null"):Array.isArray(v)?`[${v.map(canonical).join(",")}]`:`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")}}`;
const text=canonical(payload);
const digest=crypto.createHash("sha256").update(text,"utf8").digest("hex");
const signatureHex=crypto.sign(null,Buffer.from(text,"utf8"),crypto.createPrivateKey(privatePem)).toString("hex");
const valid=crypto.verify(null,Buffer.from(text,"utf8"),crypto.createPublicKey(publicPem),Buffer.from(signatureHex,"hex"));
if (!valid) { console.error("OKF_ATTESTATION_SELF_VERIFY_FAILED"); process.exit(1); }
const attestation={...payload,signature:{algorithm:"Ed25519",keyId,keyVersion,signatureHex,payloadSha256:digest},authority:"EVIDENCE_ONLY"};
fs.writeFileSync(outPath,JSON.stringify(attestation,null,2)+"\n");
console.log(JSON.stringify({status:"SIGNED",keyId,keyVersion,payloadSha256:digest},null,2));
