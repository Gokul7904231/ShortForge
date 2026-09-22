import type { TruthLevel } from "../contracts/execution.contract";

export interface EvaluationReceipt {
  readonly receiptId: string;
  readonly targetId: string;
  readonly ruleId: string;
  readonly verdict: "PASS" | "FAIL" | "WARNING";
  readonly truthLevel: TruthLevel;
  readonly evidenceDigest: string;
  readonly evaluatedAt: string;
  readonly details?: Record<string, unknown>;
}
