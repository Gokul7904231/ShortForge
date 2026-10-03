/**
 * Server runtime accessor for the canonical Treasury.
 *
 * Production callers get a Mongo-backed Treasury directly, so callbacks and
 * stateless route handlers do not depend on a controller process-local singleton.
 */
import { MongoDBClient } from "../database/MongoDBClient";
import { createMongoTreasuryService } from "./TreasuryFactory";
import type { TreasuryService } from "./TreasuryService";

declare global {
  // eslint-disable-next-line no-var
  var __shortforgeTreasuryRuntime:
    | { mongo: MongoDBClient; service: TreasuryService }
    | undefined;
}

export async function getTreasuryRuntime(): Promise<TreasuryService> {
  if (globalThis.__shortforgeTreasuryRuntime?.mongo.connected()) {
    return globalThis.__shortforgeTreasuryRuntime.service;
  }

  const production = process.env.NODE_ENV === "production";
  const mongo = new MongoDBClient(
    process.env.FACTORYOS_MONGO_URI ||
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017",
    process.env.FACTORYOS_MONGO_DB_NAME || "factoryos",
  );

  const connected = await mongo.connect();
  if (!connected) {
    if (production) {
      throw new Error(
        "Treasury runtime requires transaction-capable MongoDB in production",
      );
    }
    throw new Error("Treasury runtime MongoDB is unavailable");
  }

  const service = createMongoTreasuryService(mongo);
  await service.initialize();
  globalThis.__shortforgeTreasuryRuntime = { mongo, service };
  return service;
}
