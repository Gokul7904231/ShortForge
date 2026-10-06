/**
 * FactoryOS v1 — In-Memory Database & Repository Fallback Implementation
 * Provides high-speed, reference-isolated storage for testing and offline operation.
 */

import type { WorldState } from "../contracts/WorldStateContracts";
import type { Case, CaseStatus } from "../contracts/CaseContracts";
import type { DecisionRecord, TaskDAG, TaskNode } from "../contracts/OverseerThinkingContracts";
import type { SlayerReputation } from "../contracts/SlayerContracts";
import type { HealerReputation } from "../contracts/HealerContracts";
import type {
  ICaseRepository,
  IContextFabricRepository,
  ContextEditLedgerEntry,
  IDecisionRepository,
  ILeaseRepository,
  IMemoryRepository,
  IReputationRepository,
  ITaskDAGRepository,
  IWorldStateRepository,
  MemoryRecord,
  TaskLease,
} from "./DatabaseContracts";
import { ContextConcurrencyConflictError } from "./DatabaseContracts";

export class InMemoryContextFabricRepository implements IContextFabricRepository {
  private workspaces: Map<string, import("../cognitive/context/ContextFabricContracts").ContextWorkspace> = new Map();
  private ledger: Map<string, ContextEditLedgerEntry> = new Map();

  async getWorkspace(workspaceId: string) {
    const workspace = this.workspaces.get(workspaceId);
    return workspace ? structuredClone(workspace) : null;
  }

  async saveWorkspace(
    workspace: import("../cognitive/context/ContextFabricContracts").ContextWorkspace,
    expectedVersion?: number
  ): Promise<void> {
    const existing = this.workspaces.get(workspace.workspaceId);
    if (expectedVersion !== undefined && (!existing || existing.version !== expectedVersion)) {
      throw new ContextConcurrencyConflictError(
        workspace.workspaceId,
        expectedVersion,
        existing?.version ?? null
      );
    }
    this.workspaces.set(workspace.workspaceId, structuredClone(workspace));
  }

  async appendEdit(entry: ContextEditLedgerEntry): Promise<void> {
    if (!this.ledger.has(entry.editId)) {
      this.ledger.set(entry.editId, structuredClone(entry));
    }
  }

  async commitWorkspace(commit: import("./DatabaseContracts").ContextDurableCommit): Promise<void> {
    const existing = this.workspaces.get(commit.workspace.workspaceId);
    if (existing && existing.version !== commit.expectedVersion) {
      throw new ContextConcurrencyConflictError(
        commit.workspace.workspaceId,
        commit.expectedVersion,
        existing.version,
      );
    }
    if (!existing && commit.expectedVersion !== 0) {
      throw new ContextConcurrencyConflictError(
        commit.workspace.workspaceId,
        commit.expectedVersion,
        null,
      );
    }

    const duplicateIds = commit.edits.filter(
      (entry, index, all) => all.findIndex((candidate) => candidate.editId === entry.editId) !== index
    );
    if (duplicateIds.length > 0) {
      throw new Error("Duplicate Context Fabric edit IDs in durable commit");
    }

    const stagedWorkspace = structuredClone(commit.workspace);
    const stagedLedger = commit.edits.map((entry) => structuredClone(entry));

    this.workspaces.set(stagedWorkspace.workspaceId, stagedWorkspace);
    for (const entry of stagedLedger) this.ledger.set(entry.editId, entry);
  }

  async getEditHistory(workspaceId: string, limit: number = 100): Promise<ContextEditLedgerEntry[]> {
    return Array.from(this.ledger.values())
      .filter((entry) => entry.workspaceId === workspaceId)
      .sort((a, b) => b.resultingVersion - a.resultingVersion || b.recordedAt.localeCompare(a.recordedAt))
      .slice(0, limit)
      .map((entry) => structuredClone(entry));
  }

  clear(): void {
    this.workspaces.clear();
    this.ledger.clear();
  }
}

export class InMemoryWorldStateRepository implements IWorldStateRepository {
  private history: WorldState[] = [];

  async getLatestState(): Promise<WorldState | null> {
    if (this.history.length === 0) return null;
    return structuredClone(this.history[this.history.length - 1]);
  }

  async saveState(state: WorldState): Promise<void> {
    this.history.push(structuredClone(state));
    if (this.history.length > 500) {
      this.history.shift();
    }
  }

  async getStateHistory(limit: number = 50): Promise<WorldState[]> {
    return structuredClone(this.history.slice(-limit));
  }

  clear(): void {
    this.history = [];
  }
}

export class InMemoryCaseRepository implements ICaseRepository {
  private cases: Map<string, Case> = new Map();

  async createCase(caseItem: Case): Promise<Case> {
    const cloned = structuredClone(caseItem);
    this.cases.set(cloned.caseId, cloned);
    return structuredClone(cloned);
  }

  async getCaseById(caseId: string): Promise<Case | null> {
    const item = this.cases.get(caseId);
    return item ? structuredClone(item) : null;
  }

