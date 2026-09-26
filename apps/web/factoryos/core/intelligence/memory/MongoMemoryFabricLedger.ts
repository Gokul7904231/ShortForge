/**
 * ShortForge / FactoryOS — MongoDB Memory Fabric Ledger
 *
 * This collection is an ingestion ledger and checkpoint store, not a second
 * knowledge database. Operational truth stays in the existing MongoDB
 * collections; derived knowledge stays in knowledge/.
 */

import type { Collection, Db } from "mongodb";
import {
  type IMemoryFabricLedger,
  type MemoryFabricLedgerRecord,
  type MemoryFabricOffset,
} from "./MemoryFabricContracts";

type MongoMemoryFabricLedgerDocument = MemoryFabricLedgerRecord & {
  _id?: string;
};

type MongoMemoryFabricOffsetDocument = MemoryFabricOffset & {
  _id?: string;
};

export class MongoMemoryFabricLedger implements IMemoryFabricLedger {
  private readonly events: Collection<MongoMemoryFabricLedgerDocument>;
  private readonly offsets: Collection<MongoMemoryFabricOffsetDocument>;

  constructor(private readonly db: Db) {
    this.events = db.collection<MongoMemoryFabricLedgerDocument>("memory_fabric_events");
    this.offsets = db.collection<MongoMemoryFabricOffsetDocument>("memory_fabric_offsets");
  }

  async initialize(): Promise<void> {
    await this.events.createIndex({ sourceKey: 1 }, { unique: true });
    await this.events.createIndex({ status: 1, createdAt: 1 });
    await this.events.createIndex({ lifecycle: 1, updatedAt: -1 });
    await this.events.createIndex({ sourceHash: 1 });
    await this.offsets.createIndex({ streamKey: 1 }, { unique: true });
  }

  async insertIfAbsent(record: MemoryFabricLedgerRecord): Promise<boolean> {
    const result = await this.events.updateOne(
      { sourceKey: record.sourceKey },
      { $setOnInsert: { ...structuredClone(record) } },
      { upsert: true }
    );
    return result.upsertedCount === 1;
  }

  async get(sourceKey: string): Promise<MemoryFabricLedgerRecord | null> {
    const doc = await this.events.findOne({ sourceKey });
    if (!doc) return null;
    const { _id, ...record } = doc;
    return record;
  }

  async update(sourceKey: string, patch: Partial<MemoryFabricLedgerRecord>): Promise<void> {
    await this.events.updateOne(
      { sourceKey },
      {
        $set: {
          ...structuredClone(patch),
          updatedAt: new Date().toISOString(),
        },
      }
    );
  }

  async listPending(limit = 50): Promise<MemoryFabricLedgerRecord[]> {
    const docs = await this.events
      .find({ status: { $in: ["INGESTED", "MATERIALIZED", "CANDIDATE"] } })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();

    return docs.map(({ _id, ...record }) => record);
  }

  async countByStatus(status: MemoryFabricLedgerRecord["status"]): Promise<number> {
    return this.events.countDocuments({ status });
  }

  async getRecent(limit = 50): Promise<MemoryFabricLedgerRecord[]> {
    const docs = await this.events
      .find({})
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();

    return docs.map(({ _id, ...record }) => record);
  }

  async getOffset(streamKey: string): Promise<MemoryFabricOffset | null> {
    const doc = await this.offsets.findOne({ streamKey });
    if (!doc) return null;
    const { _id, ...offset } = doc;
    return offset;
  }

  async setOffset(offset: MemoryFabricOffset): Promise<void> {
    await this.offsets.replaceOne(
      { streamKey: offset.streamKey },
      structuredClone(offset),
      { upsert: true }
    );
  }
}

/**
 * Deterministic in-memory ledger used by unit/integration tests and
 * non-persistent local development.
 */
export class InMemoryMemoryFabricLedger implements IMemoryFabricLedger {
  private readonly events = new Map<string, MemoryFabricLedgerRecord>();
  private readonly offsets = new Map<string, MemoryFabricOffset>();

  async initialize(): Promise<void> {}

  async insertIfAbsent(record: MemoryFabricLedgerRecord): Promise<boolean> {
    if (this.events.has(record.sourceKey)) return false;
    this.events.set(record.sourceKey, structuredClone(record));
    return true;
  }

  async get(sourceKey: string): Promise<MemoryFabricLedgerRecord | null> {
    const record = this.events.get(sourceKey);
    return record ? structuredClone(record) : null;
  }

  async update(sourceKey: string, patch: Partial<MemoryFabricLedgerRecord>): Promise<void> {
    const existing = this.events.get(sourceKey);
    if (!existing) return;
    this.events.set(sourceKey, {
      ...existing,
      ...structuredClone(patch),
      updatedAt: new Date().toISOString(),
    });
  }

  async listPending(limit = 50): Promise<MemoryFabricLedgerRecord[]> {
    const pending = [...this.events.values()]
      .filter((r) => ["INGESTED", "MATERIALIZED", "CANDIDATE"].includes(r.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
    return structuredClone(pending);
  }

  async countByStatus(status: MemoryFabricLedgerRecord["status"]): Promise<number> {
    return [...this.events.values()].filter((record) => record.status === status).length;
  }

  async getRecent(limit = 50): Promise<MemoryFabricLedgerRecord[]> {
    return structuredClone(
      [...this.events.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
    );
  }

  async getOffset(streamKey: string): Promise<MemoryFabricOffset | null> {
    const offset = this.offsets.get(streamKey);
    return offset ? structuredClone(offset) : null;
  }

  async setOffset(offset: MemoryFabricOffset): Promise<void> {
    this.offsets.set(offset.streamKey, structuredClone(offset));
  }
}
