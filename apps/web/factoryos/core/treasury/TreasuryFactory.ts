/**
 * ShortForge / FactoryOS — Mongo-backed Treasurer factory
 *
 * Production callers must supply the already-connected MongoDBClient.
 * There is intentionally no implicit in-memory fallback in this factory.
 */

import { MongoDBClient } from "../database/MongoDBClient";
import type { TreasuryPolicy } from "./TreasuryContracts";
import { TreasuryKernel } from "./TreasuryKernel";
import { MongoTreasuryLedger } from "./TreasuryLedger";
import { TreasuryPriceRegistry } from "./TreasuryPriceRegistry";
import { TreasuryService } from "./TreasuryService";

export function createMongoTreasuryService(
  mongo: MongoDBClient,
  policy?: TreasuryPolicy,
  priceRegistry = new TreasuryPriceRegistry(),
): TreasuryService {
  const db = mongo.getDb();
  const client = mongo.getClient();

  if (!db || !client || !mongo.connected()) {
    throw new Error("Treasury requires a connected MongoDBClient with transaction-capable MongoDB");
  }

  const ledger = new MongoTreasuryLedger(db, client);
  const kernel = new TreasuryKernel(ledger, priceRegistry, policy);
  return new TreasuryService(kernel);
}
