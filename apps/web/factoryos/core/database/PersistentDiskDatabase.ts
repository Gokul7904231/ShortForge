/**
 * FactoryOS Frontier v2 — Persistent Disk Database
 * Implements durable filesystem-backed repositories for authentic process-restart persistence.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ICaseRepository,
  IDecisionRepository,
  ILeaseRepository,
  IMemoryRepository,
  IMissionRepository,
  IReputationRepository,
  ITaskDAGRepository,
  IWorldStateRepository,
  MemoryRecord,
  TaskLease,
} from "./DatabaseContracts";
import type { WorldState } from "../contracts/WorldStateContracts";
import type { Case, CaseStatus } from "../contracts/CaseContracts";
import type { DecisionRecord, TaskDAG, TaskNode } from "../contracts/OverseerThinkingContracts";
import type { SlayerReputation } from "../contracts/SlayerContracts";
import type { HealerReputation } from "../contracts/HealerContracts";
import type { Mission } from "../contracts/MissionContracts";

export class PersistentDiskDatabase {
  public baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), "data", "factoryos_state");
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    const subdirs = ["world_state", "cases", "decisions", "reputation", "memories", "dags", "leases", "missions", "telemetry", "context_store"];
    for (const sub of subdirs) {
      const p = path.join(this.baseDir, sub);
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    }
  }

  getRepos() {
    return {
      worldState: new DiskWorldStateRepository(this.baseDir),
      cases: new DiskCaseRepository(this.baseDir),
      decisions: new DiskDecisionRepository(this.baseDir),
      reputation: new DiskReputationRepository(this.baseDir),
      memories: new DiskMemoryRepository(this.baseDir),
      taskDAGs: new DiskTaskDAGRepository(this.baseDir),
      leases: new DiskLeaseRepository(this.baseDir),
      missions: new DiskMissionRepository(this.baseDir),
    };
  }

  clear(): void {
    if (fs.existsSync(this.baseDir)) {
      fs.rmSync(this.baseDir, { recursive: true, force: true });
      this.ensureDirs();
    }
  }
}

export class DiskWorldStateRepository implements IWorldStateRepository {
  private file: string;

  constructor(baseDir: string) {
    this.file = path.join(baseDir, "world_state", "current.json");
  }

  async getLatestState(): Promise<WorldState | null> {
    if (!fs.existsSync(this.file)) return null;
    try {
      const raw = fs.readFileSync(this.file, "utf-8");
      return JSON.parse(raw) as WorldState;
    } catch {
      return null;
    }
  }

  async saveState(state: WorldState): Promise<void> {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
    try {
      if (fs.existsSync(this.file)) {
        fs.unlinkSync(this.file);
      }
      fs.renameSync(tmp, this.file);
    } catch {
      try {
        fs.copyFileSync(tmp, this.file);
        fs.unlinkSync(tmp);
      } catch {
        fs.writeFileSync(this.file, JSON.stringify(state, null, 2), "utf-8");
      }
    }
  }

  async getStateHistory(limit: number = 50): Promise<WorldState[]> {
    const current = await this.getLatestState();
    return current ? [current] : [];
  }
}

export class DiskCaseRepository implements ICaseRepository {
  private dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, "cases");
  }

  async createCase(caseItem: Case): Promise<Case> {
    const file = path.join(this.dir, `${caseItem.caseId}.json`);
    fs.writeFileSync(file, JSON.stringify(caseItem, null, 2), "utf-8");
    return structuredClone(caseItem);
  }

  async getCaseById(caseId: string): Promise<Case | null> {
    const file = path.join(this.dir, `${caseId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8")) as Case;
    } catch {
      return null;
    }
  }

  async updateCase(caseItem: Case): Promise<Case> {
    const file = path.join(this.dir, `${caseItem.caseId}.json`);
    fs.writeFileSync(file, JSON.stringify(caseItem, null, 2), "utf-8");
    return structuredClone(caseItem);
  }

  async getActiveCases(): Promise<Case[]> {
    const all = await this.getAllCases();
    return all.filter((c) => c.status !== "RESOLVED");
  }

  async getCasesByStatus(status: CaseStatus): Promise<Case[]> {
    const all = await this.getAllCases();
    return all.filter((c) => c.status === status);
  }

  async getAllCases(limit: number = 100): Promise<Case[]> {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    const cases: Case[] = [];
    for (const f of files) {
      try {
        const item = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8")) as Case;
        cases.push(item);
      } catch {}
      if (cases.length >= limit) break;
    }
    return cases;
  }
}

export class DiskDecisionRepository implements IDecisionRepository {
  private dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, "decisions");
  }

  async recordDecision(decision: DecisionRecord): Promise<void> {
    const file = path.join(this.dir, `${decision.decisionId}.json`);
    fs.writeFileSync(file, JSON.stringify(decision, null, 2), "utf-8");
  }

  async getDecisionById(decisionId: string): Promise<DecisionRecord | null> {
    const file = path.join(this.dir, `${decisionId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8")) as DecisionRecord;
    } catch {
      return null;
    }
  }

  async getDecisionsByGoal(goalId: string): Promise<DecisionRecord[]> {
    const all = await this.getRecentDecisions(100);
    return all.filter((d) => d.goalId === goalId);
  }

  async getRecentDecisions(limit: number = 50): Promise<DecisionRecord[]> {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    const records: DecisionRecord[] = [];
    for (const f of files) {
      try {
        records.push(JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8")) as DecisionRecord);
      } catch {}
      if (records.length >= limit) break;
    }
    return records;
  }
}

export class DiskReputationRepository implements IReputationRepository {
  private slayerFile: string;
  private healerFile: string;

  constructor(baseDir: string) {
    this.slayerFile = path.join(baseDir, "reputation", "slayers.json");
    this.healerFile = path.join(baseDir, "reputation", "healers.json");
  }

  private readMap<T>(file: string): Map<string, T> {
    if (!fs.existsSync(file)) return new Map();
    try {
      const obj = JSON.parse(fs.readFileSync(file, "utf-8"));
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  private writeMap<T>(file: string, map: Map<string, T>): void {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf-8");
  }

  async getSlayerReputation(agentId: string): Promise<SlayerReputation | null> {
    const map = this.readMap<SlayerReputation>(this.slayerFile);
    return map.get(agentId) || null;
  }

  async saveSlayerReputation(rep: SlayerReputation): Promise<void> {
    const map = this.readMap<SlayerReputation>(this.slayerFile);
    map.set(rep.agentId, rep);
    this.writeMap(this.slayerFile, map);
  }

  async getAllSlayerReputations(): Promise<SlayerReputation[]> {
    const map = this.readMap<SlayerReputation>(this.slayerFile);
    return Array.from(map.values());
  }

  async getHealerReputation(healerId: string): Promise<HealerReputation | null> {
    const map = this.readMap<HealerReputation>(this.healerFile);
    return map.get(healerId) || null;
  }

  async saveHealerReputation(rep: HealerReputation): Promise<void> {
    const map = this.readMap<HealerReputation>(this.healerFile);
    map.set(rep.healerId, rep);
    this.writeMap(this.healerFile, map);
  }

  async getAllHealerReputations(): Promise<HealerReputation[]> {
    const map = this.readMap<HealerReputation>(this.healerFile);
    return Array.from(map.values());
  }
}

export class DiskMemoryRepository implements IMemoryRepository {
  private dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, "memories");
  }

  async saveMemory(record: MemoryRecord): Promise<void> {
    const file = path.join(this.dir, `${record.memoryId}.json`);
    fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf-8");
  }

  async getMemory(layer: MemoryRecord["layer"], key: string): Promise<MemoryRecord | null> {
    const all = await this.queryMemories(layer);
    return all.find((m) => m.key === key) || null;
  }

  async queryMemories(layer?: MemoryRecord["layer"], queryText?: string, limit: number = 50): Promise<MemoryRecord[]> {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    const results: MemoryRecord[] = [];
    for (const f of files) {
      try {
        const item = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8")) as MemoryRecord;
        if (layer && item.layer !== layer) continue;
        if (queryText && !item.content.toLowerCase().includes(queryText.toLowerCase()) && !item.key.toLowerCase().includes(queryText.toLowerCase())) {
          continue;
        }
        results.push(item);
      } catch {}
      if (results.length >= limit) break;
    }
    return results;
  }

  async deleteMemory(memoryId: string): Promise<void> {
    const file = path.join(this.dir, `${memoryId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

export class DiskTaskDAGRepository implements ITaskDAGRepository {
  private dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, "dags");
  }

  async saveDAG(dag: TaskDAG): Promise<void> {
    const file = path.join(this.dir, `${dag.dagId}.json`);
    fs.writeFileSync(file, JSON.stringify(dag, null, 2), "utf-8");
  }

  async getDAG(dagId: string): Promise<TaskDAG | null> {
    const file = path.join(this.dir, `${dagId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8")) as TaskDAG;
    } catch {
      return null;
    }
  }

  async updateTaskNode(dagId: string, node: TaskNode): Promise<void> {
    const dag = await this.getDAG(dagId);
    if (dag) {
      dag.nodes[node.taskId] = node;
      await this.saveDAG(dag);
    }
  }

  async getActiveDAGs(): Promise<TaskDAG[]> {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    const dags: TaskDAG[] = [];
    for (const f of files) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8")) as TaskDAG;
        if (d.status === "PENDING" || d.status === "RUNNING") dags.push(d);
      } catch {}
    }
    return dags;
  }
}

export class DiskLeaseRepository implements ILeaseRepository {
  private file: string;

  constructor(baseDir: string) {
    this.file = path.join(baseDir, "leases", "active_leases.json");
  }

  private readMap(): Map<string, TaskLease> {
    if (!fs.existsSync(this.file)) return new Map();
    try {
      const obj = JSON.parse(fs.readFileSync(this.file, "utf-8"));
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  private writeMap(map: Map<string, TaskLease>): void {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(this.file, JSON.stringify(obj, null, 2), "utf-8");
  }

  async acquireLease(taskId: string, ownerAgentId: string, ttlMs: number, attempt: number = 1): Promise<boolean> {
    const now = new Date();
    const map = this.readMap();
    const existing = map.get(taskId);
    if (existing && existing.status === "ACTIVE") {
      const expires = new Date(existing.leaseExpiresAt);
      if (expires > now && existing.ownerAgentId !== ownerAgentId) {
        return false;
      }
    }

    const lease: TaskLease = {
      taskId,
      ownerAgentId,
      leaseStartedAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      attempt,
      heartbeatAt: now.toISOString(),
      status: "ACTIVE",
    };
    map.set(taskId, lease);
    this.writeMap(map);
    return true;
  }

  async renewLease(taskId: string, ownerAgentId: string, ttlMs: number): Promise<boolean> {
    const map = this.readMap();
    const existing = map.get(taskId);
    if (!existing || existing.ownerAgentId !== ownerAgentId || existing.status !== "ACTIVE") {
      return false;
    }
    const now = new Date();
    const updated: TaskLease = {
      ...existing,
      heartbeatAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    map.set(taskId, updated);
    this.writeMap(map);
    return true;
  }

  async releaseLease(taskId: string, ownerAgentId: string): Promise<void> {
    const map = this.readMap();
    const existing = map.get(taskId);
    if (existing && existing.ownerAgentId === ownerAgentId) {
      const updated: TaskLease = {
        ...existing,
        status: "RELEASED",
      };
      map.set(taskId, updated);
      this.writeMap(map);
    }
  }

  async getLease(taskId: string): Promise<TaskLease | null> {
    const map = this.readMap();
    return map.get(taskId) || null;
  }

  async getExpiredLeases(): Promise<TaskLease[]> {
    const now = new Date();
    const map = this.readMap();
    return Array.from(map.values()).filter(
      (l) => l.status === "ACTIVE" && new Date(l.leaseExpiresAt) <= now
    );
  }
}

import { MissionConcurrencyConflictError } from "../missions/MissionErrors";

export class DiskMissionRepository implements IMissionRepository {
  private dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, "missions");
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  async saveMission(mission: Mission, expectedVersion?: number): Promise<void> {
    this.ensureDir();
    const existing = await this.getMissionById(mission.missionId);
    const currentVersion = existing ? (existing.version || 1) : 1;
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new MissionConcurrencyConflictError(mission.missionId, expectedVersion, currentVersion);
    }
    const nextVersion = existing ? currentVersion + 1 : (mission.version || 1);
    const cloned = structuredClone(mission);
    cloned.version = nextVersion;

    const file = path.join(this.dir, `${mission.missionId}.json`);
    const tmpFile = `${file}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(cloned, null, 2), "utf-8");
    try {
      fs.renameSync(tmpFile, file);
    } catch (err: any) {
      if (err.code === "EPERM" || err.code === "EBUSY") {
        fs.copyFileSync(tmpFile, file);
        try { fs.unlinkSync(tmpFile); } catch {}
      } else {
        throw err;
      }
    }
  }

  async getMissionById(missionId: string): Promise<Mission | null> {
    const file = path.join(this.dir, `${missionId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf-8")) as Mission;
    } catch {
      return null;
    }
  }

  async getActiveMissions(): Promise<Mission[]> {
    const all = await this.getAllMissions();
    return all.filter((m) => m.status === "CREATED" || m.status === "PLANNING" || m.status === "RUNNING" || m.status === "REPLANNING");
  }

  async getAllMissions(limit: number = 50): Promise<Mission[]> {
    if (!fs.existsSync(this.dir)) return [];
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    const missions: Mission[] = [];
    for (const f of files) {
      try {
        missions.push(JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf-8")) as Mission);
      } catch {}
      if (missions.length >= limit) break;
    }
    return missions;
  }

  async deleteMission(missionId: string): Promise<void> {
    const file = path.join(this.dir, `${missionId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
