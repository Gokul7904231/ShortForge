/**
 * FactoryOS Frontier v2 — Base Slayer Detective Agent
 * Implements lease-isolated zone ownership, investigation budget bounds,
 * confidence calibration, structured evidence collection, and continuous hunting lifecycle.
 */

import { randomUUID } from "node:crypto";
import type {
  AnomalyCategory,
  AnomalySeverity,
  CaseEvidence,
  CaseHypothesis,
} from "../contracts/CaseContracts";
import type {
  AnomalyObservation,
  InvestigationBudget,
  SlayerAgentConfig,
  SlayerHealth,
  SlayerReport,
  SlayerReputation,
} from "../contracts/SlayerContracts";
import type { WorldState } from "../contracts/WorldStateContracts";
import type { CaseManager } from "../cases/CaseManager";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { LeaseManager } from "../leases/LeaseManager";
import { SlayerConfidenceEngine } from "./SlayerConfidenceEngine";

export abstract class BaseSlayer {
  readonly config: SlayerAgentConfig;
  protected caseManager: CaseManager;
  protected eventBus: DurableEventBus;
  protected leaseManager?: LeaseManager;
  protected confidenceEngine: SlayerConfidenceEngine;

  protected reputation: SlayerReputation;
  protected budget: InvestigationBudget;
  protected isInvestigating: boolean = false;
  protected isRunning: boolean = false;
  protected currentInvestigationId?: string;
  protected lastHeartbeatTime: string;

  constructor(
    config: SlayerAgentConfig,
    caseManager: CaseManager,
    eventBus: DurableEventBus,
    leaseManager?: LeaseManager
  ) {
    this.config = config;
    this.caseManager = caseManager;
    this.eventBus = eventBus;
    this.leaseManager = leaseManager;
    this.confidenceEngine = new SlayerConfidenceEngine(2);
    this.lastHeartbeatTime = new Date().toISOString();

    this.budget = {
      maxInvestigationDepth: config.budget?.maxInvestigationDepth ?? 3,
      maxDurationMs: config.budget?.maxDurationMs ?? 5000,
      maxEvidenceCount: config.budget?.maxEvidenceCount ?? 10,
      maxSubcalls: config.budget?.maxSubcalls ?? 5,
      maxToolInvocations: config.budget?.maxToolInvocations ?? 5,
      maxTokens: config.budget?.maxTokens ?? 2000,
      maxCostUsd: config.budget?.maxCostUsd ?? 0.05,
    };

    this.reputation = {
      agentId: config.agentId,
      specialization: config.specialization,
      xp: 100,
      trustScore: 0.95,
      casesDiscovered: 0,
      validAnomalies: 0,
      falsePositives: 0,
      rootCauseAccuracy: 0.9,
      evidenceQualityScore: 0.9,
      lastUpdated: new Date().toISOString(),
    };
  }

  getReputation(): SlayerReputation {
    return structuredClone(this.reputation);
  }

  updateReputation(verified: boolean, isFalsePositive: boolean = false): void {
    if (verified) {
      this.reputation.xp += 50;
      this.reputation.validAnomalies += 1;
      this.reputation.casesDiscovered += 1;
      this.reputation.trustScore = Math.min(1.0, this.reputation.trustScore + 0.02);
    } else if (isFalsePositive) {
      this.reputation.falsePositives += 1;
      this.reputation.trustScore = Math.max(0.1, this.reputation.trustScore - 0.08);
    }
    this.reputation.lastUpdated = new Date().toISOString();
  }

  getHealth(): SlayerHealth {
    const totalReports = this.reputation.validAnomalies + this.reputation.falsePositives;
    const fpRate = totalReports > 0 ? this.reputation.falsePositives / totalReports : 0;

    let status: SlayerHealth["status"] = "PATROLLING";
    if (!this.isRunning) status = "STARTING";
    else if (this.isInvestigating) status = "INVESTIGATING";

    return {
      slayerId: this.config.agentId,
      specialization: this.config.specialization,
      status,
      lastHeartbeat: this.lastHeartbeatTime,
      currentZone: this.config.zoneId,
      currentInvestigationId: this.currentInvestigationId,
      investigationsCompleted: this.reputation.validAnomalies,
      falsePositiveRate: Math.round(fpRate * 100) / 100,
      confidenceScore: this.reputation.trustScore,
    };
  }

  /**
   * Acquires or renews the detection zone lease before patrol work.
   */
  async ensureZoneOwnership(): Promise<boolean> {
    if (!this.leaseManager) return true;

    this.lastHeartbeatTime = new Date().toISOString();
    const zoneLease = await this.leaseManager.acquire(
      this.config.zoneId,
      this.config.agentId,
      30000 // 30s TTL
    );

    if (!zoneLease) {
      await this.eventBus.publish("SLAYER_ZONE_LOST", {
        agentId: this.config.agentId,
        zoneId: this.config.zoneId,
        reason: "Zone lease acquired by another agent or expired",
      });
      return false;
    }

    return true;
  }

  /**
   * Main patrol tick — inspects state and telemetry.
   */
  abstract inspect(worldState: WorldState): Promise<AnomalyObservation | null>;

