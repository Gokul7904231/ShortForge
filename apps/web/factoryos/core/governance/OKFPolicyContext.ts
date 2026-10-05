import { createHash } from "node:crypto";

export type OKFPolicyDisposition = "PASS" | "BLOCKED" | "REJECTED" | "ESCALATED" | "UNPROVEN";
export interface OKFPolicyRuleProjection {
  readonly ruleId: string;
  readonly severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly normativeText: string;
  readonly sourceRefs: readonly string[];
  readonly verificationRefs: readonly string[];
}
export interface OKFPolicyContext {
  readonly schemaVersion: "1.0";
  readonly contextId: string;
  readonly corpusSha256: string;
  readonly sweepEnvelopeSha256: string;
  readonly generatedAt: string;
  readonly applicableRules: readonly OKFPolicyRuleProjection[];
  readonly constraints: readonly string[];
  readonly evidenceState: readonly { ref: string; status: "VERIFIED" | "OBSERVED" | "UNPROVEN" | "BLOCKED" }[];
  readonly authority: "ADVISORY_CONTEXT_ONLY";
  readonly canAuthorizeExecution: false;
  readonly canRewritePolicy: false;
  readonly contextFingerprint: string;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj=value as Record<string,unknown>;
  return "{" + Object.keys(obj).sort().map((k)=>JSON.stringify(k)+":"+canonicalize(obj[k])).join(",") + "}";
}

export function buildOKFPolicyContext(input: Omit<OKFPolicyContext,"contextFingerprint">): OKFPolicyContext {
  if (!input.applicableRules.length) throw new Error("[OKF] policy context requires applicable rules");
  const payload={...input};
  const contextFingerprint=createHash("sha256").update(canonicalize(payload),"utf8").digest("hex");
  return {...input,contextFingerprint};
}

export function validateOKFPolicyContext(context: OKFPolicyContext): void {
  if (context.schemaVersion !== "1.0") throw new Error("[OKF] unsupported policy context schema");
  if (context.authority !== "ADVISORY_CONTEXT_ONLY") throw new Error("[OKF] invalid authority class");
  if (context.canAuthorizeExecution !== false || context.canRewritePolicy !== false) throw new Error("[OKF] policy context cannot carry authority");
  for (const rule of context.applicableRules) if (!/^OKF\./.test(rule.ruleId)) throw new Error("[OKF] invalid rule identity");
}
