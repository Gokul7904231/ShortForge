import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../../../lib/firebase-admin";

export interface Floor03DurableRecord {
  requestId: string;
  floorId: "floor03_asset_realization";
  floorVersion: string;
  assetPlanId: string;
  assetPlanVersion: number;
  planFingerprint: string;
  sourceFingerprint: string;
  handoff: Record<string, any>;
  executionReport: Record<string, any>;
  persistedAt: string;
}

function documentId(requestId: string): string {
  return createHash("sha256").update(requestId).digest("hex").slice(0, 48);
}

function useLocalStore(): boolean {
  return (process.env.FACTORYOS_F03_HANDOFF_STORE || "FIRESTORE").toUpperCase() === "LOCAL";
}

function localStorePath(): string {
  return (
    process.env.FLOOR03_HANDOFF_STORE_PATH ||
    path.join(process.cwd(), "data", "factoryos-floor03-handoffs.json")
  );
}

function readLocalStore(): Record<string, Floor03DurableRecord> {
  const filePath = localStorePath();
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw) as Record<string, Floor03DurableRecord>;
  } catch (error) {
    throw new Error(
      `[Floor03DurableHandoffStore] local store is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function writeLocalStore(store: Record<string, Floor03DurableRecord>): void {
  const filePath = localStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp_${process.pid}_${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

/**
 * Control-plane durability boundary for canonical F03 handoffs.
 *
 * Production default: Firestore is the distributed operational record.
 * Deterministic trajectory proof: FACTORYOS_F03_HANDOFF_STORE=LOCAL selects an
 * explicit disk-backed durable adapter so CI does not silently depend on
 * unconfigured external credentials. This does not replace floor execution,
 * rendering, or verification; it only makes the persistence dependency explicit.
 */
export class Floor03DurableHandoffStore {
  async get(requestId: string): Promise<Floor03DurableRecord | null> {
    if (useLocalStore()) {
      return readLocalStore()[documentId(requestId)] || null;
    }

    const snapshot = await db.collection("factoryos_floor03_handoffs").doc(documentId(requestId)).get();
    if (!snapshot.exists) return null;
    return snapshot.data() as Floor03DurableRecord;
  }

  async put(record: Floor03DurableRecord): Promise<void> {
    if (record.requestId.trim() === "") {
      throw new Error("[Floor03DurableHandoffStore] requestId is required");
    }
    if (record.floorId !== "floor03_asset_realization") {
      throw new Error("[Floor03DurableHandoffStore] refusing foreign floor record");
    }
    if (!record.planFingerprint || !record.sourceFingerprint) {
      throw new Error("[Floor03DurableHandoffStore] refusing un-fingerprinted F03 handoff");
    }

    const key = documentId(record.requestId);

    if (useLocalStore()) {
      const store = readLocalStore();
      const existing = store[key];

      if (existing) {
        if (
          existing.planFingerprint !== record.planFingerprint ||
          existing.assetPlanId !== record.assetPlanId ||
          existing.assetPlanVersion !== record.assetPlanVersion
        ) {
          throw new Error(
            "[Floor03DurableHandoffStore] immutable requestId conflict for canonical F03 handoff",
          );
        }
        return;
      }

      store[key] = record;
      writeLocalStore(store);
      return;
    }

    const ref = db.collection("factoryos_floor03_handoffs").doc(key);
    const existing = await ref.get();

    if (existing.exists) {
      const current = existing.data() as Floor03DurableRecord;
      if (
        current.planFingerprint !== record.planFingerprint ||
        current.assetPlanId !== record.assetPlanId ||
        current.assetPlanVersion !== record.assetPlanVersion
      ) {
        throw new Error(
          "[Floor03DurableHandoffStore] immutable requestId conflict for canonical F03 handoff",
        );
      }
      return;
    }

    await ref.create(record);
  }
}
