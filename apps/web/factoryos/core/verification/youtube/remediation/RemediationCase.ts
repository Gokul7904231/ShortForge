/**
 * FactoryOS YouTube Monetization Guardian — ReMaker Remediation Case Contract
 * Structured contract emitted by F07 to command targeted repairs from ReMaker.
 */

import { ProductionStage, RuleSeverity } from "../policy/YouTubePolicyIR";

export interface RemediationCase {
  readonly caseId: string;
  readonly policyId: string;
  readonly severity: RuleSeverity;
  readonly finding: string;
  readonly evidence: readonly string[];
  readonly affectedStages: readonly ProductionStage[];
  readonly repairObjective: string;
  readonly allowedActions: readonly string[];
  readonly forbiddenShallowRepairs: readonly string[];
  readonly preserve: readonly string[];
  readonly rerunRequired: readonly string[];
  readonly createdAt: string;
}
