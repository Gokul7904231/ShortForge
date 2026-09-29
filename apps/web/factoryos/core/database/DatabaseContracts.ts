/**
 * FactoryOS v1 — Database Contracts & Repository Interfaces
 */

import type { WorldState } from "../contracts/WorldStateContracts";
import type { Case, CaseStatus } from "../contracts/CaseContracts";
import type { DecisionRecord, TaskDAG, TaskNode } from "../contracts/OverseerThinkingContracts";
import type { SlayerReputation } from "../contracts/SlayerContracts";
import type { HealerReputation } from "../contracts/HealerContracts";

export interface TaskLease {
  readonly taskId: string;
  readonly ownerAgentId: string;
  readonly leaseStartedAt: string;
  readonly leaseExpiresAt: string;
  readonly attempt: number;
  /** Monotonic worker-lease generation used to fence stale holders. */
  readonly fencingToken?: number;
  readonly heartbeatAt: string;
  readonly status: "ACTIVE" | "EXPIRED" | "RELEASED";
}

export interface MemoryRecord {
  readonly memoryId: string;
  readonly layer: "WORKING" | "EPISODIC" | "SEMANTIC" | "OPERATIONAL" | "CASE" | "TRANSITION";
  readonly key: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly confidence: number;
  readonly accessCount: number;
  readonly createdAt: string;
  readonly lastAccessedAt: string;
}

export interface IWorldStateRepository {
  getLatestState(): Promise<WorldState | null>;
  saveState(state: WorldState): Promise<void>;
  getStateHistory(limit?: number): Promise<WorldState[]>;
}

export interface ICaseRepository {
  createCase(caseItem: Case): Promise<Case>;
  getCaseById(caseId: string): Promise<Case | null>;
  updateCase(caseItem: Case): Promise<Case>;
  getActiveCases(): Promise<Case[]>;
  getCasesByStatus(status: CaseStatus): Promise<Case[]>;
  getAllCases(limit?: number): Promise<Case[]>;
}

export interface IDecisionRepository {
  recordDecision(decision: DecisionRecord): Promise<void>;
  getDecisionById(decisionId: string): Promise<DecisionRecord | null>;
  getDecisionsByGoal(goalId: string): Promise<DecisionRecord[]>;
  getRecentDecisions(limit?: number): Promise<DecisionRecord[]>;
}

export interface IReputationRepository {
  getSlayerReputation(agentId: string): Promise<SlayerReputation | null>;
  saveSlayerReputation(rep: SlayerReputation): Promise<void>;
  getAllSlayerReputations(): Promise<SlayerReputation[]>;
  getHealerReputation(healerId: string): Promise<HealerReputation | null>;
  saveHealerReputation(rep: HealerReputation): Promise<void>;
  getAllHealerReputations(): Promise<HealerReputation[]>;
}

export interface IMemoryRepository {
  saveMemory(record: MemoryRecord): Promise<void>;
  getMemory(layer: MemoryRecord["layer"], key: string): Promise<MemoryRecord | null>;
  queryMemories(layer?: MemoryRecord["layer"], queryText?: string, limit?: number): Promise<MemoryRecord[]>;
  deleteMemory(memoryId: string): Promise<void>;
}

export interface ITaskDAGRepository {
  saveDAG(dag: TaskDAG): Promise<void>;
  getDAG(dagId: string): Promise<TaskDAG | null>;
  updateTaskNode(dagId: string, node: TaskNode): Promise<void>;
  getActiveDAGs(): Promise<TaskDAG[]>;
}

export interface ILeaseRepository {
  acquireLease(taskId: string, ownerAgentId: string, ttlMs: number, attempt?: number): Promise<boolean>;
  renewLease(taskId: string, ownerAgentId: string, ttlMs: number): Promise<boolean>;
  releaseLease(taskId: string, ownerAgentId: string): Promise<void>;
  getLease(taskId: string): Promise<TaskLease | null>;
  getExpiredLeases(): Promise<TaskLease[]>;
}

import type { Mission } from "../contracts/MissionContracts";

export interface IMissionRepository {
  saveMission(mission: Mission, expectedVersion?: number): Promise<void>;
  getMissionById(missionId: string): Promise<Mission | null>;
  getActiveMissions(): Promise<Mission[]>;
  getAllMissions(limit?: number): Promise<Mission[]>;
  deleteMission(missionId: string): Promise<void>;
}

