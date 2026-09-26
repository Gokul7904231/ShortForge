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

  constructor(options?: {
    graphPath?: string;
    vaultPath?: string;
    customRuntime?: IRuntimeStateProvider;
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
  }): Promise<ContextCapsule> {
    const retrieval = await this.retrievalPlanner.retrieve(params.query);
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
