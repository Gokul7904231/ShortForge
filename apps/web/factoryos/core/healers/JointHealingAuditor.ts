import type { Case } from "../contracts/CaseContracts";
import type { HealerReport } from "../contracts/HealerContracts";
import type { BorderDossier, JointHealingSessionRecord } from "../governance/FloorGovernanceContracts";

export interface JointHealingAuditInput {
  readonly session: JointHealingSessionRecord;
  readonly caseItem: Case;
  readonly reports: readonly HealerReport[];
  readonly bdaReinspection: BorderDossier;
  readonly activeLocks: readonly {
    readonly resourceId: string;
    readonly ownerHealerId: string;
    readonly sessionId?: string;
  }[];
}

export interface JointHealingAuditResult {
  readonly passed: boolean;
  readonly reasons: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly auditedAt: string;
}

export class JointHealingAuditor {
  verify(input: JointHealingAuditInput): JointHealingAuditResult {
    const reasons: string[] = [];
    const evidenceRefs: string[] = [];

    if (input.caseItem.status !== "VERIFYING") {
      reasons.push(`case_not_verifying:${input.caseItem.status}`);
    }

    const healerIds = new Set(input.reports.map((report) => report.healerId));
    if (input.reports.length < 2 || healerIds.size < 2) {
      reasons.push("paired_healer_independence_missing");
    }

    for (const report of input.reports) {
      if (report.repairStatus !== "SUCCESS") {
        reasons.push(`repair_not_successful:${report.healerId}`);
      }
      if (!report.slayerHypothesisVerified) {
        reasons.push(`hypothesis_not_independently_verified:${report.healerId}`);
      }
      if (report.independentEvidence.length === 0) {
        reasons.push(`independent_evidence_missing:${report.healerId}`);
      }
      evidenceRefs.push(...report.independentEvidence.map((evidence) => evidence.evidenceId));
      evidenceRefs.push(...report.repairPlan.actions.map((action) => action.actionId));
    }

    if (input.bdaReinspection.policyDecision !== "ALLOW" || input.bdaReinspection.anomalies.length > 0) {
      reasons.push("bda_reinspection_failed");
    } else {
      evidenceRefs.push(input.bdaReinspection.borderEventId);
    }

    const activeSessionLocks = input.activeLocks.filter(
      (lock) => lock.sessionId === input.session.sessionId
    );
    if (activeSessionLocks.length > 0) {
      reasons.push("mutation_leases_still_active");
    }

    const passed = reasons.length === 0;
    return {
      passed,
      reasons,
      evidenceRefs: Array.from(new Set(evidenceRefs)),
      auditedAt: new Date().toISOString(),
    };
  }
}
