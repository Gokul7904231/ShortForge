/**
 * FactoryOS v3 — KnowledgeOS Engine
 * Authoritative implementation of domain-isolated typed knowledge stores,
 * cross-mission boundary isolation, and controlled long-term memory promotion.
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  KnowledgeObject,
  StoredSource,
  StoredClaim,
  StoredEvidence,
  ChannelProfileMemory,
  TopicIntelligenceMemory,
  PerformanceAttributionMemory,
  KnowledgeOSSnapshot,
  KnowledgeOSSnapshotDiff,
  KnowledgeOSSnapshotScope,
  KnowledgeRelationship,
} from "./KnowledgeOSContracts";


function canonicalizeKnowledgeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeKnowledgeValue(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const entries = Object.keys(objectValue)
      .filter((key) => objectValue[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeKnowledgeValue(objectValue[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}


function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type KnowledgeOSSnapshotContent = Pick<
  KnowledgeOSSnapshot,
  "selection" | "records" | "relationships"
>;

/** Recompute the content address from the canonical selection, records, and edges. */
export function calculateKnowledgeOSSnapshotContentDigest(content: KnowledgeOSSnapshotContent): string {
  const canonicalContent = canonicalizeKnowledgeValue({
    selection: content.selection,
    records: content.records,
    relationships: content.relationships,
  });
  return createHash("sha256").update(canonicalContent, "utf8").digest("hex");
}

/**
 * Validate stored snapshots before use. This checks shape and content integrity,
 * not epistemic truth or authenticity of the storage administrator.
 */
export function validateKnowledgeOSSnapshot(value: unknown): value is KnowledgeOSSnapshot {
  if (!isPlainRecord(value)) return false;
  if (value.schemaVersion !== "knowledgeos.snapshot.v1") return false;
  if (typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt))) return false;
  if (typeof value.contentDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.contentDigest)) return false;
  if (!Array.isArray(value.records) || !Array.isArray(value.relationships)) return false;

  const selection = value.selection;
  if (!isPlainRecord(selection)) return false;
  if (selection.scope === "MISSION") {
    if (typeof selection.missionId !== "string" || !selection.missionId.trim()) return false;
  } else if (selection.scope === "CHANNEL") {
    if (typeof selection.channelId !== "string" || !selection.channelId.trim()) return false;
  } else if (selection.scope !== "GLOBAL") {
    return false;
  }

  if (!value.records.every((record) =>
    isPlainRecord(record) && typeof record.id === "string" && typeof record.scope === "string",
  )) return false;
  if (!value.relationships.every((edge) =>
    isPlainRecord(edge) &&
    typeof edge.relationshipId === "string" &&
    typeof edge.relationType === "string" &&
    typeof edge.fromId === "string" &&
    typeof edge.provenanceDigest === "string",
  )) return false;

  const content = {
    selection: selection as unknown as KnowledgeOSSnapshotScope,
    records: value.records as KnowledgeObject[],
    relationships: value.relationships as KnowledgeRelationship[],
  };
  return calculateKnowledgeOSSnapshotContentDigest(content) === value.contentDigest;
}

export class KnowledgeOS {
  private sources: Map<string, StoredSource> = new Map();
  private claims: Map<string, StoredClaim> = new Map();
  private evidence: Map<string, StoredEvidence> = new Map();
  private topics: Map<string, TopicIntelligenceMemory> = new Map();
  private channels: Map<string, ChannelProfileMemory> = new Map();
  private performance: Map<string, PerformanceAttributionMemory> = new Map();

  // 1. Source Store
  public storeSource(source: Omit<StoredSource, "id" | "type" | "schemaVersion" | "createdAt" | "updatedAt" | "provenanceDigest">): StoredSource {
    const id = `src_${randomUUID().substring(0, 8)}`;
    const now = new Date().toISOString();
    const digest = createHash("sha256").update(source.url + source.snippet, "utf8").digest("hex");

    const record: StoredSource = {
      ...source,
      id,
      type: "SOURCE",
      schemaVersion: "1.0.0",
      createdAt: now,
      updatedAt: now,
      provenanceDigest: digest,
    };

    this.sources.set(id, record);
    return record;
  }

  public getSource(id: string): StoredSource | undefined {
    return this.sources.get(id);
  }

  // 2. Claim Store
  public storeClaim(claim: Omit<StoredClaim, "id" | "type" | "schemaVersion" | "createdAt" | "updatedAt" | "provenanceDigest">): StoredClaim {
    const id = `clm_${randomUUID().substring(0, 8)}`;
    const now = new Date().toISOString();
    const digest = createHash("sha256").update(claim.statement, "utf8").digest("hex");

    const record: StoredClaim = {
      ...claim,
      id,
      type: "CLAIM",
      schemaVersion: "1.0.0",
      createdAt: now,
      updatedAt: now,
      provenanceDigest: digest,
    };

    this.claims.set(id, record);
    return record;
  }

