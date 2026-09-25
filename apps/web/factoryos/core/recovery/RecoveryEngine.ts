/**
 * FactoryOS Frontier v3 — Recovery Engine
 * Implements two-tiered failure resolution: Deterministic Fast-Path + Autonomous RecoveryAgent.
 */

import { MissionEvidence } from "../contracts/EvidenceContracts";

export type FailureTaxonomy =
  | "TRANSIENT"
  | "AUTH"
  | "RESOURCE"
  | "WORKER"
  | "MODEL"
  | "ASSET"
  | "VALIDATION"
  | "DELIVERY"
  | "POLICY"
  | "UNKNOWN";

export interface RecoveryPlan {
  readonly classification: FailureTaxonomy;
  readonly isDeterministic: boolean;
  readonly strategy: "EXPONENTIAL_BACKOFF" | "ALTERNATE_PROVIDER" | "FAILOVER_WORKER" | "RECONCILE_QUOTA" | "ESCALATE_TO_ADMIN" | "RETRY_WITH_PROMPT_FIX";
  readonly backoffMs?: number;
  readonly alternateTarget?: string;
  readonly quotaReconciled: boolean;
  readonly rationale: string;
}

export class RecoveryEngine {
  /**
   * Classifies error and produces recovery plan
   */
  static analyzeFailure(
    error: any,
    failedTaskId: string,
    attemptCount: number = 1
  ): RecoveryPlan {
    const errorMsg = String(error?.message || error || "").toLowerCase();
    const statusCode = error?.statusCode || error?.status || 0;

    // 1. Rate limits & transient network errors (Deterministic)
    if (statusCode === 429 || errorMsg.includes("rate limit") || errorMsg.includes("econnreset") || errorMsg.includes("timeout")) {
      const backoffMs = Math.min(1000 * Math.pow(2, attemptCount), 16000);
      return {
        classification: "TRANSIENT",
        isDeterministic: true,
        strategy: "EXPONENTIAL_BACKOFF",
        backoffMs,
        quotaReconciled: false,
        rationale: `Transient network/rate-limit error detected. Applying ${backoffMs}ms exponential backoff.`,
      };
    }

    // 2. Worker crash or heartbeat lost (Deterministic)
    if (errorMsg.includes("worker") || errorMsg.includes("heartbeat") || errorMsg.includes("runner")) {
      return {
        classification: "WORKER",
        isDeterministic: true,
        strategy: "FAILOVER_WORKER",
        alternateTarget: "qualified-provider-backup",
        quotaReconciled: true,
        rationale: "Worker node failure or lost heartbeat. Reconciled quota and failing over to backup pool.",
      };
    }

    // 3. Storage / Drive failure (Deterministic)
    if (errorMsg.includes("drive") || errorMsg.includes("storage") || statusCode >= 500) {
      return {
        classification: "DELIVERY",
        isDeterministic: true,
        strategy: "ALTERNATE_PROVIDER",
        alternateTarget: "local_outbox_queue",
        quotaReconciled: false,
        rationale: "Drive storage unavailable. Holding artifact in local outbox queue for background sync.",
      };
    }

    // 4. Model JSON syntax or parsing failure (Agentic / Prompt fix)
    if (errorMsg.includes("json") || errorMsg.includes("parse") || errorMsg.includes("schema")) {
      return {
        classification: "MODEL",
        isDeterministic: false,
        strategy: "RETRY_WITH_PROMPT_FIX",
        quotaReconciled: false,
        rationale: "Model emitted malformed JSON output. Instructing agent to enforce strict JSON syntax.",
      };
    }

    // 5. Policy or Auth error
    if (statusCode === 401 || statusCode === 403 || errorMsg.includes("forbidden") || errorMsg.includes("unauthorized")) {
      return {
        classification: "AUTH",
        isDeterministic: true,
        strategy: "ESCALATE_TO_ADMIN",
        quotaReconciled: true,
        rationale: "Authentication or authorization failure. Escalating to Admin operations.",
      };
    }

    // 6. Unknown fallback
    return {
      classification: "UNKNOWN",
      isDeterministic: false,
      strategy: "ESCALATE_TO_ADMIN",
      quotaReconciled: true,
      rationale: "Unclassified runtime exception. Halting mission to prevent cascading errors.",
    };
  }

  /**
   * Commits recovery action as machine-readable evidence
   */
  static createRecoveryEvidence(
    missionId: string,
    taskId: string,
    plan: RecoveryPlan,
    success: boolean
  ): MissionEvidence {
    return {
      evidenceId: `ev_rec_${Date.now()}`,
      missionId,
      taskId,
      agentRole: "RecoveryAgent",
      action: `RECOVERY_${plan.strategy}`,
      inputHash: `hash_err_${taskId}`,
      outputHash: `hash_rec_${plan.classification}`,
      status: success ? "RECOVERED" : "FAILED",
      executionTimeMs: 45,
      estimatedCostUsd: 0,
      validationPassed: success,
      errorDetails: {
        code: plan.classification,
        message: plan.rationale,
        classification: plan.classification,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
