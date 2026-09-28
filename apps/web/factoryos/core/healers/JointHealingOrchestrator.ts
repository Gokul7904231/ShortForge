import { randomUUID } from "node:crypto";
import type { Case } from "../contracts/CaseContracts";
import type { HealerReport, RepairAction } from "../contracts/HealerContracts";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { WorldStateEngine } from "../worldstate/WorldStateEngine";
import { BorderDefenseAgent } from "../governance/BorderDefenseAgent";
import {
  JointHealingSessionManager,
} from "../governance/JointHealingSession";
import type {
  JointHealingSessionRecord,
  MutationLease,
} from "../governance/FloorGovernanceContracts";
import { DiskJointHealingSessionStore } from "../governance/JointHealingSessionStore";
import type { CaseManager } from "../cases/CaseManager";
import { RepairDependencyAnalyzer } from "./RepairDependencyAnalyzer";
import { RepairLockManager } from "./RepairLockManager";
import type { BaseHealer, HealerDiagnosis } from "./HealerBase";
import { JointHealingAuditor, type JointHealingAuditResult } from "./JointHealingAuditor";

export interface GuardianClosureRequest {
  readonly incidentId: string;
  readonly floorId: string;
  readonly sessionId: string;
  readonly evidenceRefs: readonly string[];
  readonly bdaPass: boolean;
  readonly auditorPass: boolean;
}

export interface GuardianClosureDecision {
  readonly authorized: boolean;
  readonly grantId?: string;
  readonly reason: string;
}

export interface JointHealingOrchestratorOptions {
  readonly storagePath?: string;
  readonly sessionManager?: JointHealingSessionManager;
  readonly bda?: BorderDefenseAgent;
  readonly auditor?: JointHealingAuditor;
  readonly guardianClosureAuthorizer: (
    request: GuardianClosureRequest
  ) => Promise<GuardianClosureDecision>;
}

interface MutationTask {
  readonly taskId: string;
  readonly resourceId: string;
  readonly healer: BaseHealer;
  readonly action: RepairAction;
}

export interface JointHealingExecution {
  readonly session: JointHealingSessionRecord;
  readonly reports: readonly HealerReport[];
  readonly bdaReinspectionPassed: boolean;
  readonly auditor: JointHealingAuditResult;
  readonly guardianClosure: GuardianClosureDecision;
}

export class JointHealingOrchestrator {
  private readonly sessionManager: JointHealingSessionManager;
  private readonly bda: BorderDefenseAgent;
  private readonly auditor: JointHealingAuditor;
  private readonly dependencyAnalyzer = new RepairDependencyAnalyzer();
  private readonly caseManager: CaseManager;
  private readonly eventBus: DurableEventBus;
  private readonly worldState: WorldStateEngine;
  private readonly lockManager: RepairLockManager;
  private readonly guardianClosureAuthorizer: JointHealingOrchestratorOptions["guardianClosureAuthorizer"];

  constructor(
    caseManager: CaseManager,
    eventBus: DurableEventBus,
    worldState: WorldStateEngine,
    lockManager: RepairLockManager,
    options: JointHealingOrchestratorOptions
  ) {
    this.caseManager = caseManager;
    this.eventBus = eventBus;
    this.worldState = worldState;
    this.lockManager = lockManager;
    this.sessionManager =
      options.sessionManager ||
      new JointHealingSessionManager(new DiskJointHealingSessionStore(options.storagePath));
    this.bda = options.bda || new BorderDefenseAgent();
    this.auditor = options.auditor || new JointHealingAuditor();
    this.guardianClosureAuthorizer = options.guardianClosureAuthorizer;
  }