  public getClaimsForMission(missionId: string): StoredClaim[] {
    return Array.from(this.claims.values()).filter((c) => c.missionId === missionId);
  }

  // 3. Evidence Store
  public storeEvidence(evidence: Omit<StoredEvidence, "id" | "type" | "schemaVersion" | "createdAt" | "updatedAt" | "provenanceDigest">): StoredEvidence {
    const id = `ev_${randomUUID().substring(0, 8)}`;
    const now = new Date().toISOString();
    const digest = createHash("sha256").update(evidence.targetRef + evidence.sha256, "utf8").digest("hex");

    const record: StoredEvidence = {
      ...evidence,
      id,
      type: "EVIDENCE",
      schemaVersion: "1.0.0",
      createdAt: now,
      updatedAt: now,
      provenanceDigest: digest,
    };

    this.evidence.set(id, record);
    return record;
  }

  public getEvidence(id: string): StoredEvidence | undefined {
    return this.evidence.get(id);
  }

  // 4. Topic Memory
  public updateTopicSaturation(topic: string, saturationLevel: number, passportId?: string): TopicIntelligenceMemory {
    const normalized = topic.trim().toLowerCase();
    const existing = this.topics.get(normalized);
    const now = new Date().toISOString();
    const id = existing?.id || `topic_${randomUUID().substring(0, 8)}`;
    const passportIds = existing ? [...existing.associatedPassportIds] : [];
    if (passportId && !passportIds.includes(passportId)) {
      passportIds.push(passportId);
    }

    const digest = createHash("sha256").update(`${normalized}:${saturationLevel}`, "utf8").digest("hex");

    const record: TopicIntelligenceMemory = {
      id,
      type: "TOPIC_MEMORY",
      schemaVersion: "1.0.0",
      topic: normalized,
      lastResearchedAt: now,
      saturationLevel,
      associatedPassportIds: passportIds,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      provenanceDigest: digest,
      scope: "GLOBAL",
    };

    this.topics.set(normalized, record);
    return record;
  }

  public getTopicMemory(topic: string): TopicIntelligenceMemory | undefined {
    return this.topics.get(topic.trim().toLowerCase());
  }

  // 5. Channel Profile Memory
  public setChannelMemory(memory: Omit<ChannelProfileMemory, "id" | "type" | "schemaVersion" | "createdAt" | "updatedAt" | "provenanceDigest">): ChannelProfileMemory {
    const now = new Date().toISOString();
    const id = `chan_${memory.channelId}`;
    const digest = createHash("sha256").update(memory.channelId + JSON.stringify(memory.dominantNiches), "utf8").digest("hex");

    const record: ChannelProfileMemory = {
      ...memory,
      id,
      type: "CHANNEL_MEMORY",
      schemaVersion: "1.0.0",
      createdAt: now,
      updatedAt: now,
      provenanceDigest: digest,
      scope: "CHANNEL",
    };

    this.channels.set(memory.channelId, record);
    return record;
  }

