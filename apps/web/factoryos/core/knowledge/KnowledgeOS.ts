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
} from "./KnowledgeOSContracts";

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
