import { DurableEventBus } from "../core/events/DurableEventBus";
import { MongoDBClient } from "../core/database/MongoDBClient";
import { KnowledgeStore } from "../core/intelligence/knowledge/KnowledgeStore";
import { MemoryWriter } from "../core/intelligence/writer/MemoryWriter";
import { MongoMemoryFabricLedger } from "../core/intelligence/memory/MongoMemoryFabricLedger";
import { MemoryFabricBridge } from "../core/intelligence/memory/MemoryFabricBridge";

const mongo = new MongoDBClient();
if (!(await mongo.connect())) {
  throw new Error("MEMORY_FABRIC_BACKFILL: MongoDB connection failed");
}

const db = mongo.getDb();
if (!db) throw new Error("MEMORY_FABRIC_BACKFILL: MongoDB database handle unavailable");

const vaultPath = process.env.MEMORY_FABRIC_VAULT_PATH || "knowledge";
const maxDocumentsPerCollection = Number(process.env.MEMORY_FABRIC_BACKFILL_LIMIT || 5000);

const store = new KnowledgeStore(vaultPath);
const writer = new MemoryWriter(store);
const ledger = new MongoMemoryFabricLedger(db);
const bus = new DurableEventBus();

const bridge = new MemoryFabricBridge(
  bus,
  store,
  writer,
  ledger,
  db,
  {
    enabled: true,
    vaultPath,
    reconciliationIntervalMs: 3600000,
  },
);

try {
  await bridge.start();
  const count = await bridge.backfillMongo(maxDocumentsPerCollection);
  console.log(JSON.stringify({
    status: "PASS",
    collectionsLimit: maxDocumentsPerCollection,
    ingested: count,
    vaultPath,
  }, null, 2));
} finally {
  await bridge.stop();
  await mongo.disconnect();
}