  public getChannelMemory(channelId: string): ChannelProfileMemory | undefined {
    return this.channels.get(channelId);
  }

  
  /**
   * Returns a read-only, deterministically ordered projection of canonical stores.
   * This is a snapshot boundary, not durable persistence or a second source of truth.
   */
  public snapshot(selection: KnowledgeOSSnapshotScope): KnowledgeOSSnapshot {
    if (selection.scope === "MISSION" && !selection.missionId.trim()) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_MISSION_ID_REQUIRED");
    }
    if (selection.scope === "CHANNEL" && !selection.channelId.trim()) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_CHANNEL_ID_REQUIRED");
    }

    const isInScope = (record: KnowledgeObject): boolean => {
      if (selection.scope === "GLOBAL") return record.scope === "GLOBAL";
      if (selection.scope === "MISSION") {
        return record.scope === "MISSION" && record.missionId === selection.missionId;
      }
      return record.scope === "CHANNEL" &&
        "channelId" in record &&
        (record as ChannelProfileMemory).channelId === selection.channelId;
    };

    const sources = [...this.sources.values()].filter(isInScope);
    const claims = [...this.claims.values()].filter(isInScope);
    const evidence = [...this.evidence.values()].filter(isInScope);
    const topics = [...this.topics.values()].filter(isInScope);
    const channels = [...this.channels.values()].filter(isInScope);
    const performance = [...this.performance.values()].filter(isInScope);
    const records: KnowledgeObject[] = [
      ...sources,
      ...claims,
      ...evidence,
      ...topics,
      ...channels,
      ...performance,
    ]
      .map((record) => JSON.parse(JSON.stringify(record)) as KnowledgeObject)
      .sort((left, right) => left.id.localeCompare(right.id));
    const recordIds = new Set(records.map((record) => record.id));
    const relationships: KnowledgeRelationship[] = [];

    for (const claim of claims) {
      for (const sourceId of claim.sourceIds) {
        relationships.push({
          relationshipId: `CLAIM_CITES_SOURCE:${claim.id}:${sourceId}`,
          relationType: "CLAIM_CITES_SOURCE",
          fromId: claim.id,
          toId: sourceId,
          // A record outside this snapshot's scope is deliberately unresolved.
          resolved: recordIds.has(sourceId),
          provenanceDigest: createHash("sha256")
            .update(`${claim.provenanceDigest}:${sourceId}`, "utf8")
            .digest("hex"),
        });
      }
    }

    for (const item of evidence) {
      relationships.push({
        relationshipId: `EVIDENCE_ATTESTS_REFERENCE:${item.id}:${item.targetRef}`,
        relationType: "EVIDENCE_ATTESTS_REFERENCE",
        fromId: item.id,
        targetRef: item.targetRef,
        // External references are retained, but not dereferenced by KnowledgeOS.
        resolved: false,
        provenanceDigest: createHash("sha256")
          .update(`${item.provenanceDigest}:${item.targetRef}:${item.sha256}`, "utf8")
          .digest("hex"),
      });
    }

    relationships.sort((left, right) => left.relationshipId.localeCompare(right.relationshipId));
    const contentDigest = calculateKnowledgeOSSnapshotContentDigest({ selection, records, relationships });

    return {
      schemaVersion: "knowledgeos.snapshot.v1",
      selection: JSON.parse(JSON.stringify(selection)) as KnowledgeOSSnapshotScope,
      capturedAt: new Date().toISOString(),
      records,
      relationships,
      contentDigest,
    };
  }


  /** Compare two snapshots without mutating either snapshot or KnowledgeOS state. */
  public static diffSnapshots(
    previous: KnowledgeOSSnapshot,
    current: KnowledgeOSSnapshot,
  ): KnowledgeOSSnapshotDiff {
    if (canonicalizeKnowledgeValue(previous.selection) !== canonicalizeKnowledgeValue(current.selection)) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_SCOPE_MISMATCH");
    }
    const previousRecords = new Map<string, KnowledgeObject>(previous.records.map((record) => [record.id, record] as const));
    const currentRecords = new Map<string, KnowledgeObject>(current.records.map((record) => [record.id, record] as const));
    const previousRelationships = new Map<string, KnowledgeRelationship>(
      previous.relationships.map((edge) => [edge.relationshipId, edge] as const),
    );
    const currentRelationships = new Map<string, KnowledgeRelationship>(
      current.relationships.map((edge) => [edge.relationshipId, edge] as const),
    );

    const addedRecordIds = [...currentRecords.keys()].filter((id) => !previousRecords.has(id)).sort();
    const removedRecordIds = [...previousRecords.keys()].filter((id) => !currentRecords.has(id)).sort();
    const changedRecordIds = [...currentRecords.keys()]
      .filter((id) => {
        const before = previousRecords.get(id);
        const after = currentRecords.get(id);
        return before !== undefined && after !== undefined &&
          canonicalizeKnowledgeValue(before) !== canonicalizeKnowledgeValue(after);
      })
      .sort();
    const addedRelationshipIds = [...currentRelationships.keys()]
      .filter((id) => !previousRelationships.has(id)).sort();
    const removedRelationshipIds = [...previousRelationships.keys()]
      .filter((id) => !currentRelationships.has(id)).sort();

    return {
      schemaVersion: "knowledgeos.snapshot-diff.v1",
      baseDigest: previous.contentDigest,
      targetDigest: current.contentDigest,
      addedRecordIds,
      removedRecordIds,
      changedRecordIds,
      addedRelationshipIds,
      removedRelationshipIds,
    };
  }

  // 6. Memory Promotion Gate: only promoted when verified
  public promoteToLongTermMemory(item: KnowledgeObject): boolean {
    if (!item.provenanceDigest) {
      return false; // Rejection: cannot promote unprovenanced objects
    }
    // Set scope to GLOBAL or CHANNEL
    (item as any).scope = item.scope === "MISSION" ? "GLOBAL" : item.scope;
    (item as any).updatedAt = new Date().toISOString();
    return true;
  }
}
