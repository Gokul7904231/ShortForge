/**
 * FactoryOS v1 — MongoDB Client & Persistent Repository Implementations
 */

import { MongoClient, Db, Collection } from "mongodb";
import type { WorldState } from "../contracts/WorldStateContracts";
import type { Case, CaseStatus } from "../contracts/CaseContracts";
import type { DecisionRecord, TaskDAG, TaskNode } from "../contracts/OverseerThinkingContracts";
import type { SlayerReputation } from "../contracts/SlayerContracts";
import type { HealerReputation } from "../contracts/HealerContracts";
import type { Mission } from "../contracts/MissionContracts";
import { MissionConcurrencyConflictError } from "../missions/MissionErrors";
import { MongoContextFabricRepository } from "./MongoContextFabricRepository";
import {
  InMemoryCaseRepository,
  InMemoryContextFabricRepository,
  InMemoryDecisionRepository,
  InMemoryLeaseRepository,
  InMemoryMemoryRepository,
  InMemoryMissionRepository,
  InMemoryReputationRepository,
  InMemoryTaskDAGRepository,
  InMemoryWorldStateRepository,
} from "./InMemoryDatabase";
import type {
  ICaseRepository,
  IDecisionRepository,
  ILeaseRepository,
  IMemoryRepository,
  IReputationRepository,
  ITaskDAGRepository,
  IWorldStateRepository,
  IMissionRepository,
  MemoryRecord,
  TaskLease,
} from "./DatabaseContracts";

export class MongoDBClient {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private uri: string;
  private dbName: string;
  private isConnected: boolean = false;

  constructor(uri: string = process.env.MONGODB_URI || "mongodb://localhost:27017", dbName: string = "factoryos") {
    this.uri = uri;
    this.dbName = dbName;
  }

  async connect(): Promise<boolean> {
    try {
      this.client = new MongoClient(this.uri, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
      });
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.isConnected = true;
      await this.ensureIndexes();
      return true;
    } catch (err) {
      this.isConnected = false;
      return false;
    }
  }

  getDb(): Db | null {
    return this.db;
  }

  getClient(): MongoClient | null {
    return this.client;
  }

  connected(): boolean {
    return this.isConnected;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      this.client = null;
      this.db = null;
    }
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.collection("cases").createIndex({ caseId: 1 }, { unique: true });
      await this.db.collection("cases").createIndex({ status: 1 });
      await this.db.collection("leases").createIndex({ taskId: 1 }, { unique: true });
      await this.db.collection("leases").createIndex({ leaseExpiresAt: 1 });
      await this.db.collection("memories").createIndex({ memoryId: 1 }, { unique: true });
      await this.db.collection("memories").createIndex({ layer: 1, key: 1 });
      await this.db.collection("task_dags").createIndex({ dagId: 1 }, { unique: true });
      await this.db.collection("decisions").createIndex({ decisionId: 1 }, { unique: true });
      await this.db.collection("slayer_reputations").createIndex({ agentId: 1 }, { unique: true });
      await this.db.collection("healer_reputations").createIndex({ healerId: 1 }, { unique: true });
      await this.db.collection("agent_workforce").createIndex({ workspaceId: 1, agentId: 1 }, { unique: true });
      await this.db.collection("agent_workforce").createIndex({ workspaceId: 1, updatedAt: -1 });
      await this.db.collection("agent_intercom_messages").createIndex({ "envelope.meta.scope.missionId": 1, createdAt: 1, intercomId: 1 });
      await this.db.collection("agent_intercom_delegations").createIndex({ missionId: 1, createdAt: 1, delegationId: 1 });
      await this.db.collection("agent_intercom_sessions").createIndex({ missionId: 1, lastSeenAt: -1 });
      await this.db.collection("mission_automation_recipes").createIndex({ workspaceId: 1, recipeId: 1 }, { unique: true });
      await this.db.collection("mission_automation_recipes").createIndex({ workspaceId: 1, updatedAt: -1 });
      await this.db.collection("mission_automation_launches").createIndex({ workspaceId: 1, launchId: 1 }, { unique: true });
      await this.db.collection("mission_automation_launches").createIndex({ workspaceId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
      await this.db.collection("fleet_activity").createIndex({ workspaceId: 1, timestamp: 1, activityId: 1 });
      await this.db.collection("fleet_activity").createIndex({ workspaceId: 1, missionId: 1, timestamp: 1 });
      await this.db.collection("fleet_activity").createIndex({ workspaceId: 1, agentId: 1, timestamp: 1 });
      await this.db.collection("treasury_accounts").createIndex({ accountId: 1 }, { unique: true });
      await this.db.collection("treasury_reservations").createIndex({ reservationId: 1 }, { unique: true });
      await this.db.collection("treasury_reservations").createIndex({ commandId: 1 }, { unique: true });
      await this.db.collection("treasury_reservations").createIndex({ accountId: 1, status: 1, expiresAt: 1 });
      await this.db.collection("treasury_ledger_events").createIndex({ eventId: 1 }, { unique: true });
      await this.db.collection("treasury_ledger_events").createIndex({ accountId: 1, occurredAt: -1, eventId: -1 });
      await this.db.collection("treasury_ledger_events").createIndex({ commandId: 1, occurredAt: -1 });
    } catch (e) {
      // Non-fatal if index creation throws in mock/restricted environments
    }
  }
}