  async execute(caseItem: Case, healers: readonly BaseHealer[]): Promise<JointHealingExecution> {
    if (healers.length !== 2) {
      throw new Error("Wave-3 joint healing requires exactly two paired healers");
    }
    if (healers[0].config.healerId === healers[1].config.healerId) {
      throw new Error("Wave-3 joint healing requires distinct healer identities");
    }

    const incident = await this.caseManager.getCase(caseItem.caseId);
    if (!incident) throw new Error(`Case ${caseItem.caseId} not found`);

    await this.caseManager.assignHealers(
      incident.caseId,
      healers.map((healer) => healer.config.healerId)
    );

    if (incident.status === "INVESTIGATING" || incident.status === "ROOT_CAUSE_IDENTIFIED") {
      await this.caseManager.transitionStatus(
        incident.caseId,
        "HEALING",
        "joint_healing_orchestrator",
        "Entering paired healing with resource-scoped mutation control"
      );
    }

    const session = this.sessionManager.createSession(
      incident.caseId,
      incident.floorId,
      healers[0].config.healerId,
      healers[1].config.healerId
    );

    await this.eventBus.publish("JOINT_HEALING_STARTED", {
      sessionId: session.sessionId,
      incidentId: incident.caseId,
      floorId: incident.floorId,
      healerIds: healers.map((healer) => healer.config.healerId),
    });

    this.sessionManager.transition(session.sessionId, "DIAGNOSING");

    // Think in parallel. No healer mutation is allowed in this phase.
    const diagnoses = await Promise.all(
      healers.map((healer) => healer.diagnose(incident))
    );

    const evidenceRefs: string[] = [];
    for (const diagnosis of diagnoses) {
      for (const evidence of diagnosis.independentEvidence) {
        await this.caseManager.addEvidence(incident.caseId, evidence, diagnosis.healerId);
        evidenceRefs.push(evidence.evidenceId);
      }
    }

    const allHypothesesVerified = diagnoses.every((diagnosis) => diagnosis.verified);
    if (!allHypothesesVerified) {
      const failed = this.sessionManager.transition(session.sessionId, "ESCALATED");
      await this.caseManager.transitionStatus(
        incident.caseId,
        "ESCALATED",
        "joint_healing_orchestrator",
        "Paired diagnosis did not independently verify the incident hypothesis"
      );
      const reports = this.buildReports(diagnoses, new Map(), 0, "ESCALATED");
      return {
        session: failed,
        reports,
        bdaReinspectionPassed: false,
        auditor: {
          passed: false,
          reasons: ["paired_diagnosis_not_verified"],
          evidenceRefs,
          auditedAt: new Date().toISOString(),
        },
        guardianClosure: { authorized: false, reason: "diagnosis_not_verified" },
      };
    }

    this.sessionManager.transition(session.sessionId, "PLANNED");
    this.sessionManager.checkpoint(
      session.sessionId,
      "PLANNED",
      evidenceRefs,
      diagnoses.flatMap((diagnosis) => diagnosis.repairPlan.actions.map((action) => action.actionId))
    );

    const mutationResult = await this.executeMutations(
      incident,
      session.sessionId,
      diagnoses
    );

    if (!mutationResult.success) {
      const failedSession = this.sessionManager.transition(session.sessionId, "FAILED");
      await this.caseManager.transitionStatus(
        incident.caseId,
        "FAILED",
        "joint_healing_orchestrator",
        mutationResult.reason || "Paired healing mutation failed"
      );
      const reports = this.buildReports(
        diagnoses,
        mutationResult.executedActionsByHealer,
        mutationResult.durationMs,
        "FAILED"
      );
      return {
        session: failedSession,
        reports,
        bdaReinspectionPassed: false,
        auditor: {
          passed: false,
          reasons: [mutationResult.reason || "mutation_failed"],
          evidenceRefs,
          auditedAt: new Date().toISOString(),
        },
        guardianClosure: { authorized: false, reason: "mutation_failed" },
      };
    }

    this.sessionManager.transition(session.sessionId, "VERIFYING");
    await this.caseManager.transitionStatus(
      incident.caseId,
      "VERIFYING",
      "joint_healing_orchestrator",
      "Paired mutations completed; independent boundary verification required"
    );

    const mutationEvidence = diagnoses.flatMap((diagnosis) =>
      diagnosis.repairPlan.actions.map((action) => action.actionId)
    );

    const borderEvent = this.bda.admit({
      sourceFloor: incident.floorId,
      destinationFloor: "healing_verification_plane",
      direction: "EGRESS",
      actor: "joint_healing_orchestrator",
      contractVersion: "wave3.v1",
      capability: "healing.reinspection",
      authorizationRef: `session:${session.sessionId}`,
      payload: {
        sessionId: session.sessionId,
        incidentId: incident.caseId,
        floorId: incident.floorId,
        mutationEvidence,
        diagnoses: diagnoses.map((diagnosis) => ({
          healerId: diagnosis.healerId,
          diagnosis: diagnosis.diagnosis,
          actionIds: diagnosis.repairPlan.actions.map((action) => action.actionId),
        })),
        worldState: this.worldState.getState(),
      },
      artifactIds: [],
      lineageRefs: [incident.caseId, session.sessionId],
    });

    if ("denied" in borderEvent) {
      const escalated = this.sessionManager.transition(session.sessionId, "ESCALATED");
      await this.caseManager.transitionStatus(
        incident.caseId,
        "ESCALATED",
        "joint_healing_orchestrator",
        `BDA rejected healing reinspection: ${borderEvent.reason}`
      );
      return {
        session: escalated,
        reports: this.buildReports(diagnoses, mutationResult.executedActionsByHealer, mutationResult.durationMs, "ESCALATED"),
        bdaReinspectionPassed: false,
        auditor: {
          passed: false,
          reasons: [`bda_admission_denied:${borderEvent.reason}`],
          evidenceRefs,
          auditedAt: new Date().toISOString(),
        },
        guardianClosure: { authorized: false, reason: "bda_reinspection_failed" },
      };
    }

    const dossier = this.bda.egress(borderEvent, {
      sessionId: session.sessionId,
      incidentId: incident.caseId,
      floorId: incident.floorId,
      policyDecision: "ALLOW",
      mutationEvidence,
      worldState: this.worldState.getState(),
    }, {
      expectedKeys: ["sessionId", "incidentId", "floorId", "mutationEvidence", "worldState"],
      evidenceRefs: [...evidenceRefs, session.sessionId],
      policyAllowed: true,
    });

    await this.eventBus.publish(
      dossier.policyDecision === "ALLOW" && dossier.anomalies.length === 0
        ? "HEALING_BDA_REINSPECTION_PASSED"
        : "HEALING_BDA_REINSPECTION_FAILED",
      {
        sessionId: session.sessionId,
        incidentId: incident.caseId,
        borderEventId: dossier.borderEventId,
        policyDecision: dossier.policyDecision,
        anomalies: dossier.anomalies,
        inputHash: dossier.inputHash,
        outputHash: dossier.outputHash,
      },
      {
        correlationId: incident.caseId,
        source: "joint_healing_orchestrator",
        idempotencyKey: `jhs:bda:${session.sessionId}`,
      }
    );

    const reports = this.buildReports(
      diagnoses,
      mutationResult.executedActionsByHealer,
      mutationResult.durationMs,
      "SUCCESS"
    );

    const audit = this.auditor.verify({
      session: this.sessionManager.get(session.sessionId)!,
      caseItem: (await this.caseManager.getCase(incident.caseId))!,
      reports,
      bdaReinspection: dossier,
      activeLocks: this.lockManager.getAllActiveLocks(),
    });

    await this.eventBus.publish(
      audit.passed ? "JOINT_HEALING_AUDIT_PASSED" : "JOINT_HEALING_AUDIT_FAILED",
      {
        sessionId: session.sessionId,
        incidentId: incident.caseId,
        passed: audit.passed,
        reasons: audit.reasons,
        evidenceRefs: audit.evidenceRefs,
      },
      {
        correlationId: incident.caseId,
        source: "joint_healing_auditor",
        idempotencyKey: `jhs:audit:${session.sessionId}`,
      }
    );

    if (!audit.passed) {
      const escalated = this.sessionManager.transition(session.sessionId, "ESCALATED");
      await this.caseManager.transitionStatus(
        incident.caseId,
        "ESCALATED",
        "joint_healing_auditor",
        audit.reasons.join("; ")
      );
      return {
        session: escalated,
        reports,
        bdaReinspectionPassed: false,
        auditor: audit,
        guardianClosure: { authorized: false, reason: "auditor_rejected_closure" },
      };
    }

    const closure = await this.guardianClosureAuthorizer({
      incidentId: incident.caseId,
      floorId: incident.floorId,
      sessionId: session.sessionId,
      evidenceRefs: Array.from(new Set([...evidenceRefs, ...audit.evidenceRefs])),
      bdaPass: true,
      auditorPass: true,
    });

    await this.eventBus.publish(
      closure.authorized ? "GUARDIAN_CLOSURE_GRANTED" : "GUARDIAN_CLOSURE_DENIED",
      {
        sessionId: session.sessionId,
        incidentId: incident.caseId,
        grantId: closure.grantId,
        reason: closure.reason,
      },
      {
        correlationId: incident.caseId,
        source: "joint_healing_orchestrator",
        idempotencyKey: `jhs:closure:${session.sessionId}`,
      }
    );

    if (!closure.authorized) {
      const escalated = this.sessionManager.transition(session.sessionId, "ESCALATED");
      await this.caseManager.transitionStatus(
        incident.caseId,
        "ESCALATED",
        "joint_healing_orchestrator",
        `Guardian closure denied: ${closure.reason}`
      );
      return {
        session: escalated,
        reports,
        bdaReinspectionPassed: true,
        auditor: audit,
        guardianClosure: closure,
      };
    }

    const resolutionProof = {
      incidentId: incident.caseId,
      bdaPass: true,
      auditorPass: true,
      guardianClosureGrant: true,
      verifiedAt: new Date().toISOString(),
    } as const;

    await this.caseManager.recordResolution(
      incident.caseId,
      "Joint healing completed with BDA reinspection, independent Auditor verification, and Guardian closure grant.",
      Array.from(new Set(audit.evidenceRefs)),
      "joint_healing_orchestrator"
    );

    await this.caseManager.resolveCase(incident.caseId, {
      diagnosis: diagnoses.map((diagnosis) => diagnosis.diagnosis).join(" | "),
      resolutionPlan: "Paired healer mutation completed under resource-scoped fencing.",
      healerId: healers.map((healer) => healer.config.healerId).join(","),
      actionsTaken: mutationEvidence,
      verifiedAt: resolutionProof.verifiedAt,
      resolutionProof,
    });

    const completed = this.sessionManager.complete(session.sessionId, true, true);
    const finalReports = this.buildReports(
      diagnoses,
      mutationResult.executedActionsByHealer,
      mutationResult.durationMs,
      "SUCCESS"
    );

    await this.eventBus.publish("JOINT_HEALING_COMPLETED", {
      sessionId: session.sessionId,
      incidentId: incident.caseId,
      floorId: incident.floorId,
      healerIds: healers.map((healer) => healer.config.healerId),
      evidenceRefs: audit.evidenceRefs,
      guardianGrantId: closure.grantId,
    });

    return {
      session: completed,
      reports: finalReports,
      bdaReinspectionPassed: true,
      auditor: audit,
      guardianClosure: closure,
    };
  }