  async updateCase(caseItem: Case): Promise<Case> {
    const cloned = structuredClone(caseItem);
    cloned.updatedAt = new Date().toISOString();
    this.cases.set(cloned.caseId, cloned);
    return structuredClone(cloned);
  }

  async getActiveCases(): Promise<Case[]> {
    const activeStatuses: CaseStatus[] = [
      "DETECTED",
      "TRIAGED",
      "INVESTIGATING",
      "ROOT_CAUSE_IDENTIFIED",
      "HEALING",
      "VERIFYING",
    ];
    return Array.from(this.cases.values())
      .filter((c) => activeStatuses.includes(c.status))
      .map((c) => structuredClone(c));
  }

  async getCasesByStatus(status: CaseStatus): Promise<Case[]> {
    return Array.from(this.cases.values())
      .filter((c) => c.status === status)
      .map((c) => structuredClone(c));
  }

  async getAllCases(limit: number = 100): Promise<Case[]> {
    return Array.from(this.cases.values())
      .slice(-limit)
      .map((c) => structuredClone(c));
  }

  clear(): void {
    this.cases.clear();
  }
}

export class InMemoryDecisionRepository implements IDecisionRepository {
  private decisions: Map<string, DecisionRecord> = new Map();

  async recordDecision(decision: DecisionRecord): Promise<void> {
    this.decisions.set(decision.decisionId, structuredClone(decision));
  }

  async getDecisionById(decisionId: string): Promise<DecisionRecord | null> {
    const item = this.decisions.get(decisionId);
    return item ? structuredClone(item) : null;
  }

  async getDecisionsByGoal(goalId: string): Promise<DecisionRecord[]> {
    return Array.from(this.decisions.values())
      .filter((d) => d.goalId === goalId)
      .map((d) => structuredClone(d));
  }

  async getRecentDecisions(limit: number = 50): Promise<DecisionRecord[]> {
    return Array.from(this.decisions.values())
      .slice(-limit)
      .map((d) => structuredClone(d));
  }

  clear(): void {
    this.decisions.clear();
  }
}

export class InMemoryReputationRepository implements IReputationRepository {
  private slayerReputations: Map<string, SlayerReputation> = new Map();
  private healerReputations: Map<string, HealerReputation> = new Map();

  async getSlayerReputation(agentId: string): Promise<SlayerReputation | null> {
    const rep = this.slayerReputations.get(agentId);
    return rep ? structuredClone(rep) : null;
  }

  async saveSlayerReputation(rep: SlayerReputation): Promise<void> {
    this.slayerReputations.set(rep.agentId, structuredClone(rep));
  }

  async getAllSlayerReputations(): Promise<SlayerReputation[]> {
    return Array.from(this.slayerReputations.values()).map((r) => structuredClone(r));
  }

  async getHealerReputation(healerId: string): Promise<HealerReputation | null> {
    const rep = this.healerReputations.get(healerId);
    return rep ? structuredClone(rep) : null;
  }

  async saveHealerReputation(rep: HealerReputation): Promise<void> {
    this.healerReputations.set(rep.healerId, structuredClone(rep));
  }

  async getAllHealerReputations(): Promise<HealerReputation[]> {
    return Array.from(this.healerReputations.values()).map((r) => structuredClone(r));
  }

  clear(): void {
    this.slayerReputations.clear();
    this.healerReputations.clear();
  }
}

export class InMemoryMemoryRepository implements IMemoryRepository {
  private memories: Map<string, MemoryRecord> = new Map();

  async saveMemory(record: MemoryRecord): Promise<void> {
    this.memories.set(record.memoryId, structuredClone(record));
  }

  async getMemory(layer: MemoryRecord["layer"], key: string): Promise<MemoryRecord | null> {
    for (const mem of this.memories.values()) {
      if (mem.layer === layer && mem.key === key) {
        return structuredClone(mem);
      }
    }
    return null;
  }

  async queryMemories(layer?: MemoryRecord["layer"], queryText?: string, limit: number = 20): Promise<MemoryRecord[]> {
    let result = Array.from(this.memories.values());
    if (layer) {
      result = result.filter((m) => m.layer === layer);
    }
    if (queryText) {
      const lower = queryText.toLowerCase();
      result = result.filter(
        (m) => m.key.toLowerCase().includes(lower) || m.content.toLowerCase().includes(lower)
      );
    }
    return result.slice(0, limit).map((m) => structuredClone(m));
  }

  async deleteMemory(memoryId: string): Promise<void> {
    this.memories.delete(memoryId);
  }

  clear(): void {
    this.memories.clear();
  }
}

export class InMemoryTaskDAGRepository implements ITaskDAGRepository {
  private dags: Map<string, TaskDAG> = new Map();

  async saveDAG(dag: TaskDAG): Promise<void> {
    this.dags.set(dag.dagId, structuredClone(dag));
  }

  async getDAG(dagId: string): Promise<TaskDAG | null> {
    const dag = this.dags.get(dagId);
    return dag ? structuredClone(dag) : null;
  }