export class MongoWorldStateRepository implements IWorldStateRepository {
  constructor(private db: Db) {}

  private get col(): Collection<WorldState & { _id?: string }> {
    return this.db.collection("world_state");
  }

  async getLatestState(): Promise<WorldState | null> {
    const doc = await this.col.findOne({}, { sort: { sequenceNumber: -1 } });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as WorldState;
  }

  async saveState(state: WorldState): Promise<void> {
    await this.col.insertOne(structuredClone(state));
  }

  async getStateHistory(limit: number = 50): Promise<WorldState[]> {
    const docs = await this.col.find({}).sort({ sequenceNumber: -1 }).limit(limit).toArray();
    return docs.map(({ _id, ...rest }) => rest as WorldState);
  }
}

export class MongoCaseRepository implements ICaseRepository {
  constructor(private db: Db) {}

  private get col(): Collection<Case & { _id?: string }> {
    return this.db.collection("cases");
  }

  async createCase(caseItem: Case): Promise<Case> {
    const cloned = structuredClone(caseItem);
    await this.col.insertOne(cloned);
    return cloned;
  }

  async getCaseById(caseId: string): Promise<Case | null> {
    const doc = await this.col.findOne({ caseId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as Case;
  }

  async updateCase(caseItem: Case): Promise<Case> {
    const cloned = structuredClone(caseItem);
    cloned.updatedAt = new Date().toISOString();
    await this.col.replaceOne({ caseId: cloned.caseId }, cloned, { upsert: true });
    return cloned;
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
    const docs = await this.col.find({ status: { $in: activeStatuses } }).toArray();
    return docs.map(({ _id, ...rest }) => rest as Case);
  }

  async getCasesByStatus(status: CaseStatus): Promise<Case[]> {
    const docs = await this.col.find({ status }).toArray();
    return docs.map(({ _id, ...rest }) => rest as Case);
  }

  async getAllCases(limit: number = 100): Promise<Case[]> {
    const docs = await this.col.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
    return docs.map(({ _id, ...rest }) => rest as Case);
  }
}

export class MongoDecisionRepository implements IDecisionRepository {
  constructor(private db: Db) {}

  private get col(): Collection<DecisionRecord & { _id?: string }> {
    return this.db.collection("decisions");
  }

  async recordDecision(decision: DecisionRecord): Promise<void> {
    await this.col.insertOne(structuredClone(decision));
  }

  async getDecisionById(decisionId: string): Promise<DecisionRecord | null> {
    const doc = await this.col.findOne({ decisionId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as DecisionRecord;
  }

  async getDecisionsByGoal(goalId: string): Promise<DecisionRecord[]> {
    const docs = await this.col.find({ goalId }).toArray();
    return docs.map(({ _id, ...rest }) => rest as DecisionRecord);
  }

  async getRecentDecisions(limit: number = 50): Promise<DecisionRecord[]> {
    const docs = await this.col.find({}).sort({ timestamp: -1 }).limit(limit).toArray();
    return docs.map(({ _id, ...rest }) => rest as DecisionRecord);
  }
}

export class MongoReputationRepository implements IReputationRepository {
  constructor(private db: Db) {}

  private get slayerCol(): Collection<SlayerReputation & { _id?: string }> {
    return this.db.collection("slayer_reputations");
  }

  private get healerCol(): Collection<HealerReputation & { _id?: string }> {
    return this.db.collection("healer_reputations");
  }

  async getSlayerReputation(agentId: string): Promise<SlayerReputation | null> {
    const doc = await this.slayerCol.findOne({ agentId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as SlayerReputation;
  }

  async saveSlayerReputation(rep: SlayerReputation): Promise<void> {
    await this.slayerCol.replaceOne({ agentId: rep.agentId }, structuredClone(rep), { upsert: true });
  }

  async getAllSlayerReputations(): Promise<SlayerReputation[]> {
    const docs = await this.slayerCol.find({}).toArray();
    return docs.map(({ _id, ...rest }) => rest as SlayerReputation);
  }

  async getHealerReputation(healerId: string): Promise<HealerReputation | null> {
    const doc = await this.healerCol.findOne({ healerId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as HealerReputation;
  }

  async saveHealerReputation(rep: HealerReputation): Promise<void> {
    await this.healerCol.replaceOne({ healerId: rep.healerId }, structuredClone(rep), { upsert: true });
  }

  async getAllHealerReputations(): Promise<HealerReputation[]> {
    const docs = await this.healerCol.find({}).toArray();
    return docs.map(({ _id, ...rest }) => rest as HealerReputation);
  }
}

export class MongoMemoryRepository implements IMemoryRepository {
  constructor(private db: Db) {}

  private get col(): Collection<MemoryRecord & { _id?: string }> {
    return this.db.collection("memories");
  }

  async saveMemory(record: MemoryRecord): Promise<void> {
    await this.col.replaceOne({ memoryId: record.memoryId }, structuredClone(record), { upsert: true });
  }

  async getMemory(layer: MemoryRecord["layer"], key: string): Promise<MemoryRecord | null> {
    const doc = await this.col.findOne({ layer, key });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as MemoryRecord;
  }

  async queryMemories(layer?: MemoryRecord["layer"], queryText?: string, limit: number = 20): Promise<MemoryRecord[]> {
    const query: Record<string, unknown> = {};
    if (layer) query.layer = layer;
    if (queryText) {
      query.$or = [
        { key: { $regex: queryText, $options: "i" } },
        { content: { $regex: queryText, $options: "i" } },
      ];
    }
    const docs = await this.col.find(query).limit(limit).toArray();
    return docs.map(({ _id, ...rest }) => rest as MemoryRecord);
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await this.col.deleteOne({ memoryId });
  }
}

export class MongoTaskDAGRepository implements ITaskDAGRepository {
  constructor(private db: Db) {}

  private get col(): Collection<TaskDAG & { _id?: string }> {
    return this.db.collection("task_dags");
  }

  async saveDAG(dag: TaskDAG): Promise<void> {
    await this.col.replaceOne({ dagId: dag.dagId }, structuredClone(dag), { upsert: true });
  }

  async getDAG(dagId: string): Promise<TaskDAG | null> {
    const doc = await this.col.findOne({ dagId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as TaskDAG;
  }

  async updateTaskNode(dagId: string, node: TaskNode): Promise<void> {
    await this.col.updateOne(
      { dagId },
      { $set: { [`nodes.${node.taskId}`]: structuredClone(node) } }
    );
  }

  async getActiveDAGs(): Promise<TaskDAG[]> {
    const docs = await this.col.find({ status: { $in: ["PENDING", "RUNNING"] } }).toArray();
    return docs.map(({ _id, ...rest }) => rest as TaskDAG);
  }
}

export class MongoLeaseRepository implements ILeaseRepository {
  private readonly col: Collection<TaskLease & { _id?: string }>;
  private readonly meta: Collection<{ _id: string; nextFencingToken?: number }>;

  constructor(private db: Db) {
    this.col = db.collection("leases");
    this.meta = db.collection("lease_fencing_meta");
  }

  async acquireLease(taskId: string, ownerAgentId: string, ttlMs: number, attempt: number = 1): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    const existing = await this.col.findOne({ taskId });
    if (existing && existing.status === "ACTIVE" && new Date(existing.leaseExpiresAt) > now) {
      if (existing.ownerAgentId !== ownerAgentId) return false;
    }

    const counter = await this.meta.findOneAndUpdate(
      { _id: "singleton" },
      { $inc: { nextFencingToken: 1 } },
      { upsert: true, returnDocument: "after" }
    );
    const fencingToken = Math.max(1, counter?.nextFencingToken || 1);

    const lease: TaskLease = {
      taskId,
      ownerAgentId,
      leaseStartedAt: now.toISOString(),
      leaseExpiresAt: expiresAt,
      attempt,
      fencingToken,
      heartbeatAt: now.toISOString(),
      status: "ACTIVE",
    };

    await this.col.replaceOne({ taskId }, lease, { upsert: true });
    return true;
  }

  async renewLease(taskId: string, ownerAgentId: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const res = await this.col.updateOne(
      { taskId, ownerAgentId, status: "ACTIVE" },
      { $set: { heartbeatAt: now.toISOString(), leaseExpiresAt: expiresAt } }
    );
    return res.modifiedCount > 0;
  }

  async releaseLease(taskId: string, ownerAgentId: string): Promise<void> {
    await this.col.updateOne(
      { taskId, ownerAgentId },
      { $set: { status: "RELEASED" } }
    );
  }

  async releaseLeaseIfFenced(
    taskId: string,
    ownerAgentId: string,
    expectedFencingToken: number
  ): Promise<boolean> {
    const result = await this.col.updateOne(
      {
        taskId,
        ownerAgentId,
        status: "ACTIVE",
        fencingToken: expectedFencingToken,
      },
      { $set: { status: "RELEASED" } }
    );
    return result.matchedCount === 1;
  }

  async getLease(taskId: string): Promise<TaskLease | null> {
    const doc = await this.col.findOne({ taskId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as TaskLease;
  }

  async getExpiredLeases(): Promise<TaskLease[]> {
    const now = new Date().toISOString();
    const docs = await this.col.find({
      status: "ACTIVE",
      leaseExpiresAt: { $lte: now },
    }).toArray();
    return docs.map(({ _id, ...rest }) => rest as TaskLease);
  }
}

export class MongoMissionRepository implements IMissionRepository {
  constructor(private db: Db) {}

  private get col(): Collection<Mission & { _id?: string }> {
    return this.db.collection("missions");
  }

  async saveMission(mission: Mission, expectedVersion?: number): Promise<void> {
    const existing = await this.getMissionById(mission.missionId);
    const currentVersion = existing ? (existing.version || 1) : 1;
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new MissionConcurrencyConflictError(mission.missionId, expectedVersion, currentVersion);
    }
    const nextVersion = existing ? currentVersion + 1 : (mission.version || 1);
    const cloned = structuredClone(mission);
    cloned.version = nextVersion;

    if (existing && expectedVersion !== undefined) {
      const res = await this.col.updateOne(
        { missionId: mission.missionId, version: currentVersion },
        { $set: cloned }
      );
      if (res.matchedCount === 0) {
        const fresh = await this.getMissionById(mission.missionId);
        throw new MissionConcurrencyConflictError(mission.missionId, expectedVersion, fresh?.version || currentVersion);
      }
    } else {
      await this.col.replaceOne({ missionId: mission.missionId }, cloned, { upsert: true });
    }
  }

  async getMissionById(missionId: string): Promise<Mission | null> {
    const doc = await this.col.findOne({ missionId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as Mission;
  }

  async getActiveMissions(): Promise<Mission[]> {
    const docs = await this.col.find({
      status: { $in: ["CREATED", "PLANNING", "RUNNING", "REPLANNING"] }
    }).toArray();
    return docs.map(({ _id, ...rest }) => rest as Mission);
  }

  async getAllMissions(limit: number = 50): Promise<Mission[]> {
    const docs = await this.col.find({}).limit(limit).toArray();
    return docs.map(({ _id, ...rest }) => rest as Mission);
  }

  async deleteMission(missionId: string): Promise<void> {
    await this.col.deleteOne({ missionId });
  }
}

import { PersistentDiskDatabase } from "./PersistentDiskDatabase";

export class DatabaseFactory {
  static createRepositories(mongoDb?: Db | null, mongoClient?: MongoClient | null) {
    if (mongoDb) {
      return {
        worldState: new MongoWorldStateRepository(mongoDb),
        cases: new MongoCaseRepository(mongoDb),
        decisions: new MongoDecisionRepository(mongoDb),
        reputation: new MongoReputationRepository(mongoDb),
        memories: new MongoMemoryRepository(mongoDb),
        taskDAGs: new MongoTaskDAGRepository(mongoDb),
        leases: new MongoLeaseRepository(mongoDb),
        missions: new MongoMissionRepository(mongoDb),
        contextFabric: new MongoContextFabricRepository(mongoDb),
      };
    } else {
      return {
        worldState: new InMemoryWorldStateRepository(),
        cases: new InMemoryCaseRepository(),
        decisions: new InMemoryDecisionRepository(),
        reputation: new InMemoryReputationRepository(),
        memories: new InMemoryMemoryRepository(),
        taskDAGs: new InMemoryTaskDAGRepository(),
        leases: new InMemoryLeaseRepository(),
        missions: new InMemoryMissionRepository(),
        contextFabric: new InMemoryContextFabricRepository(),
      };
    }
  }

  static createDiskRepositories(baseDir?: string) {
    const diskDb = new PersistentDiskDatabase(baseDir);
    return diskDb.getRepos();
  }
}


