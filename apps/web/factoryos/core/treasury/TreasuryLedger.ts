/**
 * ShortForge / FactoryOS — Treasurer Durable Ledger
 *
 * The store exposes one atomic transaction boundary. Production MongoDB uses a
 * real Mongo transaction; the in-memory implementation is deterministic test infrastructure.
 */

import type { Db, ClientSession, Collection } from "mongodb";
import type {
  TreasuryAccount,
  TreasuryLedgerEvent,
  TreasuryReservation,
  TreasuryMode,
} from "./TreasuryContracts";

export interface TreasuryLedgerTransaction {
  getAccount(accountId: string): Promise<TreasuryAccount | null>;
  putAccount(account: TreasuryAccount): Promise<void>;
  getReservation(reservationId: string): Promise<TreasuryReservation | null>;
  getReservationByCommandId(commandId: string): Promise<TreasuryReservation | null>;
  getReservationByIdempotencyKey(accountId: string, idempotencyKey: string): Promise<TreasuryReservation | null>;
  listActiveReservations(accountId?: string): Promise<TreasuryReservation[]>;
  putReservation(reservation: TreasuryReservation): Promise<void>;
  appendEvent(event: TreasuryLedgerEvent): Promise<void>;
}

export interface TreasuryLedgerStore {
  initialize(): Promise<void>;
  atomic<T>(work: (tx: TreasuryLedgerTransaction) => Promise<T>): Promise<T>;
  ensureAccount(account: TreasuryAccount): Promise<TreasuryAccount>;
  getAccount(accountId: string): Promise<TreasuryAccount | null>;
  listRecentEvents(accountId?: string, limit?: number): Promise<TreasuryLedgerEvent[]>;
  listActiveReservations(accountId?: string): Promise<TreasuryReservation[]>;
}

function stripId<T extends { _id?: unknown }>(doc: T): Omit<T, "_id"> {
  const { _id: _ignored, ...rest } = doc;
  return rest;
}

function hydrateTreasuryAccount(account: TreasuryAccount): TreasuryAccount {
  const fallbackTokenCapacity = Math.max(
    0,
    Number(process.env.FACTORYOS_TREASURY_TOKEN_CAPACITY_UNITS || "1000000"),
  );
  const tokenCapacityUnits = Number.isFinite(account.tokenCapacityUnits)
    ? Math.max(0, account.tokenCapacityUnits)
    : fallbackTokenCapacity;
  const reservedTokenCapacityUnits = Number.isFinite(
    account.reservedTokenCapacityUnits,
  )
    ? Math.max(0, account.reservedTokenCapacityUnits)
    : 0;
  const settledTokenCapacityUnits = Number.isFinite(
    account.settledTokenCapacityUnits,
  )
    ? Math.max(0, account.settledTokenCapacityUnits)
    : 0;
  const availableTokenCapacityUnits = Number.isFinite(
    account.availableTokenCapacityUnits,
  )
    ? Math.max(0, account.availableTokenCapacityUnits)
    : Math.max(
        0,
        tokenCapacityUnits -
          reservedTokenCapacityUnits -
          settledTokenCapacityUnits,
      );

  return {
    ...account,
    tokenCapacityUnits,
    availableTokenCapacityUnits,
    reservedTokenCapacityUnits,
    settledTokenCapacityUnits,
  };
}

export class MongoTreasuryLedger implements TreasuryLedgerStore {
  private readonly accounts: Collection<TreasuryAccount & { _id?: string }>;
  private readonly reservations: Collection<TreasuryReservation & { _id?: string }>;
  private readonly events: Collection<TreasuryLedgerEvent & { _id?: string }>;
  private readonly client: { withSession<T>(work: (session: ClientSession) => Promise<T>): Promise<T> } | null;

  constructor(
    private readonly db: Db,
    mongoClient?: { withSession<T>(work: (session: ClientSession) => Promise<T>): Promise<T> } | null,
  ) {
    this.accounts = db.collection("treasury_accounts");
    this.reservations = db.collection("treasury_reservations");
    this.events = db.collection("treasury_ledger_events");
    this.client = mongoClient ?? null;
  }