  async updateTaskNode(dagId: string, node: TaskNode): Promise<void> {
    const dag = this.dags.get(dagId);
    if (dag) {
      dag.nodes[node.taskId] = structuredClone(node);
      this.dags.set(dagId, dag);
    }
  }

  async getActiveDAGs(): Promise<TaskDAG[]> {
    return Array.from(this.dags.values())
      .filter((d) => d.status === "PENDING" || d.status === "RUNNING")
      .map((d) => structuredClone(d));
  }

  clear(): void {
    this.dags.clear();
  }
}

export class InMemoryLeaseRepository implements ILeaseRepository {
  private leases: Map<string, TaskLease> = new Map();
  private nextFencingToken = 1;

  async acquireLease(taskId: string, ownerAgentId: string, ttlMs: number, attempt: number = 1): Promise<boolean> {
    const now = new Date();
    const existing = this.leases.get(taskId);
    if (existing && existing.status === "ACTIVE") {
      const expires = new Date(existing.leaseExpiresAt);
      if (expires > now && existing.ownerAgentId !== ownerAgentId) {
        return false; // Already locked by another agent
      }
    }

    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const lease: TaskLease = {
      taskId,
      ownerAgentId,
      leaseStartedAt: now.toISOString(),
      leaseExpiresAt: expiresAt,
      attempt,
      fencingToken: this.nextFencingToken++,
      heartbeatAt: now.toISOString(),
      status: "ACTIVE",
    };
    this.leases.set(taskId, lease);
    return true;
  }

  async renewLease(taskId: string, ownerAgentId: string, ttlMs: number): Promise<boolean> {
    const lease = this.leases.get(taskId);
    if (!lease || lease.ownerAgentId !== ownerAgentId || lease.status !== "ACTIVE") {
      return false;
    }
    const now = new Date();
    const updated: TaskLease = {
      ...lease,
      heartbeatAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    this.leases.set(taskId, updated);
    return true;
  }

  async releaseLease(taskId: string, ownerAgentId: string): Promise<void> {
    const lease = this.leases.get(taskId);
    if (lease && lease.ownerAgentId === ownerAgentId) {
      this.leases.set(taskId, {
        ...lease,
        status: "RELEASED",
      });
    }
  }

  async releaseLeaseIfFenced(
    taskId: string,
    ownerAgentId: string,
    expectedFencingToken: number
  ): Promise<boolean> {
    const lease = this.leases.get(taskId);
    if (
      !lease ||
      lease.ownerAgentId !== ownerAgentId ||
      lease.status !== "ACTIVE" ||
      lease.fencingToken !== expectedFencingToken
    ) {
      return false;
    }

    this.leases.set(taskId, { ...lease, status: "RELEASED" });
    return true;
  }

  async getLease(taskId: string): Promise<TaskLease | null> {
    const lease = this.leases.get(taskId);
    return lease ? structuredClone(lease) : null;
  }

  async getExpiredLeases(): Promise<TaskLease[]> {
    const now = new Date();
    const result: TaskLease[] = [];
    for (const lease of this.leases.values()) {
      if (lease.status === "ACTIVE" && new Date(lease.leaseExpiresAt) <= now) {
        result.push(structuredClone(lease));
      }
    }
    return result;
  }

  clear(): void {
    this.leases.clear();
  }
}

import type { IMissionRepository } from "./DatabaseContracts";
import type { Mission } from "../contracts/MissionContracts";
import { MissionConcurrencyConflictError } from "../missions/MissionErrors";

export class InMemoryMissionRepository implements IMissionRepository {
  private missions: Map<string, Mission> = new Map();

  async saveMission(mission: Mission, expectedVersion?: number): Promise<void> {
    const existing = this.missions.get(mission.missionId);
    const currentVersion = existing ? (existing.version || 1) : 1;
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new MissionConcurrencyConflictError(mission.missionId, expectedVersion, currentVersion);
    }
    const nextVersion = existing ? currentVersion + 1 : (mission.version || 1);
    const cloned = structuredClone(mission);
    cloned.version = nextVersion;
    this.missions.set(mission.missionId, cloned);
  }

  async getMissionById(missionId: string): Promise<Mission | null> {
    const m = this.missions.get(missionId);
    return m ? structuredClone(m) : null;
  }

  async getActiveMissions(): Promise<Mission[]> {
    return Array.from(this.missions.values())
      .filter((m) => m.status === "RUNNING" || m.status === "PLANNING" || m.status === "REPLANNING" || m.status === "CREATED")
      .map((m) => structuredClone(m));
  }

  async getAllMissions(limit: number = 50): Promise<Mission[]> {
    return Array.from(this.missions.values())
      .slice(0, limit)
      .map((m) => structuredClone(m));
  }

  async deleteMission(missionId: string): Promise<void> {
    this.missions.delete(missionId);
  }

  clear(): void {
    this.missions.clear();
  }
}

