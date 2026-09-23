/**
 * FactoryOS Frontier v2 — Cognitive Runtime Engine
 * The live cognitive reasoning pipeline orchestrating Context, Memory, Evidence Graph,
 * Contradiction Resolution, RLM, Simulation, Economics, and Learning.
 */

import { randomUUID } from "node:crypto";
import type { CognitivePlaneEngine } from "./CognitivePlaneEngine";
import type { IncidentContext, CognitiveDecisionResponse } from "./CognitiveDecisionContext";
import { CognitiveTriageEngine } from "./CognitiveTriageEngine";
import { CognitiveFallbackPolicy } from "./CognitiveFallbackPolicy";
import { CognitiveOutcomeLearner } from "./CognitiveOutcomeLearner";
import type { EvidenceNode } from "./CognitiveContracts";
import type { CandidateAction } from "./simulation/SimulationDecisionEngine";

export class CognitiveRuntime {
  public readonly plane: CognitivePlaneEngine;
  public readonly triageEngine: CognitiveTriageEngine;
  public readonly fallbackPolicy: CognitiveFallbackPolicy;
  public readonly outcomeLearner: CognitiveOutcomeLearner;

  constructor(plane: CognitivePlaneEngine) {
    this.plane = plane;
    this.triageEngine = new CognitiveTriageEngine();
    this.fallbackPolicy = new CognitiveFallbackPolicy();
    this.outcomeLearner = new CognitiveOutcomeLearner(plane.experienceMemory, plane.economics);
  }

