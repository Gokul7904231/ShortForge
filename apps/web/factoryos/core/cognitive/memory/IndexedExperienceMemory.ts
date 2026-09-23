/**
 * FactoryOS Frontier v2 — Indexed Experience Memory
 * Combines compact working memory, stable IDs, relationship linking, and full-fidelity storage.
 * Enhanced for Project Ascalon with training eligibility tracking, provenance metadata,
 * and integration with ExperienceRetriever.
 */

import { randomUUID } from "node:crypto";
import type { IMemoryRepository, MemoryRecord } from "../../database/DatabaseContracts";
import { InMemoryMemoryRepository } from "../../database/InMemoryDatabase";
import {
  ExperienceRetriever,
  KeywordExperienceRetriever,
  MemoryTrainingEligibility,
  RetrievedExperience,
} from "./ExperienceRetriever";

export interface ExperienceMemoryEntry {
  readonly memoryId: string;
  readonly category: "ANOMALY_RESOLUTION" | "REPAIR_RECIPE" | "FLOOR_PERFORMANCE" | "AGENT_COLLABORATION";
  readonly title: string;
  readonly summary: string;
  readonly fullEvidence: Record<string, unknown>;
  readonly relatedMemoryIds: string[];
  readonly floorId?: string;
  readonly confidence: number;
  readonly successRate: number;
  readonly usageCount: number;
  readonly createdAt: string;
  lastAccessedAt: string;
  readonly experienceType?: "REAL_OPERATIONAL" | "SIMULATION" | "HEURISTIC" | "SYNTHETIC" | "REPLAY";
  readonly trainingEligibility?: MemoryTrainingEligibility;
  readonly verificationStatus?: "VERIFIED" | "UNVERIFIED" | "FAILED";
  readonly outcomeStatus?: "SUCCESS" | "FAILED" | "UNKNOWN";
  readonly authority?: "AUTHORITATIVE" | "HEURISTIC" | "UNVERIFIED";
}

export class IndexedExperienceMemory {
  private workingIndex: Map<string, ExperienceMemoryEntry> = new Map();
  private repository: IMemoryRepository;

  constructor(repository: IMemoryRepository = new InMemoryMemoryRepository()) {
    this.repository = repository;
  }

  async storeExperience(entry: {
    category: ExperienceMemoryEntry["category"];
    title: string;
    summary: string;
    fullEvidence: Record<string, unknown>;
    relatedMemoryIds?: string[];
    floorId?: string;
    confidence?: number;
    experienceType?: ExperienceMemoryEntry["experienceType"];
    trainingEligibility?: MemoryTrainingEligibility;
    verificationStatus?: ExperienceMemoryEntry["verificationStatus"];
    outcomeStatus?: ExperienceMemoryEntry["outcomeStatus"];
    authority?: ExperienceMemoryEntry["authority"];
  }): Promise<ExperienceMemoryEntry> {
    const memoryId = `mem_exp_${randomUUID().replace(/-/g, "").substring(0, 10)}`;
    const now = new Date().toISOString();

    const experienceType = entry.experienceType ?? "REAL_OPERATIONAL";
    const verificationStatus = entry.verificationStatus ?? "UNVERIFIED";
    // Unverified, simulated, or heuristic experiences are INELIGIBLE for golden training by default
    const isEligible = experienceType === "REAL_OPERATIONAL" && verificationStatus === "VERIFIED";
    const trainingEligibility: MemoryTrainingEligibility =
      entry.trainingEligibility ?? (isEligible ? "ELIGIBLE" : "INELIGIBLE");

    const experience: ExperienceMemoryEntry = {
      memoryId,
      category: entry.category,
      title: entry.title,
      summary: entry.summary,
      fullEvidence: structuredClone(entry.fullEvidence),
      relatedMemoryIds: entry.relatedMemoryIds ? [...entry.relatedMemoryIds] : [],
      floorId: entry.floorId,
      confidence: entry.confidence ?? 0.5, // Default uncalibrated baseline (not fake 0.95)
      successRate: 1.0,
      usageCount: 1,
      createdAt: now,
      lastAccessedAt: now,
      experienceType,
      trainingEligibility,
      verificationStatus,
      outcomeStatus: entry.outcomeStatus ?? "UNKNOWN",
      authority: entry.authority ?? "UNVERIFIED",
    };

    this.workingIndex.set(memoryId, structuredClone(experience));

    // Save into persistent memory repository
    const record: MemoryRecord = {
      memoryId,
      layer: "CASE",
      key: `${entry.category}:${entry.title}`,
      content: JSON.stringify(experience),
      metadata: {
        category: entry.category,
        floorId: entry.floorId,
        title: entry.title,
        trainingEligibility,
      },
      confidence: experience.confidence,
      accessCount: 1,
      createdAt: now,
      lastAccessedAt: now,
    };

    await this.repository.saveMemory(record);
    return structuredClone(experience);
  }

