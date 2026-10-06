/**
 * FactoryOS Frontier v2 — Cognitive Plane Master Engine
 * Unifies RLM context orchestration, active context management, evidence graphs,
 * contradiction resolution, strategic meta-thinking, economic intelligence, and predictive prevention.
 */

import { ContextOrchestrator } from "./rlm/RecursiveInvestigator";
import { ContextFabric } from "./context/ContextFabric";
import { IndexedExperienceMemory } from "./memory/IndexedExperienceMemory";
import { EvidenceGraphEngine } from "./graph/EvidenceGraphEngine";
import { ContradictionResolver } from "./conflict/ContradictionResolver";
import { StrategicMetaThinker } from "./meta/StrategicMetaThinker";
import { PredictiveFactoryEngine } from "./predictive/PredictiveFactoryEngine";
import { CapabilityRouter } from "./routing/CapabilityRouter";
import { SimulationDecisionEngine } from "./simulation/SimulationDecisionEngine";
import { CognitiveTelemetryTracker } from "./telemetry/CognitiveTelemetryTracker";
import { CaseReplayEngine, ShadowAgentRunner } from "./replay/CaseReplayEngine";
import type { IContextFabricRepository, IMemoryRepository } from "../database/DatabaseContracts";
import { InMemoryMemoryRepository } from "../database/InMemoryDatabase";

export class CognitivePlaneEngine {
  public contextOrchestrator: ContextOrchestrator;
  /** @deprecated Use contextFabric.activeContext. */
  public activeContextManager: ContextFabric["activeContext"];
  public contextFabric: ContextFabric;
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

  constructor(
    memoryRepo: IMemoryRepository = new InMemoryMemoryRepository(),
    contextRepository?: IContextFabricRepository,
  ) {
    this.contextOrchestrator = new ContextOrchestrator();
    this.contextFabric = new ContextFabric({
      indexer: this.contextOrchestrator.indexer,
      repository: contextRepository,
    });
    // Compatibility alias only: ContextFabric remains the sole active-context boundary.
    this.activeContextManager = this.contextFabric.activeContext;
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
