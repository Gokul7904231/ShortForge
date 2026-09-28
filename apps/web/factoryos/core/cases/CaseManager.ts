/**
 * FactoryOS v1 — Durable Case Management Engine
 * Manages anomaly lifecycles, deduplication, evidence aggregation, and resolution timelines.
 */

import { randomUUID } from "node:crypto";
import type {
  Case,
  CaseEvidence,
  CaseHypothesis,
  CaseStatus,
  CaseTimelineEntry,
  AnomalyCategory,
  AnomalySeverity,
} from "../contracts/CaseContracts";
import type { ICaseRepository } from "../database/DatabaseContracts";
import { InMemoryCaseRepository } from "../database/InMemoryDatabase";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { WorldStateEngine } from "../worldstate/WorldStateEngine";
import { ResolutionGate } from "../governance/ResolutionGate";
import type { ResolutionProof } from "../governance/FloorGovernanceContracts";

export interface CreateCaseParams {
  readonly title: string;
  readonly description: string;
  readonly floorId: string;
  readonly category: AnomalyCategory;
  readonly severity: AnomalySeverity;
  readonly detectorId: string;
  readonly targetWorker?: string;
  readonly jobId?: string;
  readonly symptoms: string[];
  readonly observedState: Record<string, unknown>;
  readonly baselineState?: Record<string, unknown>;
  readonly initialEvidence?: CaseEvidence[];
  readonly priority?: number;
}

const ALLOWED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  DETECTED: ["TRIAGED", "INVESTIGATING", "HEALING", "DUPLICATE", "BLOCKED", "ESCALATED", "FAILED"],
  TRIAGED: ["INVESTIGATING", "HEALING", "BLOCKED", "ESCALATED", "DUPLICATE", "FAILED"],
  INVESTIGATING: ["ROOT_CAUSE_IDENTIFIED", "HEALING", "VERIFYING", "BLOCKED", "ESCALATED", "FAILED"],
  ROOT_CAUSE_IDENTIFIED: ["HEALING", "VERIFYING", "BLOCKED", "ESCALATED", "FAILED"],
  HEALING: ["VERIFYING", "ROLLED_BACK", "FAILED", "BLOCKED", "ESCALATED"],
  VERIFYING: ["RESOLVED", "HEALING", "ROLLED_BACK", "FAILED", "ESCALATED"],
  RESOLVED: [],
  FAILED: ["INVESTIGATING", "HEALING", "ESCALATED"],
  ROLLED_BACK: ["INVESTIGATING", "HEALING", "ESCALATED"],
  BLOCKED: ["INVESTIGATING", "HEALING", "ESCALATED"],
  ESCALATED: ["INVESTIGATING", "HEALING"],
  DUPLICATE: [],
};

export class CaseManager {
  private repository: ICaseRepository;
  private eventBus?: DurableEventBus;
  private worldState?: WorldStateEngine;
  private readonly resolutionGate: ResolutionGate;

  constructor(
    repository: ICaseRepository = new InMemoryCaseRepository(),
    eventBus?: DurableEventBus,
    worldState?: WorldStateEngine,
    resolutionGate: ResolutionGate = new ResolutionGate()
  ) {
    this.repository = repository;
    this.eventBus = eventBus;
    this.worldState = worldState;
    this.resolutionGate = resolutionGate;
  }

