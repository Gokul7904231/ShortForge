/**
 * ShortForge / FactoryOS — Intelligence Gateway
 * Unified entrypoint uniting Structural Evidence, Durable Knowledge, History, and Runtime Truth.
 */

import fs from "node:fs";
import path from "node:path";
import { GraphifyStructuralAdapter } from "./structural/GraphifyStructuralAdapter";
import { IStructuralGraphProvider, StructuralGraphStats, GraphValidationReport } from "./structural/StructuralContracts";
import { KnowledgeStore } from "./knowledge/KnowledgeStore";
import { KnowledgeValidationReport } from "./knowledge/OKFContracts";
import { HistoryProvider } from "./history/HistoryProvider";
import { IHistoryProvider } from "./history/HistoryContracts";
import { RuntimeStateProvider } from "./runtime/RuntimeStateProvider";
import { IRuntimeStateProvider, RuntimeSnapshot } from "./runtime/RuntimeStateContracts";
import { RetrievalPlanner } from "./retrieval/RetrievalPlanner";
import { IRetrievalPlanner, RetrievalResult } from "./retrieval/RetrievalContracts";
import { ContextCompiler } from "./context/ContextCompiler";
import { ContextCapsule, IContextCompiler } from "./context/ContextCapsuleContracts";
import { MemoryWriter } from "./writer/MemoryWriter";
import { CandidateMemoryProposal, IMemoryWriter } from "./writer/MemoryWriterContracts";
import { MemoryFabricProjectionService } from "./memory/MemoryFabricProjection";
import { MemoryLifecycleService } from "./memory/MemoryLifecycleService";
import { KnowledgeStoreObservationAdapter } from "./memory/KnowledgeStoreObservationAdapter";
import { MemoryConsolidationStrategyRouter } from "./memory/MemoryConsolidationStrategyRouter";
import { MemoryMentalModelManager } from "./memory/MemoryMentalModelManager";
import { KnowledgeStoreMentalModelAdapter } from "./memory/KnowledgeStoreMentalModelAdapter";
import { MemoryRetrievalEngine, type MemoryRetrievalEngineOptions } from "./memory/MemoryRetrievalEngine";
import type { MemoryAccessContext } from "./memory/MemorySemanticsContracts";
import type { MemoryConsolidationStrategy } from "./memory/MemoryConsolidationStrategyRouter";

export interface SystemDoctorReport {
  readonly status: "HEALTHY" | "DEGRADED" | "BROKEN";
  readonly structural: {
    readonly available: boolean;
    readonly stats?: StructuralGraphStats;
    readonly validation?: GraphValidationReport;
  };
  readonly knowledge: {
    readonly available: boolean;
    readonly validation: KnowledgeValidationReport;
  };
  readonly runtime: {
    readonly status: string;
    readonly blockers: string[];
  };
}

export class IntelligenceGateway {
  public readonly structuralGraph: IStructuralGraphProvider;
  public readonly knowledgeStore: KnowledgeStore;
  public readonly historyProvider: IHistoryProvider;
  public readonly runtimeState: IRuntimeStateProvider;
  public readonly retrievalPlanner: IRetrievalPlanner;
  public readonly contextCompiler: IContextCompiler;
  public readonly memoryWriter: IMemoryWriter;
  public readonly memoryFabric: MemoryFabricProjectionService;
  public readonly memoryLifecycle: MemoryLifecycleService;

  constructor(options?: {
    graphPath?: string;
    vaultPath?: string;
    customRuntime?: IRuntimeStateProvider;
    retrievalOptions?: MemoryRetrievalEngineOptions;
    consolidationStrategies?: readonly MemoryConsolidationStrategy[];
  }) {
    // 1. Structural Graph Provider
    let targetGraphPath = options?.graphPath;
    if (!targetGraphPath) {
      // Look for canonical .factoryos/structural snapshot
      const candidateRoots = [
        process.cwd(),
        path.resolve(process.cwd(), ".."),
        path.resolve(process.cwd(), "..", ".."),
      ];

      for (const root of candidateRoots) {
        const currentJson = path.join(root, ".factoryos", "structural", "current.json");
        if (fs.existsSync(currentJson)) {
          try {
            const cur = JSON.parse(fs.readFileSync(currentJson, "utf-8"));
            const snapPath = path.join(root, ".factoryos", "structural", "snapshots", cur.current_snapshot, "graph.json");
            if (fs.existsSync(snapPath)) {
              targetGraphPath = snapPath;
              break;
            }
          } catch {
            // fallback
          }
        }
        const legacyPath = path.join(root, "graphify-out", "graphify-out", "graph.json");
        if (fs.existsSync(legacyPath)) {
          targetGraphPath = legacyPath;
          break;
        }
      }
    }
    if (!targetGraphPath) {
      targetGraphPath = path.resolve(process.cwd(), "graphify-out/graphify-out/graph.json");
    }

    try {
      this.structuralGraph = new GraphifyStructuralAdapter(targetGraphPath);
    } catch {
      // Fallback empty adapter if graph not found
      this.structuralGraph = new GraphifyStructuralAdapter({ nodes: [], links: [] });
    }

    // 2. Knowledge Store
    this.knowledgeStore = new KnowledgeStore(options?.vaultPath);

    // 3. History Provider
    this.historyProvider = new HistoryProvider(this.knowledgeStore);

    // 4. Runtime State
    this.runtimeState = options?.customRuntime || new RuntimeStateProvider();

    // 5. Retrieval Planner
    this.retrievalPlanner = new RetrievalPlanner({
      structuralGraph: this.structuralGraph,
      knowledgeStore: this.knowledgeStore,
      historyProvider: this.historyProvider,
      runtimeState: this.runtimeState,
    });

    // 6. Context Compiler
    this.contextCompiler = new ContextCompiler();

    // 7. Memory Writer
    this.memoryWriter = new MemoryWriter(this.knowledgeStore);
    this.memoryFabric = new MemoryFabricProjectionService(
      this.knowledgeStore,
      this.memoryWriter as MemoryWriter,
      options?.retrievalOptions,
    );

    const observationStore = new KnowledgeStoreObservationAdapter(this.knowledgeStore);
    const strategyRouter = new MemoryConsolidationStrategyRouter(
      options?.consolidationStrategies ?? [],
    );
    this.memoryLifecycle = new MemoryLifecycleService(
      () => this.knowledgeStore.list(),
      observationStore,
      new MemoryRetrievalEngine(options?.retrievalOptions),
      strategyRouter,
      new MemoryMentalModelManager(new KnowledgeStoreMentalModelAdapter(this.knowledgeStore)),
    );
  }