  async recallByKeywords(query: string, floorId?: string, limit: number = 5): Promise<ExperienceMemoryEntry[]> {
    // If working index is empty, restore from repository
    if (this.workingIndex.size === 0) {
      const persisted = await this.repository.queryMemories("CASE", undefined, 100);
      for (const p of persisted) {
        try {
          const entry = JSON.parse(p.content) as ExperienceMemoryEntry;
          this.workingIndex.set(entry.memoryId, entry);
        } catch {}
      }
    }

    const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const scored: Array<{ entry: ExperienceMemoryEntry; score: number }> = [];

    for (const entry of this.workingIndex.values()) {
      if (floorId && entry.floorId && entry.floorId !== floorId) continue;

      let score = 0;
      const targetText = `${entry.title} ${entry.summary} ${entry.category}`.toLowerCase();

      for (const token of queryTokens) {
        if (targetText.includes(token)) score += 1;
      }

      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit).map((s) => s.entry);

    for (const r of results) {
      r.lastAccessedAt = new Date().toISOString();
    }

    return results;
  }

  getRetriever(): ExperienceRetriever {
    return new KeywordExperienceRetriever(async (): Promise<RetrievedExperience[]> => {
      if (this.workingIndex.size === 0) {
        const persisted = await this.repository.queryMemories("CASE", undefined, 100);
        for (const p of persisted) {
          try {
            const entry = JSON.parse(p.content) as ExperienceMemoryEntry;
            this.workingIndex.set(entry.memoryId, entry);
          } catch {}
        }
      }

      return Array.from(this.workingIndex.values()).map((entry) => ({
        memoryId: entry.memoryId,
        experienceType: entry.experienceType ?? "REAL_OPERATIONAL",
        title: entry.title,
        summary: entry.summary,
        floorId: entry.floorId,
        similarity: 0.0,
        source: entry.floorId || "system",
        authority: entry.authority ?? "UNVERIFIED",
        verificationStatus: entry.verificationStatus ?? "UNVERIFIED",
        outcomeStatus: entry.outcomeStatus ?? "UNKNOWN",
        trainingEligibility: entry.trainingEligibility ?? "INELIGIBLE",
        createdAt: entry.createdAt,
        fullEvidence: entry.fullEvidence,
      }));
    });
  }

  async linkExperiences(memIdA: string, memIdB: string): Promise<void> {
    let a = this.workingIndex.get(memIdA);
    if (!a) {
      const recA = await this.repository.getMemory("CASE", memIdA);
      if (recA) a = JSON.parse(recA.content);
    }
    let b = this.workingIndex.get(memIdB);
    if (!b) {
      const recB = await this.repository.getMemory("CASE", memIdB);
      if (recB) b = JSON.parse(recB.content);
    }

    if (a && !a.relatedMemoryIds.includes(memIdB)) {
      a.relatedMemoryIds.push(memIdB);
      this.workingIndex.set(memIdA, structuredClone(a));
      await this.repository.saveMemory({
        memoryId: a.memoryId,
        layer: "CASE",
        key: `${a.category}:${a.title}`,
        content: JSON.stringify(a),
        metadata: { category: a.category, floorId: a.floorId, title: a.title },
        confidence: a.confidence,
        accessCount: a.usageCount,
        createdAt: a.createdAt,
        lastAccessedAt: new Date().toISOString(),
      });
    }

    if (b && !b.relatedMemoryIds.includes(memIdA)) {
      b.relatedMemoryIds.push(memIdA);
      this.workingIndex.set(memIdB, structuredClone(b));
      await this.repository.saveMemory({
        memoryId: b.memoryId,
        layer: "CASE",
        key: `${b.category}:${b.title}`,
        content: JSON.stringify(b),
        metadata: { category: b.category, floorId: b.floorId, title: b.title },
        confidence: b.confidence,
        accessCount: b.usageCount,
        createdAt: b.createdAt,
        lastAccessedAt: new Date().toISOString(),
      });
    }
  }

  async getById(memoryId: string): Promise<ExperienceMemoryEntry | null> {
    const cached = this.workingIndex.get(memoryId);
    if (cached) return structuredClone(cached);

    const record = await this.repository.getMemory("CASE", memoryId);
    if (!record) return null;

    try {
      const entry = JSON.parse(record.content) as ExperienceMemoryEntry;
      this.workingIndex.set(memoryId, entry);
      return structuredClone(entry);
    } catch {
      return null;
    }
  }

  size(): number {
    return this.workingIndex.size;
  }
}
