import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { Db, Collection } from "mongodb";
import type {
  SlayerActionIntent,
  SlayerActionLease,
  SlayerAuthorizationGrant,
  SlayerEnforcementReceipt,
  SlayerIncident,
  SlayerPrimeAction,
  SlayerPrimeScope,
} from "../../contracts/SlayerPrimeContracts";

export interface SlayerPrimeLeadershipLease {
  readonly leaseId: string;
  readonly holderId: string;
  readonly epoch: number;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

export interface SlayerPrimeStateSnapshot {
  readonly incidents: SlayerIncident[];
  readonly intents: SlayerActionIntent[];
  readonly receipts: SlayerEnforcementReceipt[];
  readonly actionLeases: SlayerActionLease[];
  readonly leadership: SlayerPrimeLeadershipLease | null;
}

export interface PersistedSlayerPrimeJournalEntry {
  readonly sequence: number;
  readonly eventType:
    | "INCIDENT_UPSERTED"
    | "INTENT_CREATED"
    | "RECEIPT_WRITTEN"
    | "LEADERSHIP_ACQUIRED"
    | "LEADERSHIP_RENEWED"
    | "LEADERSHIP_RELEASED"
    | "ACTION_LEASE_ACQUIRED"
    | "ACTION_LEASE_RELEASED";
  readonly occurredAt: string;
  readonly holderId?: string;
  readonly incidentId?: string;
  readonly intentId?: string;
  readonly receiptId?: string;
  readonly actionLeaseId?: string;
  readonly fencingToken?: number;
  readonly epoch?: number;
}

export interface SlayerPrimeStateStore {
  load(): Promise<SlayerPrimeStateSnapshot>;
  upsertIncident(
    incident: SlayerIncident,
    writer?: { holderId: string; epoch: number }
  ): Promise<boolean>;
  createIntentIfAbsent(intent: SlayerActionIntent): Promise<{
    created: boolean;
    intent: SlayerActionIntent;
  }>;
  upsertReceipt(receipt: SlayerEnforcementReceipt): Promise<void>;
  acquireLeadership(
    holderId: string,
    ttlMs: number
  ): Promise<SlayerPrimeLeadershipLease | null>;
  renewLeadership(
    lease: SlayerPrimeLeadershipLease,
    ttlMs: number
  ): Promise<SlayerPrimeLeadershipLease | null>;
  releaseLeadership(lease: SlayerPrimeLeadershipLease): Promise<void>;
  isLeadershipCurrent(holderId: string, epoch: number): Promise<boolean>;
  acquireActionLease(
    intent: SlayerActionIntent,
    holderId: string,
    ttlMs: number,
    leadershipEpoch: number
  ): Promise<SlayerActionLease | null>;
  getActionLease(actionLeaseId: string): Promise<SlayerActionLease | null>;
  releaseActionLease(actionLeaseId: string, holderId?: string, fencingToken?: number): Promise<void>;
  appendJournal(entry: Omit<PersistedSlayerPrimeJournalEntry, "sequence">): Promise<void>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemorySlayerPrimeStateStore implements SlayerPrimeStateStore {
  private incidents = new Map<string, SlayerIncident>();
  private intents = new Map<string, SlayerActionIntent>();
  private receipts = new Map<string, SlayerEnforcementReceipt>();
  private actionLeases = new Map<string, SlayerActionLease>();
  private leadership: SlayerPrimeLeadershipLease | null = null;
  private nextEpoch = 1;
  private nextFencingToken = 1;
  private nextJournalSequence = 1;

  async load(): Promise<SlayerPrimeStateSnapshot> {
    this.expireLeadershipIfNeeded();
    return clone({
      incidents: Array.from(this.incidents.values()),
      intents: Array.from(this.intents.values()),
      receipts: Array.from(this.receipts.values()),
      actionLeases: Array.from(this.actionLeases.values()),
      leadership: this.leadership,
    });
  }

  async upsertIncident(
    incident: SlayerIncident,
    writer?: { holderId: string; epoch: number }
  ): Promise<boolean> {
    const currentLeadership = this.leadership;
    if (
      writer &&
      (!currentLeadership ||
        currentLeadership.holderId !== writer.holderId ||
        currentLeadership.epoch !== writer.epoch ||
        new Date(currentLeadership.expiresAt).getTime() <= Date.now())
    ) {
      return false;
    }
    const current = this.incidents.get(incident.incidentId);
    if (
      writer &&
      current?.persistenceEpoch !== undefined &&
      current.persistenceEpoch > writer.epoch
    ) {
      return false;
    }
    this.incidents.set(
      incident.incidentId,
      clone({
        ...incident,
        ...(writer ? { persistenceEpoch: writer.epoch } : {}),
      })
    );
    return true;
  }

  async createIntentIfAbsent(intent: SlayerActionIntent): Promise<{ created: boolean; intent: SlayerActionIntent }> {
    const existing = Array.from(this.intents.values()).find(
      (candidate) => candidate.dedupeKey === intent.dedupeKey
    );
    if (existing) return { created: false, intent: clone(existing) };
    this.intents.set(intent.intentId, clone(intent));
    return { created: true, intent: clone(intent) };
  }

  async upsertReceipt(receipt: SlayerEnforcementReceipt): Promise<void> {
    this.receipts.set(receipt.receiptId, clone(receipt));
  }

  async acquireLeadership(holderId: string, ttlMs: number): Promise<SlayerPrimeLeadershipLease | null> {
    const previousEpoch = this.leadership?.epoch || 0;
    this.expireLeadershipIfNeeded();
    if (this.leadership && this.leadership.holderId !== holderId) return null;

    const now = new Date();
    const current = this.leadership;
    const lease: SlayerPrimeLeadershipLease = {
      leaseId: current?.leaseId || "slayleader_" + randomUUID().replace(/-/g, "").slice(0, 16),
      holderId,
      epoch: current
        ? current.epoch + 1
        : Math.max(this.nextEpoch++, previousEpoch + 1),
      acquiredAt: current?.acquiredAt || now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    this.leadership = lease;
    return clone(lease);
  }

  async renewLeadership(
    lease: SlayerPrimeLeadershipLease,
    ttlMs: number
  ): Promise<SlayerPrimeLeadershipLease | null> {
    if (
      !this.leadership ||
      this.leadership.leaseId !== lease.leaseId ||
      this.leadership.holderId !== lease.holderId ||
      this.leadership.epoch !== lease.epoch
    ) {
      return null;
    }
    const now = new Date();
    const renewed: SlayerPrimeLeadershipLease = {
      ...this.leadership,
      // Renewal extends the current term; only a holder change creates a new fencing epoch.
      epoch: this.leadership.epoch,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    this.leadership = renewed;
    return clone(renewed);
  }

  async releaseLeadership(lease: SlayerPrimeLeadershipLease): Promise<void> {
    if (
      this.leadership &&
      this.leadership.leaseId === lease.leaseId &&
      this.leadership.holderId === lease.holderId &&
      this.leadership.epoch === lease.epoch
    ) {
      this.nextEpoch = Math.max(this.nextEpoch, lease.epoch + 1);
      this.leadership = null;
    }
  }

  async isLeadershipCurrent(holderId: string, epoch: number): Promise<boolean> {
    this.expireLeadershipIfNeeded();
    return Boolean(
      this.leadership &&
        this.leadership.holderId === holderId &&
        this.leadership.expiresAt > new Date().toISOString() &&
        this.leadership.epoch === epoch
    );
  }

  async acquireActionLease(
    intent: SlayerActionIntent,
    holderId: string,
    ttlMs: number,
    leadershipEpoch: number
  ): Promise<SlayerActionLease | null> {
    if (!(await this.isLeadershipCurrent(holderId, leadershipEpoch))) return null;

    const existing = Array.from(this.actionLeases.values()).find(
      (candidate) =>
        candidate.intentId === intent.intentId &&
        candidate.status === "ACTIVE" &&
        new Date(candidate.expiresAt).getTime() > Date.now()
    );
    if (existing) return null;

    const now = new Date();
    const lease: SlayerActionLease = {
      actionLeaseId: "slaylease_" + randomUUID().replace(/-/g, "").slice(0, 16),
      intentId: intent.intentId,
      incidentId: intent.incidentId,
      action: intent.action,
      targetId: intent.targetId,
      holderId,
      fencingToken: this.nextFencingToken++,
      leadershipEpoch,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      status: "ACTIVE",
    };
    this.actionLeases.set(lease.actionLeaseId, clone(lease));
    return clone(lease);
  }

  async getActionLease(actionLeaseId: string): Promise<SlayerActionLease | null> {
    const lease = this.actionLeases.get(actionLeaseId);
    if (!lease) return null;
    if (lease.status === "ACTIVE" && new Date(lease.expiresAt).getTime() <= Date.now()) {
      const expired = { ...lease, status: "EXPIRED" as const };
      this.actionLeases.set(actionLeaseId, expired);
      return clone(expired);
    }
    return clone(lease);
  }

  async releaseActionLease(
    actionLeaseId: string,
    holderId?: string,
    fencingToken?: number
  ): Promise<void> {
    const lease = this.actionLeases.get(actionLeaseId);
    if (!lease || lease.status !== "ACTIVE") return;
    if (holderId && lease.holderId !== holderId) return;
    if (fencingToken !== undefined && lease.fencingToken !== fencingToken) return;
    this.actionLeases.set(actionLeaseId, { ...lease, status: "RELEASED" });
  }

  async appendJournal(entry: Omit<PersistedSlayerPrimeJournalEntry, "sequence">): Promise<void> {
    this.nextJournalSequence += 1;
  }

  private expireLeadershipIfNeeded(): void {
    if (this.leadership && new Date(this.leadership.expiresAt).getTime() <= Date.now()) {
      this.leadership = null;
    }
  }
}

interface DiskState {
  incidents: Record<string, SlayerIncident>;
  intents: Record<string, SlayerActionIntent>;
  receipts: Record<string, SlayerEnforcementReceipt>;
  actionLeases: Record<string, SlayerActionLease>;
  leadership: SlayerPrimeLeadershipLease | null;
  nextEpoch: number;
  nextFencingToken: number;
  journalSequence: number;
  journal: PersistedSlayerPrimeJournalEntry[];
}

export class DiskSlayerPrimeStateStore implements SlayerPrimeStateStore {
  private readonly file: string;
  private readonly limit: number;

  constructor(baseDir = path.join(process.cwd(), "data", "factoryos_state"), journalLimit = 5000) {
    const dir = path.join(baseDir, "slayer_prime");
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "state.json");
    this.limit = journalLimit;
  }

  async load(): Promise<SlayerPrimeStateSnapshot> {
    const state = this.read();
    this.expire(state);
    this.write(state);
    return clone({
      incidents: Object.values(state.incidents),
      intents: Object.values(state.intents),
      receipts: Object.values(state.receipts),
      actionLeases: Object.values(state.actionLeases),
      leadership: state.leadership,
    });
  }

  async upsertIncident(
    incident: SlayerIncident,
    writer?: { holderId: string; epoch: number }
  ): Promise<boolean> {
    const state = this.read();
    if (
      writer &&
      (!state.leadership ||
        state.leadership.holderId !== writer.holderId ||
        state.leadership.epoch !== writer.epoch ||
        new Date(state.leadership.expiresAt).getTime() <= Date.now())
    ) {
      return false;
    }
    const current = state.incidents[incident.incidentId];
    if (
      writer &&
      current?.persistenceEpoch !== undefined &&
      current.persistenceEpoch > writer.epoch
    ) {
      return false;
    }
    state.incidents[incident.incidentId] = clone({
      ...incident,
      ...(writer ? { persistenceEpoch: writer.epoch } : {}),
    });
    this.journal(state, {
      eventType: "INCIDENT_UPSERTED",
      occurredAt: new Date().toISOString(),
      incidentId: incident.incidentId,
      holderId: writer?.holderId,
      epoch: writer?.epoch,
    });
    this.write(state);
    return true;
  }

  async createIntentIfAbsent(intent: SlayerActionIntent): Promise<{ created: boolean; intent: SlayerActionIntent }> {
    const state = this.read();
    const existing = Object.values(state.intents).find((candidate) => candidate.dedupeKey === intent.dedupeKey);
    if (existing) return { created: false, intent: clone(existing) };
    state.intents[intent.intentId] = clone(intent);
    this.journal(state, { eventType: "INTENT_CREATED", occurredAt: new Date().toISOString(), intentId: intent.intentId });
    this.write(state);
    return { created: true, intent: clone(intent) };
  }

  async upsertReceipt(receipt: SlayerEnforcementReceipt): Promise<void> {
    const state = this.read();
    state.receipts[receipt.receiptId] = clone(receipt);
    this.journal(state, { eventType: "RECEIPT_WRITTEN", occurredAt: new Date().toISOString(), receiptId: receipt.receiptId });
    this.write(state);
  }

  async acquireLeadership(holderId: string, ttlMs: number): Promise<SlayerPrimeLeadershipLease | null> {
    const state = this.read();
    const previousEpoch = state.leadership?.epoch || 0;
    this.expire(state);
    if (state.leadership && state.leadership.holderId !== holderId) return null;

    const now = new Date();
    const current = state.leadership;
    const lease: SlayerPrimeLeadershipLease = {
      leaseId: current?.leaseId || "slayleader_" + randomUUID().replace(/-/g, "").slice(0, 16),
      holderId,
      epoch: current
        ? current.epoch + 1
        : Math.max(state.nextEpoch++, previousEpoch + 1),
      acquiredAt: current?.acquiredAt || now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    state.leadership = lease;
    this.journal(state, {
      eventType: current ? "LEADERSHIP_RENEWED" : "LEADERSHIP_ACQUIRED",
      occurredAt: now.toISOString(),
      holderId,
      epoch: lease.epoch,
    });
    this.write(state);
    return clone(lease);
  }

  async renewLeadership(lease: SlayerPrimeLeadershipLease, ttlMs: number): Promise<SlayerPrimeLeadershipLease | null> {
    const state = this.read();
    this.expire(state);
    if (
      !state.leadership ||
      state.leadership.leaseId !== lease.leaseId ||
      state.leadership.holderId !== lease.holderId ||
      state.leadership.epoch !== lease.epoch
    ) return null;

    const now = new Date();
    const renewed = {
      ...state.leadership,
      // Renewal extends the current term; only a holder change creates a new fencing epoch.
      epoch: state.leadership.epoch,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    state.leadership = renewed;
    this.journal(state, { eventType: "LEADERSHIP_RENEWED", occurredAt: now.toISOString(), holderId: lease.holderId, epoch: renewed.epoch });
    this.write(state);
    return clone(renewed);
  }

  async releaseLeadership(lease: SlayerPrimeLeadershipLease): Promise<void> {
    const state = this.read();
    if (
      state.leadership &&
      state.leadership.leaseId === lease.leaseId &&
      state.leadership.holderId === lease.holderId &&
      state.leadership.epoch === lease.epoch
    ) {
      state.nextEpoch = Math.max(state.nextEpoch, lease.epoch + 1);
      state.leadership = null;
      this.journal(state, { eventType: "LEADERSHIP_RELEASED", occurredAt: new Date().toISOString(), holderId: lease.holderId, epoch: lease.epoch });
      this.write(state);
    }
  }

  async isLeadershipCurrent(holderId: string, epoch: number): Promise<boolean> {
    const state = this.read();
    this.expire(state);
    const current = state.leadership;
    return Boolean(current && current.holderId === holderId && current.epoch === epoch && new Date(current.expiresAt).getTime() > Date.now());
  }

  async acquireActionLease(intent: SlayerActionIntent, holderId: string, ttlMs: number, leadershipEpoch: number): Promise<SlayerActionLease | null> {
    const state = this.read();
    this.expire(state);
    const currentLeadership = state.leadership;
    if (!currentLeadership || currentLeadership.holderId !== holderId || currentLeadership.epoch !== leadershipEpoch || new Date(currentLeadership.expiresAt).getTime() <= Date.now()) return null;

    const active = Object.values(state.actionLeases).find(
      (candidate) => candidate.intentId === intent.intentId && candidate.status === "ACTIVE" && new Date(candidate.expiresAt).getTime() > Date.now()
    );
    if (active) return null;

    const now = new Date();
    const lease: SlayerActionLease = {
      actionLeaseId: "slaylease_" + randomUUID().replace(/-/g, "").slice(0, 16),
      intentId: intent.intentId,
      incidentId: intent.incidentId,
      action: intent.action,
      targetId: intent.targetId,
      holderId,
      fencingToken: state.nextFencingToken++,
      leadershipEpoch,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      status: "ACTIVE",
    };
    state.actionLeases[lease.actionLeaseId] = lease;
    this.journal(state, {
      eventType: "ACTION_LEASE_ACQUIRED",
      occurredAt: now.toISOString(),
      holderId,
      intentId: intent.intentId,
      actionLeaseId: lease.actionLeaseId,
      fencingToken: lease.fencingToken,
      epoch: leadershipEpoch,
    });
    this.write(state);
    return clone(lease);
  }

  async getActionLease(actionLeaseId: string): Promise<SlayerActionLease | null> {
    const state = this.read();
    const lease = state.actionLeases[actionLeaseId];
    if (!lease) return null;
    if (lease.status === "ACTIVE" && new Date(lease.expiresAt).getTime() <= Date.now()) {
      state.actionLeases[actionLeaseId] = { ...lease, status: "EXPIRED" };
      this.write(state);
      return clone(state.actionLeases[actionLeaseId]);
    }
    return clone(lease);
  }

  async releaseActionLease(actionLeaseId: string, holderId?: string, fencingToken?: number): Promise<void> {
    const state = this.read();
    const lease = state.actionLeases[actionLeaseId];
    if (!lease || lease.status !== "ACTIVE") return;
    if (holderId && lease.holderId !== holderId) return;
    if (fencingToken !== undefined && lease.fencingToken !== fencingToken) return;
    state.actionLeases[actionLeaseId] = { ...lease, status: "RELEASED" };
    this.journal(state, {
      eventType: "ACTION_LEASE_RELEASED",
      occurredAt: new Date().toISOString(),
      holderId: lease.holderId,
      actionLeaseId,
      fencingToken: lease.fencingToken,
    });
    this.write(state);
  }

  async appendJournal(entry: Omit<PersistedSlayerPrimeJournalEntry, "sequence">): Promise<void> {
    const state = this.read();
    this.journal(state, entry);
    this.write(state);
  }

  private read(): DiskState {
    if (!fs.existsSync(this.file)) {
      return { incidents: {}, intents: {}, receipts: {}, actionLeases: {}, leadership: null, nextEpoch: 1, nextFencingToken: 1, journalSequence: 0, journal: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf-8")) as DiskState;
    } catch {
      return { incidents: {}, intents: {}, receipts: {}, actionLeases: {}, leadership: null, nextEpoch: 1, nextFencingToken: 1, journalSequence: 0, journal: [] };
    }
  }

  private write(state: DiskState): void {
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
    fs.renameSync(tmp, this.file);
  }

  private journal(state: DiskState, entry: Omit<PersistedSlayerPrimeJournalEntry, "sequence">): void {
    state.journalSequence += 1;
    state.journal.push({ ...entry, sequence: state.journalSequence });
    if (state.journal.length > this.limit) state.journal.splice(0, state.journal.length - this.limit);
  }

  private expire(state: DiskState): void {
    if (state.leadership && new Date(state.leadership.expiresAt).getTime() <= Date.now()) state.leadership = null;
    for (const [id, lease] of Object.entries(state.actionLeases)) {
      if (lease.status === "ACTIVE" && new Date(lease.expiresAt).getTime() <= Date.now()) {
        state.actionLeases[id] = { ...lease, status: "EXPIRED" };
      }
    }
  }
}

interface MongoLeadershipDoc {
  _id: string;
  leaseId: string;
  holderId: string;
  epoch: number;
  acquiredAt: string;
  expiresAt: string;
}

interface MongoMetaDoc {
  _id: string;
  nextFencingToken?: number;
}

export class MongoSlayerPrimeStateStore implements SlayerPrimeStateStore {
  private readonly incidents: Collection<SlayerIncident & { _id?: string }>;
  private readonly intents: Collection<SlayerActionIntent & { _id?: string }>;
  private readonly receipts: Collection<SlayerEnforcementReceipt & { _id?: string }>;
  private readonly actionLeases: Collection<SlayerActionLease & { _id?: string }>;
  private readonly leadership: Collection<MongoLeadershipDoc>;
  private readonly meta: Collection<MongoMetaDoc>;
  private readonly ready: Promise<void>;

  constructor(db: Db) {
    const consistencyOptions = {
      readPreference: "primary" as const,
      readConcern: { level: "majority" as const },
      writeConcern: { w: "majority" as const },
    };
    this.incidents = db.collection("slayer_prime_incidents", consistencyOptions);
    this.intents = db.collection("slayer_prime_intents", consistencyOptions);
    this.receipts = db.collection("slayer_prime_receipts", consistencyOptions);
    this.actionLeases = db.collection("slayer_prime_action_leases", consistencyOptions);
    this.leadership = db.collection("slayer_prime_leadership", consistencyOptions);
    this.meta = db.collection("slayer_prime_meta", consistencyOptions);
    this.ready = this.ensureIndexes();
  }

  async load(): Promise<SlayerPrimeStateSnapshot> {
    await this.ready;
    const [incidents, intents, receipts, actionLeases, leadership] = await Promise.all([
      this.incidents.find({}).toArray(),
      this.intents.find({}).toArray(),
      this.receipts.find({}).toArray(),
      this.actionLeases.find({}).toArray(),
      this.leadership.findOne({ _id: "singleton" }),
    ]);
    const snapshot = {
      incidents: incidents.map(({ _id, ...rest }) => rest as SlayerIncident),
      intents: intents.map(({ _id, ...rest }) => rest as SlayerActionIntent),
      receipts: receipts.map(({ _id, ...rest }) => rest as SlayerEnforcementReceipt),
      actionLeases: actionLeases.map(({ _id, ...rest }) => rest as SlayerActionLease),
      leadership: leadership
        ? {
            leaseId: leadership.leaseId,
            holderId: leadership.holderId,
            epoch: leadership.epoch,
            acquiredAt: leadership.acquiredAt,
            expiresAt: leadership.expiresAt,
          }
        : null,
    };
    return clone(snapshot);
  }

  async upsertIncident(
    incident: SlayerIncident,
    writer?: { holderId: string; epoch: number }
  ): Promise<boolean> {
    await this.ready;
    const document = clone({
      ...incident,
      ...(writer ? { persistenceEpoch: writer.epoch } : {}),
    });
    if (!writer) {
      await this.incidents.replaceOne(
        { incidentId: incident.incidentId },
        document,
        { upsert: true }
      );
      return true;
    }

    try {
      const result = await this.incidents.replaceOne(
        {
          incidentId: incident.incidentId,
          $or: [
            { persistenceEpoch: { $exists: false } },
            { persistenceEpoch: { $lte: writer.epoch } },
          ],
        },
        document,
        { upsert: true }
      );
      return result.matchedCount > 0 || result.upsertedCount > 0;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  async createIntentIfAbsent(intent: SlayerActionIntent): Promise<{ created: boolean; intent: SlayerActionIntent }> {
    await this.ready;
    try {
      await this.intents.insertOne(clone(intent));
      return { created: true, intent: clone(intent) };
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const existing = await this.intents.findOne({ dedupeKey: intent.dedupeKey });
      if (existing) {
        const { _id, ...rest } = existing;
        return { created: false, intent: clone(rest as SlayerActionIntent) };
      }
      throw error;
    }
  }

  async upsertReceipt(receipt: SlayerEnforcementReceipt): Promise<void> {
    await this.ready;
    await this.receipts.replaceOne({ receiptId: receipt.receiptId }, clone(receipt), { upsert: true });
  }

  async acquireLeadership(holderId: string, ttlMs: number): Promise<SlayerPrimeLeadershipLease | null> {
    await this.ready;
    const now = new Date();
    let result: MongoLeadershipDoc | null = null;
    try {
      result = await this.leadership.findOneAndUpdate(
        {
          _id: "singleton",
          $or: [
            { holderId },
            { holderId: "" },
            { expiresAt: { $lte: now.toISOString() } },
          ],
        },
      {
        $set: {
          leaseId: "slayleader_" + randomUUID().replace(/-/g, "").slice(0, 16),
          holderId,
          acquiredAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        },
        $inc: { epoch: 1 },
      },
        { upsert: true, returnDocument: "after" }
      ) as unknown as MongoLeadershipDoc | null;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return null;
      throw error;
    }
    if (!result) return null;
    return clone({
      leaseId: result.leaseId,
      holderId: result.holderId,
      epoch: result.epoch,
      acquiredAt: result.acquiredAt,
      expiresAt: result.expiresAt,
    });
  }

  async renewLeadership(lease: SlayerPrimeLeadershipLease, ttlMs: number): Promise<SlayerPrimeLeadershipLease | null> {
    await this.ready;
    const now = new Date();
    const result = await this.leadership.findOneAndUpdate(
      { _id: "singleton", leaseId: lease.leaseId, holderId: lease.holderId, epoch: lease.epoch },
      {
        $set: {
          expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        },
      },
      { returnDocument: "after" }
    );
    if (!result) return null;
    return clone({
      leaseId: result.leaseId,
      holderId: result.holderId,
      epoch: result.epoch,
      acquiredAt: result.acquiredAt,
      expiresAt: result.expiresAt,
    });
  }

  async releaseLeadership(lease: SlayerPrimeLeadershipLease): Promise<void> {
    await this.ready;
    await this.leadership.updateOne(
      {
        _id: "singleton",
        leaseId: lease.leaseId,
        holderId: lease.holderId,
        epoch: lease.epoch,
      },
      {
        $set: {
          holderId: "",
          expiresAt: new Date(0).toISOString(),
        },
      }
    );
  }

  async isLeadershipCurrent(holderId: string, epoch: number): Promise<boolean> {
    await this.ready;
    const now = new Date().toISOString();
    const current = await this.leadership.findOne(
      {
        _id: "singleton",
        holderId,
        expiresAt: { $gt: now },
      },
      {
        readPreference: "primary",
        readConcern: { level: "linearizable" },
        maxTimeMS: 2_000,
      }
    );
    return Boolean(current && current.epoch === epoch);
  }

  async acquireActionLease(
    intent: SlayerActionIntent,
    holderId: string,
    ttlMs: number,
    leadershipEpoch: number
  ): Promise<SlayerActionLease | null> {
    await this.ready;
    if (!(await this.isLeadershipCurrent(holderId, leadershipEpoch))) return null;

    const counter = await this.meta.findOneAndUpdate(
      { _id: "singleton" },
      { $inc: { nextFencingToken: 1 } },
      { upsert: true, returnDocument: "after" }
    );
    const fencingToken = Math.max(1, counter?.nextFencingToken || 1);

    const now = new Date();
    const candidate: SlayerActionLease = {
      actionLeaseId: "slaylease_" + randomUUID().replace(/-/g, "").slice(0, 16),
      intentId: intent.intentId,
      incidentId: intent.incidentId,
      action: intent.action,
      targetId: intent.targetId,
      holderId,
      fencingToken,
      leadershipEpoch,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      status: "ACTIVE",
    };

    const existing = await this.actionLeases.findOne({ intentId: intent.intentId });
    if (!existing) {
      try {
        await this.actionLeases.insertOne(clone(candidate));
        return clone(candidate);
      } catch {
        // Another instance won the insert. Fall through to the atomic eligibility check.
      }
    }

    const result = await this.actionLeases.updateOne(
      {
        intentId: intent.intentId,
        $or: [
          { status: { $ne: "ACTIVE" } },
          { expiresAt: { $lte: now.toISOString() } },
        ],
      },
      { $set: clone(candidate) }
    );
    if (result.modifiedCount === 0) return null;
    return clone(candidate);
  }

  async getActionLease(actionLeaseId: string): Promise<SlayerActionLease | null> {
    await this.ready;
    const doc = await this.actionLeases.findOne({ actionLeaseId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    const lease = rest as SlayerActionLease;
    if (lease.status === "ACTIVE" && new Date(lease.expiresAt).getTime() <= Date.now()) {
      await this.actionLeases.updateOne(
        { actionLeaseId, status: "ACTIVE", fencingToken: lease.fencingToken },
        { $set: { status: "EXPIRED" } }
      );
      return { ...lease, status: "EXPIRED" };
    }
    return clone(lease);
  }

  async releaseActionLease(actionLeaseId: string, holderId?: string, fencingToken?: number): Promise<void> {
    await this.ready;
    const filter: Record<string, unknown> = { actionLeaseId, status: "ACTIVE" };
    if (holderId) filter.holderId = holderId;
    if (fencingToken !== undefined) filter.fencingToken = fencingToken;
    await this.actionLeases.updateOne(filter, { $set: { status: "RELEASED" } });
  }

  async appendJournal(_entry: Omit<PersistedSlayerPrimeJournalEntry, "sequence">): Promise<void> {
    await this.ready;
    // Prime state is already transactionally represented by the entity collections.
    // The durable event ledger remains a separate runtime concern.
  }

  private async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.incidents.createIndex({ incidentId: 1 }, { unique: true }),
      this.intents.createIndex({ intentId: 1 }, { unique: true }),
      this.intents.createIndex({ dedupeKey: 1 }, { unique: true }),
      this.receipts.createIndex({ receiptId: 1 }, { unique: true }),
      this.actionLeases.createIndex({ actionLeaseId: 1 }, { unique: true }),
      this.actionLeases.createIndex({ intentId: 1 }, { unique: true }),
    ]);
  }
}