  private async executeMutations(
    incident: Case,
    sessionId: string,
    diagnoses: readonly HealerDiagnosis[]
  ): Promise<{
    success: boolean;
    reason?: string;
    durationMs: number;
    executedActionsByHealer: Map<string, RepairAction[]>;
  }> {
    const start = Date.now();
    const dependency = this.dependencyAnalyzer.analyzeDependency(incident);
    const tasks = diagnoses.flatMap((diagnosis) =>
      diagnosis.repairPlan.actions.map((action) => ({
        taskId: `mut_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
        resourceId: action.target,
        healer: diagnoses.find((item) => item.healerId === diagnosis.healerId) ? undefined : undefined,
        action,
      }))
    );

    // Resolve healer references after flattening to keep diagnosis immutable.
    const healerById = new Map(diagnoses.map((diagnosis, index) => [diagnosis.healerId, index]));
    const resolvedTasks: MutationTask[] = tasks.map((task, index) => ({
      taskId: task.taskId,
      resourceId: task.resourceId,
      healer: diagnoses[healerById.get(diagnoses[index % diagnoses.length].healerId) || 0] as never,
      action: task.action,
    }));

    // The planner below uses the actual healer id encoded by each action plan.
    // Rebuild deterministically from diagnosis order.
    const allTasks: MutationTask[] = [];
    for (const diagnosis of diagnoses) {
      const owner = (diagnosis as HealerDiagnosis & { __healer?: BaseHealer }).__healer;
      if (!owner) {
        throw new Error(`Missing healer binding for diagnosis ${diagnosis.healerId}`);
      }
      for (const action of diagnosis.repairPlan.actions) {
        allTasks.push({
          taskId: `mut_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
          resourceId: action.target,
          healer: owner,
          action,
        });
      }
    }

    const groups: MutationTask[][] = [];
    for (const task of allTasks) {
      let group = groups.find((candidate) =>
        candidate.some((existing) => this.resourcesConflict(
          existing.resourceId,
          task.resourceId,
          dependency.blastRadius,
          new Set([dependency.primaryResourceId, ...dependency.dependentResourceIds])
        ))
      );
      if (!group) {
        group = [];
        groups.push(group);
      }
      group.push(task);
    }

    const executedActionsByHealer = new Map<string, RepairAction[]>();
    let failure: string | undefined;

    await Promise.all(groups.map(async (group) => {
      for (const task of group.sort((a, b) => a.taskId.localeCompare(b.taskId))) {
        if (failure) return;

        const lease = await this.lockManager.acquireMutationLease(
          task.resourceId,
          sessionId,
          task.healer.config.healerId,
          incident.caseId,
          `healing.mutate:${task.action.actionType}`,
          [task.action.actionType],
          30000
        );

        if (!lease) {
          failure = `mutation_resource_busy:${task.resourceId}`;
          return;
        }

        this.sessionManager.noteMutationLease(lease);
        try {
          const valid = this.lockManager.validateMutationLease(lease);
          if (!valid.valid || !lease.actionScope.includes(task.action.actionType)) {
            failure = valid.reason || "mutation_lease_invalid";
            return;
          }

          const applied = await task.healer.executeAction(task.action);
          if (!applied) {
            failure = `mutation_failed:${task.action.actionType}`;
            return;
          }

          const appliedAction = {
            ...task.action,
            status: "APPLIED" as const,
            executedAt: new Date().toISOString(),
          };
          const current = executedActionsByHealer.get(task.healer.config.healerId) || [];
          executedActionsByHealer.set(task.healer.config.healerId, [...current, appliedAction]);

          await this.eventBus.publish("JOINT_HEALING_MUTATION_APPLIED", {
            sessionId,
            incidentId: incident.caseId,
            healerId: task.healer.config.healerId,
            resourceId: task.resourceId,
            fencingEpoch: lease.fencingEpoch,
            actionId: task.action.actionId,
            actionType: task.action.actionType,
          });
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error);
        } finally {
          await this.lockManager.releaseMutationLease(lease);
        }
      }
    }));