  async initialize(): Promise<void> {
    await this.accounts.createIndex({ accountId: 1 }, { unique: true });
    await this.reservations.createIndex({ reservationId: 1 }, { unique: true });
    await this.reservations.createIndex({ commandId: 1 }, { unique: true });
    await this.reservations.createIndex({ accountId: 1, idempotencyKey: 1 }, { unique: true });
    await this.reservations.createIndex({ accountId: 1, status: 1, expiresAt: 1 });
    await this.events.createIndex({ eventId: 1 }, { unique: true });
    await this.events.createIndex({ accountId: 1, occurredAt: -1, eventId: -1 });
    await this.events.createIndex({ commandId: 1, occurredAt: -1 });
  }

  async atomic<T>(work: (tx: TreasuryLedgerTransaction) => Promise<T>): Promise<T> {
    if (!this.client) {
      throw new Error("MongoTreasuryLedger requires a MongoClient for atomic production transactions");
    }

    return this.client.withSession(async (session) =>
      session.withTransaction(async () => work(this.transaction(session)), {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }),
    );
  }

  private transaction(session: ClientSession): TreasuryLedgerTransaction {
    return {
      getAccount: async (accountId) => {
        const doc = await this.accounts.findOne({ accountId }, { session });
        return doc ? hydrateTreasuryAccount(stripId(doc) as TreasuryAccount) : null;
      },
      putAccount: async (account) => {
        await this.accounts.replaceOne({ accountId: account.accountId }, structuredClone(account), { upsert: true, session });
      },
      getReservation: async (reservationId) => {
        const doc = await this.reservations.findOne({ reservationId }, { session });
        return doc ? (stripId(doc) as TreasuryReservation) : null;
      },
      getReservationByCommandId: async (commandId) => {
        const doc = await this.reservations.findOne({ commandId }, { session });
        return doc ? (stripId(doc) as TreasuryReservation) : null;
      },
      getReservationByIdempotencyKey: async (accountId, idempotencyKey) => {
        const doc = await this.reservations.findOne({ accountId, idempotencyKey }, { session });
        return doc ? (stripId(doc) as TreasuryReservation) : null;
      },
      listActiveReservations: async (accountId) => {
        const query = accountId ? { accountId, status: "ACTIVE" as const } : { status: "ACTIVE" as const };
        const docs = await this.reservations.find(query, { session }).toArray();
        return docs.map((doc) => stripId(doc) as TreasuryReservation);
      },
      putReservation: async (reservation) => {
        await this.reservations.replaceOne(
          { reservationId: reservation.reservationId },
          structuredClone(reservation),
          { upsert: true, session },
        );
      },
      appendEvent: async (event) => {
        await this.events.insertOne(structuredClone(event), { session });
      },
    };
  }

  async ensureAccount(account: TreasuryAccount): Promise<TreasuryAccount> {
    return this.atomic(async (tx) => {
      const existing = await tx.getAccount(account.accountId);
      if (existing) return existing;
      const hydrated = hydrateTreasuryAccount(account);
      await tx.putAccount(hydrated);
      return hydrated;
    });
  }

  async getAccount(accountId: string): Promise<TreasuryAccount | null> {
    const doc = await this.accounts.findOne({ accountId });
    return doc
      ? hydrateTreasuryAccount(stripId(doc) as TreasuryAccount)
      : null;
  }

  async listRecentEvents(accountId?: string, limit = 50): Promise<TreasuryLedgerEvent[]> {
    const docs = await this.events
      .find(accountId ? { accountId } : {})
      .sort({ occurredAt: -1, eventId: -1 })
      .limit(limit)
      .toArray();
    return docs.map((doc) => stripId(doc) as TreasuryLedgerEvent);
  }

  async listActiveReservations(accountId?: string): Promise<TreasuryReservation[]> {
    const docs = await this.reservations
      .find(accountId ? { accountId, status: "ACTIVE" } : { status: "ACTIVE" })
      .sort({ expiresAt: 1 })
      .toArray();
    return docs.map((doc) => stripId(doc) as TreasuryReservation);
  }
}

export class InMemoryTreasuryLedger implements TreasuryLedgerStore {
  private readonly accounts = new Map<string, TreasuryAccount>();
  private readonly reservations = new Map<string, TreasuryReservation>();
  private readonly events = new Map<string, TreasuryLedgerEvent>();
  private lock: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {}

