/**
 * FactoryOS Frontier v2 — Cognitive Plane Master Engine
 * Unifies RLM context orchestration, active context management, evidence graphs,
 * contradiction resolution, strategic meta-thinking, economic intelligence, and predictive prevention.
 */

import { ContextOrchestrator } from "./rlm/RecursiveInvestigator";
import { ActiveContextManager } from "./context/ActiveContextManager";
import { IndexedExperienceMemory } from "./memory/IndexedExperienceMemory";
import { EvidenceGraphEngine } from "./graph/EvidenceGraphEngine";
import { ContradictionResolver } from "./conflict/ContradictionResolver";
import { StrategicMetaThinker } from "./meta/StrategicMetaThinker";
import { PredictiveFactoryEngine } from "./predictive/PredictiveFactoryEngine";
import { CapabilityRouter } from "./routing/CapabilityRouter";
import { SimulationDecisionEngine } from "./simulation/SimulationDecisionEngine";
import { CognitiveTelemetryTracker } from "./telemetry/CognitiveTelemetryTracker";
import { CaseReplayEngine, ShadowAgentRunner } from "./replay/CaseReplayEngine";
import type { IMemoryRepository } from "../database/DatabaseContracts";
import { InMemoryMemoryRepository } from "../database/InMemoryDatabase";

export class CognitivePlaneEngine {
  public contextOrchestrator: ContextOrchestrator;
  public activeContextManager: ActiveContextManager;
  public experienceMemory: IndexedExperienceMemory;
  public evidenceGraph: EvidenceGraphEngine;
  public contradictionResolver: ContradictionResolver;
  public metaThinker: StrategicMetaThinker;
  public predictiveEngine: PredictiveFactoryEngine;
  public router: CapabilityRouter;
  public simulationEngine: SimulationDecisionEngine;
  public telemetry: CognitiveTelemetryTracker;
  public replayEngine: CaseReplayEngine;
  public shadowRunner: ShadowAgentRunner;

  constructor(memoryRepo: IMemoryRepository = new InMemoryMemoryRepository()) {
    this.contextOrchestrator = new ContextOrchestrator();
    this.activeContextManager = new ActiveContextManager(this.contextOrchestrator.indexer);
    this.experienceMemory = new IndexedExperienceMemory(memoryRepo);
    this.evidenceGraph = new EvidenceGraphEngine();
    this.contradictionResolver = new ContradictionResolver(this.evidenceGraph);
    this.metaThinker = new StrategicMetaThinker();
    this.predictiveEngine = new PredictiveFactoryEngine();
    this.router = new CapabilityRouter();
    this.simulationEngine = new SimulationDecisionEngine();
    this.telemetry = new CognitiveTelemetryTracker();
    this.replayEngine = new CaseReplayEngine();
    this.shadowRunner = new ShadowAgentRunner();
  }
}