  /**
   * Main Agent context retrieval method:
   * Plans retrieval -> gathers multi-source evidence -> compiles bounded ContextCapsule.
   */
  public async compileContextForQuery(params: {
    taskId: string;
    query: string;
    tokenBudget?: number;
    memoryAccessContext?: MemoryAccessContext;
  }): Promise<ContextCapsule> {
    const retrieval = params.memoryAccessContext
      ? {
          items: (await this.memoryLifecycle.recall({
            query: params.query,
            accessContext: params.memoryAccessContext,
            maxItems: 12,
            maxChars: Math.max(2000, (params.tokenBudget ?? 2500) * 3),
            maxTokens: params.tokenBudget ?? 2500,
            includeStale: false,
            trace: true,
          })).items.map((item) => ({
            id: item.memoryId,
            sourceType: "KNOWLEDGE" as const,
            sourceId: item.memoryId,
            titleOrPath: item.title,
            relevance: Math.max(0, Math.min(1, item.rerankScore)),
            finalScore: Math.max(0, Math.min(1, item.rerankScore)),
            authority:
              item.authority === "F07" ||
              item.authority === "VERIFIED_SYSTEM" ||
              item.authority === "HUMAN_AUTHORITY"
                ? "AUTHORITATIVE" as const
                : item.authority === "MODEL_ADVISORY"
                  ? "INFERRED" as const
                  : "DERIVED" as const,
            freshness: item.freshness.checkedAt,
            epistemicStatus: item.verificationState === "VERIFIED" ? "sourced" as const : "observed" as const,
            verification:
              item.verificationState === "VERIFIED"
                ? "verified" as const
                : item.verificationState === "DISPUTED"
                  ? "disputed" as const
                  : "unverified" as const,
            snippet: item.content.slice(0, 1200),
            metadata: {
              memoryType: item.semanticType,
              scopeKey: item.scopeKey,
              evidenceRefs: item.evidenceRefs,
              provenance: item.provenance,
              retrievalSignals: {
                semantic: item.semanticScore,
                lexical: item.lexicalScore,
                graph: item.graphScore,
                temporal: item.temporalScore,
                rerank: item.rerankScore,
              },
            },
          })),
        }
      : await this.retrievalPlanner.retrieve(params.query);
    const snap = await this.runtimeState.getSnapshot();

    return this.contextCompiler.compile({
      taskId: params.taskId,
      query: params.query,
      evidenceItems: retrieval.items,
      currentState: {
        factoryStatus: snap.factoryStatus,
        blockers: snap.currentBlockers,
      },
      budgetPolicy: {
        maxTokens: params.tokenBudget || 2500,
      },
    });
  }

  /**
   * Agent-safe durable memory proposal. The proposal is never written
   * directly; it is admitted only through MemoryWriter policy.
   */
  public async proposeVerifiedMemory(proposal: CandidateMemoryProposal) {
    return this.memoryFabric.proposeVerifiedMemory(proposal);
  }

  /**
   * Diagnostic: Factory Memory Doctor
   */
  public memoryDoctor(): SystemDoctorReport {
    const kReport = this.knowledgeStore.validate();
    const gStats = this.structuralGraph.getStats();
    const gReport = this.structuralGraph.validate();

    let status: "HEALTHY" | "DEGRADED" | "BROKEN" = "HEALTHY";
    if (!kReport.valid || kReport.secretLeakErrors.length > 0) {
      status = "DEGRADED";
    }
    if (gStats.nodeCount === 0 && kReport.totalDocuments === 0) {
      status = "BROKEN";
    }

    return {
      status,
      structural: {
        available: gStats.nodeCount > 0,
        stats: gStats,
        validation: gReport,
      },
      knowledge: {
        available: kReport.totalDocuments > 0,
        validation: kReport,
      },
      runtime: {
        status: "ACTIVE",
        blockers: [],
      },
    };
  }
}