  seedAccount(account: TreasuryAccount): void {
    this.accounts.set(account.accountId, structuredClone(account));
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  async atomic<T>(work: (tx: TreasuryLedgerTransaction) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const accounts = new Map(this.accounts);
      const reservations = new Map(this.reservations);
      const events = new Map(this.events);

      const tx: TreasuryLedgerTransaction = {
        getAccount: async (accountId) => {
          const account = accounts.get(accountId);
          return account ? hydrateTreasuryAccount(structuredClone(account)) : null;
        },
        putAccount: async (account) => {
          accounts.set(account.accountId, structuredClone(account));
        },
        getReservation: async (reservationId) => {
          const reservation = reservations.get(reservationId);
          return reservation ? structuredClone(reservation) : null;
        },
        getReservationByCommandId: async (commandId) => {
          const reservation = [...reservations.values()].find((candidate) => candidate.commandId === commandId);
          return reservation ? structuredClone(reservation) : null;
        },
        getReservationByIdempotencyKey: async (accountId, idempotencyKey) => {
          const reservation = [...reservations.values()].find(
            (candidate) => candidate.accountId === accountId && candidate.idempotencyKey === idempotencyKey,
          );
          return reservation ? structuredClone(reservation) : null;
        },
        listActiveReservations: async (accountId) =>
          [...reservations.values()]
            .filter((reservation) => reservation.status === "ACTIVE" && (!accountId || reservation.accountId === accountId))
            .map((reservation) => structuredClone(reservation)),
        putReservation: async (reservation) => {
          reservations.set(reservation.reservationId, structuredClone(reservation));
        },
        appendEvent: async (event) => {
          if (events.has(event.eventId)) {
            throw new Error(`Duplicate Treasury event ${event.eventId}`);
          }
          events.set(event.eventId, structuredClone(event));
        },
      };

      const result = await work(tx);
      this.accounts.clear(); for (const [key, value] of accounts) this.accounts.set(key, value);
      this.reservations.clear(); for (const [key, value] of reservations) this.reservations.set(key, value);
      this.events.clear(); for (const [key, value] of events) this.events.set(key, value);
      return result;
    });
  }

  async ensureAccount(account: TreasuryAccount): Promise<TreasuryAccount> {
    return this.atomic(async (tx) => {
      const existing = await tx.getAccount(account.accountId);
      if (existing) return existing;
      const hydrated = hydrateTreasuryAccount(account);
      await tx.putAccount(hydrated);
      return hydrated;
    });
  }

  async getAccount(accountId: string): Promise<TreasuryAccount | null> {
    const account = this.accounts.get(accountId);
    return account ? hydrateTreasuryAccount(structuredClone(account)) : null;
  }

  async listRecentEvents(accountId?: string, limit = 50): Promise<TreasuryLedgerEvent[]> {
    return [...this.events.values()]
      .filter((event) => !accountId || event.accountId === accountId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.eventId.localeCompare(a.eventId))
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }

  async listActiveReservations(accountId?: string): Promise<TreasuryReservation[]> {
    return [...this.reservations.values()]
      .filter((reservation) => reservation.status === "ACTIVE" && (!accountId || reservation.accountId === accountId))
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
      .map((reservation) => structuredClone(reservation));
  }
}

export function createTreasuryAccount(
  accountId: string,
  budgetUsd: number,
  capacityUnits: number,
  mode: TreasuryMode = "OPEN",
  now = new Date(),
  tokenCapacityUnits = 1_000_000,
): TreasuryAccount {
  if (!accountId) throw new Error("Treasury accountId is required");
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0) throw new Error("Treasury budgetUsd must be >= 0");
  if (!Number.isFinite(capacityUnits) || capacityUnits < 0) {
    throw new Error("Treasury capacityUnits must be >= 0");
  }
  if (!Number.isFinite(tokenCapacityUnits) || tokenCapacityUnits < 0) {
    throw new Error("Treasury tokenCapacityUnits must be >= 0");
  }
  return {
    accountId,
    currency: "USD",
    budgetUsd,
    availableUsd: budgetUsd,
    reservedUsd: 0,
    settledUsd: 0,
    capacityUnits,
    availableCapacityUnits: capacityUnits,
    reservedCapacityUnits: 0,
    settledCapacityUnits: 0,
    tokenCapacityUnits,
    availableTokenCapacityUnits: tokenCapacityUnits,
    reservedTokenCapacityUnits: 0,
    settledTokenCapacityUnits: 0,
    mode,
    version: 1,
    updatedAt: now.toISOString(),
  };
}