  async createCase(params: CreateCaseParams): Promise<Case> {
    const now = new Date().toISOString();
    const caseId = `case_${randomUUID().replace(/-/g, "").substring(0, 12)}`;

    // Check for potential duplicate active case on the same floor and category
    const activeCases = await this.repository.getActiveCases();
    const duplicate = activeCases.find(
      (c) =>
        c.floorId === params.floorId &&
        c.category === params.category &&
        c.targetWorker === params.targetWorker &&
        c.status !== "RESOLVED" &&
        c.status !== "DUPLICATE"
    );

    const initialTimeline: CaseTimelineEntry = {
      timestamp: now,
      actor: params.detectorId,
      action: "CASE_CREATED",
      toStatus: duplicate ? "DUPLICATE" : "DETECTED",
      notes: duplicate
        ? `Marked as duplicate of existing active case ${duplicate.caseId}`
        : `Created case for ${params.category} on floor ${params.floorId}`,
    };

    const newCase: Case = {
      caseId,
      title: params.title,
      description: params.description,
      floorId: params.floorId,
      targetWorker: params.targetWorker,
      jobId: params.jobId,
      category: params.category,
      severity: params.severity,
      priority: params.priority || (params.severity === "CRITICAL" ? 1 : params.severity === "HIGH" ? 2 : 5),
      status: duplicate ? "DUPLICATE" : "DETECTED",
      detectorId: params.detectorId,
      createdAt: now,
      updatedAt: now,
      symptoms: [...params.symptoms],
      observedState: structuredClone(params.observedState),
      baselineState: params.baselineState ? structuredClone(params.baselineState) : undefined,
      evidence: params.initialEvidence ? structuredClone(params.initialEvidence) : [],
      hypotheses: [],
      parentCaseId: duplicate ? duplicate.caseId : undefined,
      linkedCaseIds: [],
      assignedHealerIds: [],
      healerCountAllocated: 0,
      timeline: [initialTimeline],
    };

    if (duplicate) {
      // Link into parent case
      duplicate.linkedCaseIds.push(caseId);
      duplicate.timeline.push({
        timestamp: now,
        actor: "CaseManager",
        action: "LINKED_DUPLICATE_CASE",
        notes: `Linked duplicate case ${caseId} (${params.title})`,
      });
      await this.repository.updateCase(duplicate);
    }

    const saved = await this.repository.createCase(newCase);

    if (!duplicate) {
      this.worldState?.addActiveCase(caseId);
      this.worldState?.recordFloorAnomaly(params.floorId, caseId);
      await this.eventBus?.publish("CASE_CREATED", {
        caseId,
        floorId: params.floorId,
        category: params.category,
        severity: params.severity,
        detectorId: params.detectorId,
        title: params.title,
      });
    }

    return saved;
  }

  async getCase(caseId: string): Promise<Case | null> {
    return this.repository.getCaseById(caseId);
  }

  async getActiveCases(): Promise<Case[]> {
    return this.repository.getActiveCases();
  }

  async transitionStatus(
    caseId: string,
    targetStatus: CaseStatus,
    actor: string,
    notes?: string
  ): Promise<Case> {
    const existing = await this.repository.getCaseById(caseId);
    if (!existing) {
      throw new Error(`Case ${caseId} not found`);
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new Error(
        `Invalid case transition from ${existing.status} to ${targetStatus} for Case ${caseId}`
      );
    }

    const prevStatus = existing.status;
    existing.status = targetStatus;
    existing.timeline.push({
      timestamp: new Date().toISOString(),
      actor,
      action: `TRANSITION_TO_${targetStatus}`,
      fromStatus: prevStatus,
      toStatus: targetStatus,
      notes,
    });

    const updated = await this.repository.updateCase(existing);

    if (targetStatus === "RESOLVED") {
      this.worldState?.removeActiveCase(caseId);
      await this.eventBus?.publish("CASE_RESOLVED", {
        caseId,
        resolvedBy: actor,
        duration: Date.now() - new Date(updated.createdAt).getTime(),
      });
    } else if (targetStatus === "ESCALATED") {
      await this.eventBus?.publish("CASE_ESCALATED", {
        caseId,
        actor,
        notes,
      });
    } else {
      await this.eventBus?.publish("CASE_UPDATED", {
        caseId,
        status: targetStatus,
        actor,
      });
    }

    return updated;
  }

  async addEvidence(caseId: string, evidence: CaseEvidence, actor: string): Promise<Case> {
    const existing = await this.repository.getCaseById(caseId);
    if (!existing) throw new Error(`Case ${caseId} not found`);

    existing.evidence.push(structuredClone(evidence));
    existing.timeline.push({
      timestamp: new Date().toISOString(),
      actor,
      action: "EVIDENCE_ADDED",
      notes: `Added ${evidence.type} evidence: ${evidence.description}`,
    });

    return this.repository.updateCase(existing);
  }

  async addHypothesis(caseId: string, hypothesis: CaseHypothesis, actor: string): Promise<Case> {
    const existing = await this.repository.getCaseById(caseId);
    if (!existing) throw new Error(`Case ${caseId} not found`);

    existing.hypotheses.push(structuredClone(hypothesis));
    existing.timeline.push({
      timestamp: new Date().toISOString(),
      actor,
      action: "HYPOTHESIS_ADDED",
      notes: `Added hypothesis: ${hypothesis.theory} (likelihood: ${hypothesis.likelihood})`,
    });

    return this.repository.updateCase(existing);
  }