  /**
   * The Master Cognitive Decision Pipeline:
   * Assess -> Triage -> Memory -> Context -> Evidence Graph -> Contradiction -> RLM -> Simulation -> Economics -> Decision
   */
  async evaluateIncident(incident: IncidentContext): Promise<CognitiveDecisionResponse> {
    const startTime = Date.now();
    let tokensConsumed = 0;
    let costUsd = 0;

    try {
      // 1. Triage Complexity Level
      const complexityLevel = this.triageEngine.triageIncident(incident);

      // Level 0: Deterministic Fast Path
      if (complexityLevel === "DETERMINISTIC") {
        return {
          incidentId: incident.incidentId,
          complexityLevel: "DETERMINISTIC",
          recommendedAction: `Standard automated recovery for ${incident.category}`,
          candidateActionId: incident.candidateActions?.[0]?.actionId || "action_standard_recovery",
          confidence: 0.95,
          rootCauseTheory: `Known operational symptom pattern on ${incident.floorId || "global"}`,
          rationale: `Applied deterministic operational rule for ${incident.category}.`,
          evidenceIds: [],
          memoryMatchesCount: 0,
          contradictionResolved: false,
          simulationEvaluated: false,
          rlmActivated: false,
          tokensConsumed: 20,
          costUsd: 0.0001,
          durationMs: Date.now() - startTime,
          fallbackApplied: false,
        };
      }

      // 2. Experience Memory Recall
      const query = `${incident.category} ${incident.symptoms.join(" ")}`;
      const similarExperiences = await this.plane.experienceMemory.recallByKeywords(query, incident.floorId, 5);
      tokensConsumed += 100;
      costUsd += 0.001;

      // 3. Active Context Management & Indexing
      if (incident.rawLogs && incident.rawLogs.length > 0) {
        for (const log of incident.rawLogs) {
          this.plane.contextOrchestrator.indexer.indexItem({
            type: "LOG",
            title: `Log from ${incident.floorId || "system"}`,
            content: log,
            source: incident.floorId || "system",
            tags: [incident.category],
          });
        }
      }

      // 4. Evidence Graph Construction
      const symptomNode: EvidenceNode = {
        nodeId: `node_sym_${randomUUID().substring(0, 8)}`,
        nodeType: "SYMPTOM",
        title: incident.category,
        description: incident.symptoms.join("; "),
        confidence: 0.9,
        source: incident.floorId || "system",
        timestamp: new Date().toISOString(),
        data: incident.observedMetrics,
        verified: true,
      };
      this.plane.evidenceGraph.addNode(incident.incidentId, symptomNode);

      const evidenceIds = [symptomNode.nodeId];

      // 5. Contradiction Resolution (if conflicting claims exist)
      let contradictionResolved = false;
      let winningClaim = "";
      if (incident.conflictingClaims && incident.conflictingClaims.length >= 2) {
        const conflict = this.plane.contradictionResolver.detectConflict(
          incident.incidentId,
          { claimant: incident.conflictingClaims[0].agentId, claim: incident.conflictingClaims[0].claim, evidenceIds },
          { claimant: incident.conflictingClaims[1].agentId, claim: incident.conflictingClaims[1].claim, evidenceIds }
        );

        const resolved = this.plane.contradictionResolver.executeAutomatedDiagnosticProbe(
          conflict.conflictId,
          incident.observedMetrics
        );

        contradictionResolved = true;
        winningClaim = resolved.selectedClaim === "B" ? incident.conflictingClaims[1].claim : incident.conflictingClaims[0].claim;
        tokensConsumed += 250;
        costUsd += 0.005;
      }

      // 6. RLM Recursive Investigation (if context is large or ambiguous)
      let rlmActivated = false;
      let rootCauseTheory = winningClaim || `Localized ${incident.category} anomaly on ${incident.floorId || "target"}`;
      if (complexityLevel === "RLM" || (incident.rawLogs && incident.rawLogs.length > 5)) {
        rlmActivated = true;
        const result = await this.plane.contextOrchestrator.investigator.investigate({
          query: `Investigate root cause of ${incident.category} with symptoms: ${incident.symptoms.join(", ")}`,
          severity: incident.severity,
          targetFloor: incident.floorId,
        });
        tokensConsumed += result.trace?.totalTokens || 500;
        costUsd += result.trace?.totalCost || 0.002;
        if (result.conclusions && result.conclusions.length > 0) {
          rootCauseTheory = result.conclusions[0];
        }
      }

      // 7. Simulation Gate (for candidate actions)
      let simulationEvaluated = false;
      let recommendedAction = "EXECUTE_OPTIMAL_REPAIR";
      let candidateActionId = incident.candidateActions?.[0]?.actionId;

      const isAuthoritative = !!incident.worldStateSnapshot;
      const worldStateSource: "AUTHORITATIVE" | "SIMULATION" = isAuthoritative ? "AUTHORITATIVE" : "SIMULATION";

      if (incident.candidateActions && incident.candidateActions.length > 0) {
        const candidateActions: CandidateAction[] = incident.candidateActions.map((action) => ({
          actionId: action.actionId,
          name: action.title,
          description: action.title,
          targetFloorId: incident.floorId,
          estimatedRisk: action.riskLevel === "CRITICAL" ? 0.8 : action.riskLevel === "HIGH" ? 0.5 : 0.1,
          isIrreversible: action.riskLevel === "CRITICAL",
          parameters: {},
        }));

        const effectiveWorldState = incident.worldStateSnapshot || {
          simulationId: `sim_${randomUUID().substring(0, 8)}`,
          scenarioId: incident.incidentId,
          worldStateVersion: "1.0.0",
          factoryStatus: "RUNNING",
          systemConfidence: 0.8,
          resources: { cpuPercent: 85, memoryUsageMb: 4000, driveAvailable: true },
          floors: {},
          workers: {},
          cases: {},
          lastHeartbeat: new Date().toISOString(),
        };

        const simResult = this.plane.simulationEngine.simulateCandidates(candidateActions, effectiveWorldState as any);
        simulationEvaluated = true;
        tokensConsumed += 150;
        costUsd += 0.003;

        if (simResult.selectedCandidate) {
          recommendedAction = simResult.selectedCandidate.name;
          candidateActionId = simResult.selectedCandidate.actionId;
        }
      } else if (similarExperiences.length > 0) {
        recommendedAction = similarExperiences[0].summary;
      }

      const durationMs = Date.now() - startTime;
      const calculatedConfidence = simulationEvaluated ? 0.75 : similarExperiences.length > 0 ? 0.65 : 0.5;

      // 8. Safe User-Facing Summary (No private Chain-of-Thought)
      const rationale = `Cognitive assessment evaluated ${rootCauseTheory}. Recommended action: ${recommendedAction} based on ${
        simulationEvaluated ? "simulation evaluation" : similarExperiences.length > 0 ? "historical memory match" : "evidence graph analysis"
      } (epistemic confidence: ${calculatedConfidence.toFixed(2)}).`;

      return {
        incidentId: incident.incidentId,
        complexityLevel,
        recommendedAction,
        candidateActionId,
        confidence: calculatedConfidence,
        rootCauseTheory,
        hypothesisStatus: "SUPPORTED_HYPOTHESIS",
        lifecycleState: "RECOMMENDED",
        worldStateSource,
        simulationMetadata: !isAuthoritative
          ? {
              simulationId: `sim_${randomUUID().substring(0, 8)}`,
              scenarioId: incident.incidentId,
            }
          : undefined,
        rationale,
        evidenceIds,
        memoryMatchesCount: similarExperiences.length,
        relevantExperience: similarExperiences.map((e) => ({
          experienceId: e.memoryId,
          title: e.title,
          summary: e.summary,
        })),
        contradictionResolved,
        simulationEvaluated,
        rlmActivated,
        tokensConsumed,
        tokenUsageStatus: "ESTIMATED",
        costUsd,
        costStatus: "ESTIMATED",
        durationMs,
        fallbackApplied: false,
        trainingEligible: isAuthoritative,
      };
    } catch (err: any) {
      return this.fallbackPolicy.generateFallbackDecision(
        incident,
        `Cognitive execution exception: ${err?.message || "Unknown"}`,
        Date.now() - startTime
      );
    }
  }
}
