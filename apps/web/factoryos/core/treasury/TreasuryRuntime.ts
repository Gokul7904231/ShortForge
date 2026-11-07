/**
 * Server runtime accessor for the canonical Treasury.
 *
 * Production callers get a Mongo-backed Treasury directly when configured,
 * with resilient in-memory fallback for cloud environments without dedicated MongoDB instances.
 */
import { MongoDBClient } from "../database/MongoDBClient";
import { createMongoTreasuryService } from "./TreasuryFactory";
import type { TreasuryService } from "./TreasuryService";
import { InMemoryTreasuryLedger } from "./TreasuryLedger";
import { TreasuryKernel } from "./TreasuryKernel";
import { TreasuryPriceRegistry } from "./TreasuryPriceRegistry";
import { TreasuryService as TreasuryServiceImpl } from "./TreasuryService";

declare global {
  // eslint-disable-next-line no-var
  var __shortforgeTreasuryRuntime:
    | { mongo?: MongoDBClient | null; service: TreasuryService }
    | undefined;
}

export async function getTreasuryRuntime(): Promise<TreasuryService> {
  if (globalThis.__shortforgeTreasuryRuntime?.mongo?.connected()) {
    return globalThis.__shortforgeTreasuryRuntime.service;
  }

  const mongoUri = process.env.FACTORYOS_MONGO_URI || process.env.MONGODB_URI;

  if (mongoUri) {
    const mongo = new MongoDBClient(
      mongoUri,
      process.env.FACTORYOS_MONGO_DB_NAME || "factoryos",
    );

    const connected = await mongo.connect();
    if (connected) {
      const service = createMongoTreasuryService(mongo);
      await service.initialize();
      globalThis.__shortforgeTreasuryRuntime = { mongo, service };
      return service;
    }
  }

  // Graceful resilient fallback for cloud web environments (Render, Cloudflare, Vercel)
  // where MongoDB may not be bound or locally hosted:
  if (!globalThis.__shortforgeTreasuryRuntime?.service) {
    const ledger = new InMemoryTreasuryLedger();
    const service = new TreasuryServiceImpl(
      new TreasuryKernel(ledger, new TreasuryPriceRegistry()),
    );
    await service.initialize();
    globalThis.__shortforgeTreasuryRuntime = { mongo: null, service };
  }
  return globalThis.__shortforgeTreasuryRuntime.service;
}
