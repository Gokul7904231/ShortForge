import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { OKFAttestationSigner } from "../core/governance/OKFAttestationSigner";
import { buildOKFPolicyContext, validateOKFPolicyContext } from "../core/governance/OKFPolicyContext";

describe("OKF Control Plane V3", () => {
  it("signs and verifies evidence without creating authority", () => {
    const pair=generateKeyPairSync("ed25519",{privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
    const signer=new OKFAttestationSigner({keyId:"test_okf_v3",keyVersion:1,privateKeyPem:pair.privateKey,publicKeyPem:pair.publicKey});
    const payload={schemaVersion:"1.0",attestationType:"OKF_SWEEP",repository:"Gokul7904231/ShortForge",commitSha:"a".repeat(40),branch:"test",corpusSha256:"b".repeat(64),envelopeSha256:"c".repeat(64),relevantRuleIds:["OKF.TEST"],generatedAt:"2026-10-05T00:00:00Z",generatorVersion:"v3"} as const;
    const signature=signer.sign(payload);
    expect(signature.algorithm).toBe("Ed25519");
    expect(signer.verify(payload,signature.signatureHex)).toBe(true);
    expect(signer.verify({...payload,commitSha:"d".repeat(40)},signature.signatureHex)).toBe(false);
  });

  it("builds bounded policy context and rejects authority escalation", () => {
    const context=buildOKFPolicyContext({schemaVersion:"1.0",contextId:"ctx",corpusSha256:"a".repeat(64),sweepEnvelopeSha256:"b".repeat(64),generatedAt:"2026-10-05T00:00:00Z",applicableRules:[{ruleId:"OKF.TEST",severity:"CRITICAL",normativeText:"test",sourceRefs:[".okf/principles.md"],verificationRefs:["apps/web/factoryos/tests/authority-hierarchy-proof.test.ts"]}],constraints:["fail closed"],evidenceState:[],authority:"ADVISORY_CONTEXT_ONLY",canAuthorizeExecution:false,canRewritePolicy:false});
    validateOKFPolicyContext(context);
    expect(context.canAuthorizeExecution).toBe(false);
    expect(context.canRewritePolicy).toBe(false);
  });
});