  async assignSlayer(caseId: string, slayerId: string): Promise<Case> {
    const existing = await this.repository.getCaseById(caseId);
    if (!existing) throw new Error(`Case ${caseId} not found`);

    existing.assignedSlayerId = slayerId;
    existing.timeline.push({
      timestamp: new Date().toISOString(),
      actor: "Overseer",
      action: "SLAYER_ASSIGNED",
      notes: `Assigned Slayer ${slayerId}`,
    });

    const updated = await this.repository.updateCase(existing);
    await this.eventBus?.publish("SLAYER_ASSIGNED", { caseId, slayerId });
    return updated;
  }

  async assignHealers(caseId: string, healerIds: string[]): Promise<Case> {
    const existing = await this.repository.getCaseById(caseId);
    if (!existing) throw new Error(`Case ${caseId} not found`);

    existing.assignedHealerIds = [...healerIds];
    existing.healerCountAllocated = healerIds.length;
    existing.timeline.push({
      timestamp: new Date().toISOString(),
      actor: "Overseer",
      action: "HEALERS_DISPATCHED",
      notes: `Dispatched ${healerIds.length} healers: ${healerIds.join(", ")}`,
    });

    const updated = await this.repository.updateCase(existing);
    await this.eventBus?.publish("HEALER_DISPATCHED", { caseId, healerIds });
    return updated;
  }

  async setRootCause(caseId: string, rootCause: string, actor: string): Promise<Case> {
    const existing = await this.repository.getCaseById(caseId);
    if (!existing) throw new Error(`Case ${caseId} not found`);

    existing.rootCause = rootCause;
    existing.timeline.push({
      timestamp: new Date().toISOString(),
      actor,
      action: "ROOT_CAUSE_IDENTIFIED",
      notes: `Root cause identified: ${rootCause}`,
    });

    const updated = await this.repository.updateCase(existing);
    await this.eventBus?.publish("ROOT_CAUSE_IDENTIFIED", { caseId, rootCause, actor });
    return updated;
  }

  async recordResolution(
    caseId: string,
    summary: string,
    lessonsLearned: string[],
    actor: string
  ): Promise<Case> {
    const existing = await this.repository.getCaseById(caseId);
    if (!existing) throw new Error(`Case ${caseId} not found`);

    existing.resolutionSummary = summary;
    existing.lessonsLearned = [...lessonsLearned];
    existing.timeline.push({
      timestamp: new Date().toISOString(),
      actor,
      action: "RESOLUTION_RECORDED",
      notes: summary,
    });

    return this.repository.updateCase(existing);
  }

  async resolveCase(
    caseId: string,
    resolutionDetails?: {
      diagnosis?: string;
      resolutionPlan?: string;
      healerId?: string;
      actionsTaken?: string[];
      verifiedAt?: string;
      resolutionProof?: ResolutionProof;
    }
  ): Promise<Case> {
    const existing = await this.repository.getCaseById(caseId);
    if (!existing) throw new Error(`Case ${caseId} not found`);

    const proof = resolutionDetails?.resolutionProof;
    if (!proof) {
      throw new Error("ResolutionGate proof is required for direct case resolution");
    }
    const gate = this.resolutionGate.evaluate(proof);
    if (!gate.allowed) {
      throw new Error(`ResolutionGate rejected case resolution: ${gate.reason}`);
    }

    if (existing.status !== "RESOLVED") {
      const prevStatus = existing.status;
      existing.status = "RESOLVED";
      if (resolutionDetails?.resolutionPlan) {
        existing.resolutionSummary = resolutionDetails.resolutionPlan;
      }
      existing.timeline.push({
        timestamp: new Date().toISOString(),
        actor: resolutionDetails?.healerId || "Healer",
        action: "TRANSITION_TO_RESOLVED",
        fromStatus: prevStatus,
        toStatus: "RESOLVED",
        notes: resolutionDetails?.diagnosis || "Case resolved",
      });
      const updated = await this.repository.updateCase(existing);
      this.worldState?.removeActiveCase(caseId);
      await this.eventBus?.publish("CASE_RESOLVED", {
        caseId,
        resolvedBy: resolutionDetails?.healerId || "Healer",
        duration: Date.now() - new Date(updated.createdAt).getTime(),
      });
      return updated;
    }
    return existing;
  }

  async getAllCases(): Promise<Case[]> {
    return this.repository.getAllCases();
  }
}