    if (failure) {
      for (const diagnosis of diagnoses) {
        const owner = (diagnosis as HealerDiagnosis & { __healer?: BaseHealer }).__healer;
        if (!owner) continue;
        const applied = executedActionsByHealer.get(owner.config.healerId) || [];
        for (const action of [...applied].reverse()) {
          const lease = await this.lockManager.acquireMutationLease(
            action.target,
            sessionId,
            owner.config.healerId,
            incident.caseId,
            `healing.rollback:${action.actionType}`,
            [action.actionType],
            30000
          );
          if (!lease) continue;
          try {
            const valid = this.lockManager.validateMutationLease(lease);
            if (valid.valid) {
              await owner.rollbackAction(action);
            }
          } finally {
            await this.lockManager.releaseMutationLease(lease);
          }
        }
      }
    }

    return {
      success: !failure,
      reason: failure,
      durationMs: Date.now() - start,
      executedActionsByHealer,
    };
  }

  private resourcesConflict(
    resourceA: string,
    resourceB: string,
    blastRadius: "LOCAL" | "CROSS_FLOOR" | "GLOBAL",
    dependencyResources: ReadonlySet<string>
  ): boolean {
    if (resourceA === resourceB) return true;
    if (blastRadius === "GLOBAL") return true;

    const a = `res:${resourceA}`;
    const b = `res:${resourceB}`;
    return dependencyResources.has(a) && dependencyResources.has(b);
  }

  private buildReports(
    diagnoses: readonly HealerDiagnosis[],
    executedActionsByHealer: Map<string, RepairAction[]>,
    durationMs: number,
    status: HealerReport["repairStatus"]
  ): HealerReport[] {
    return diagnoses.map((diagnosis) => ({
      reportId: `jhr_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      caseId: diagnosis.repairPlan.actions[0]?.parameters?.caseId
        ? String(diagnosis.repairPlan.actions[0].parameters.caseId)
        : "joint-healing",
      healerId: diagnosis.healerId,
      specialization: "DIAGNOSTIC",
      slayerHypothesisVerified: diagnosis.verified,
      rootCauseDiagnosis: diagnosis.diagnosis,
      independentEvidence: diagnosis.independentEvidence,
      repairPlan: {
        description: diagnosis.repairPlan.description,
        actions: executedActionsByHealer.get(diagnosis.healerId) || [],
        rollbackActions: diagnosis.repairPlan.rollbackActions,
      },
      repairStatus: status,
      durationMs,
      completedAt: new Date().toISOString(),
    }));
  }
}
