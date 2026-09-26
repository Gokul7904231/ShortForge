import { createHash } from "node:crypto";
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

/**
 * Control-plane durability boundary for canonical F03 handoffs.
 *
 * The Python JSON memory store is a local idempotency/cache mechanism only.
 * This store is the distributed operational record consumed by FactoryOS.
 */
export class Floor03DurableHandoffStore {
  async get(requestId: string): Promise<Floor03DurableRecord | null> {
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

    const ref = db.collection("factoryos_floor03_handoffs").doc(documentId(record.requestId));
    const existing = await ref.get();

    if (existing.exists) {
      const current = existing.data() as Floor03DurableRecord;
      if (
        current.planFingerprint !== record.planFingerprint ||
        current.assetPlanId !== record.assetPlanId ||
        current.assetPlanVersion !== record.assetPlanVersion
      ) {
        throw new Error(
          "[Floor03DurableHandoffStore] immutable requestId conflict for canonical F03 handoff"
        );
      }
      return;
    }

    await ref.create(record);
  }
}