  /**
   * Autonomous Patrol & Detective Execution:
   * Inspect -> Calibrate Confidence -> Investigate -> Hypothesis/Evidence -> File Case -> Return to Patrol
   */
  async patrolAndInvestigate(worldState: WorldState): Promise<SlayerReport | null> {
    this.isRunning = true;
    this.lastHeartbeatTime = new Date().toISOString();

    // 1. Verify zone ownership
    const hasLease = await this.ensureZoneOwnership();
    if (!hasLease) return null;

    // 2. Inspect domain telemetry
    const observation = await this.inspect(worldState);
    if (!observation) return null;

    // 3. Evaluate Confidence & False-Positive Dampening
    const confidenceEval = this.confidenceEngine.evaluateConfidence(observation, this.reputation);
    if (!confidenceEval.isConfirmed) {
      return null; // Dampened transient signal
    }

    // 4. Publish a canonical enforcement-plane observation before filing the case.
    // Prime is a separate authority boundary: this event never grants mutation rights.
    await this.eventBus.publish("SLAYER_PRIME_OBSERVATION", {
      observation,
      sourceId: this.config.agentId,
    }, {
      source: this.config.agentId,
      idempotencyKey: "slayer-prime-observation:" + observation.observationId,
    });

    return await this.investigateAndSubmit(observation, worldState, confidenceEval.effectiveConfidence);
  }

  /**
   * Deep Detective Investigation:
   * Gathers evidence, correlates hypotheses, creates case, and returns to patrol.
   */
  async investigateAndSubmit(
    observation: AnomalyObservation,
    worldState: WorldState,
    calibratedConfidence: number = 0.9
  ): Promise<SlayerReport> {
    this.isInvestigating = true;
    const startTime = Date.now();
    const investigationId = `inv_${randomUUID().substring(0, 8)}`;
    this.currentInvestigationId = investigationId;

    try {
      await this.eventBus.publish("SLAYER_INVESTIGATION_STARTED", {
        investigationId,
        slayerId: this.config.agentId,
        floorId: observation.floorId,
        severity: observation.severity,
      });

      // 1. Gather Detective Evidence (bounded by budget)
      const evidenceList = await this.gatherEvidence(observation, worldState);
      const boundedEvidence = evidenceList.slice(0, this.budget.maxEvidenceCount);

      // 2. Correlate Events & Formulate Hypotheses
      const correlatedEvents = await this.correlateEvents(observation);
      const hypotheses = await this.formulateHypotheses(observation, boundedEvidence);
      const estimatedRootCause = hypotheses.length > 0 ? hypotheses[0].theory : observation.description;

      const reportId = `slayrep_${randomUUID().substring(0, 10)}`;
      const report: SlayerReport = {
        reportId,
        slayerId: this.config.agentId,
        specialization: this.config.specialization,
        observation,
        symptoms: [observation.description],
        correlatedEvents,
        hypotheses,
        evidence: boundedEvidence,
        estimatedRootCause,
        confidence: calibratedConfidence,
        suggestedSeverity: observation.severity,
        suggestedActions: [`Dispatch Healer squad to investigate ${observation.target}`],
        generatedAt: new Date().toISOString(),
      };

      // 3. Create Case in CaseManager
      const createdCase = await this.caseManager.createCase({
        title: `[${this.config.name}] ${observation.category} on ${observation.floorId}`,
        description: observation.description,
        floorId: observation.floorId,
        targetWorker: observation.target,
        category: observation.category,
        severity: observation.severity,
        detectorId: this.config.agentId,
        symptoms: report.symptoms,
        observedState: observation.rawMetrics,
      });

      for (const ev of boundedEvidence) {
        await this.caseManager.addEvidence(createdCase.caseId, ev, this.config.agentId);
      }
      for (const hyp of hypotheses) {
        await this.caseManager.addHypothesis(createdCase.caseId, hyp, this.config.agentId);
      }

      this.reputation.casesDiscovered += 1;
      this.reputation.lastUpdated = new Date().toISOString();

      await this.eventBus.publish("SLAYER_CASE_CREATED", {
        caseId: createdCase.caseId,
        reportId,
        slayerId: this.config.agentId,
        floorId: observation.floorId,
        confidence: calibratedConfidence,
      });

      return report;
    } finally {
      this.isInvestigating = false;
      this.currentInvestigationId = undefined;
    }
  }

  protected async gatherEvidence(
    observation: AnomalyObservation,
    worldState: WorldState
  ): Promise<CaseEvidence[]> {
    return [
      {
        evidenceId: `ev_${randomUUID().substring(0, 8)}`,
        type: "METRIC",
        source: this.config.agentId,
        description: `Metrics captured for ${observation.category} on ${observation.floorId}`,
        data: {
          metrics: observation.rawMetrics,
          floorStatus: worldState.floors[observation.floorId]?.status || "UNKNOWN",
          workerStatus: worldState.workers[observation.target]?.status || "UNKNOWN",
        },
        collectedAt: new Date().toISOString(),
        confidence: 0.9,
      },
    ];
  }

  protected async correlateEvents(observation: AnomalyObservation): Promise<string[]> {
    return [`Telemetry anomaly recorded on ${observation.floorId} for target ${observation.target}`];
  }

  protected async formulateHypotheses(
    observation: AnomalyObservation,
    evidence: CaseEvidence[]
  ): Promise<CaseHypothesis[]> {
    return [
      {
        hypothesisId: `hyp_${randomUUID().substring(0, 8)}`,
        theory: `Primary anomaly detected in ${observation.category} on ${observation.floorId}`,
        likelihood: 0.85,
        verified: false,
        rationale: `Formulated based on ${evidence.length} evidence records`,
        supportingEvidenceIds: evidence.map((e) => e.evidenceId),
      },
    ];
  }
}
