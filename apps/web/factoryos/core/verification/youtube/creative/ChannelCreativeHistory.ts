/**
 * FactoryOS YouTube Monetization Guardian — Channel Creative History
 * Durable storage for published/approved Content Genomes per channel.
 * Tracks coverage: FULL | PARTIAL | SHORTFORGE_ONLY | UNKNOWN to prevent false "no fatigue" claims on partial data.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ContentGenome } from "../../../creative/ContentGenome";

export type HistoricalCoverage = "FULL" | "PARTIAL" | "SHORTFORGE_ONLY" | "UNKNOWN";

export interface ChannelHistoryEntry {
  readonly channelId: string;
  readonly videoId: string;
  readonly publishedAt: string;
  readonly contentGenome: ContentGenome;
  readonly artifactHash: string;
  readonly revision: number;
  readonly publicationStatus: "PUBLISHED" | "APPROVED" | "REJECTED";
}

export interface ChannelHistoryConfig {
  readonly maxWindowSize?: number; // default 30
  readonly storageDir?: string;
  readonly initialCoverage?: HistoricalCoverage;
}

export class ChannelCreativeHistory {
  private channelId: string;
  private entries: ChannelHistoryEntry[] = [];
  private maxWindowSize: number;
  private storageDir: string;
  private coverage: HistoricalCoverage;

  public constructor(channelId: string, config?: ChannelHistoryConfig) {
    this.channelId = channelId;
    this.maxWindowSize = config?.maxWindowSize ?? 30;
    this.coverage = config?.initialCoverage ?? "SHORTFORGE_ONLY";
    this.storageDir = config?.storageDir || path.resolve(process.cwd(), "data", "channel_history");

    this.restoreFromDisk();
  }

  public getChannelId(): string {
    return this.channelId;
  }

  public getCoverage(): HistoricalCoverage {
    return this.coverage;
  }

  public setCoverage(coverage: HistoricalCoverage): void {
    this.coverage = coverage;
  }

  public recordEntry(entry: ChannelHistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxWindowSize) {
      this.entries.shift();
    }
    this.persistToDisk();
  }

  public appendGenome(genome: ContentGenome, videoId?: string, artifactHash?: string): void {
    const entry: ChannelHistoryEntry = {
      channelId: this.channelId,
      videoId: videoId || `vid_${Date.now()}`,
      publishedAt: new Date().toISOString(),
      contentGenome: genome,
      artifactHash: artifactHash || genome.scriptHash || "unknown_hash",
      revision: 1,
      publicationStatus: "APPROVED",
    };
    this.recordEntry(entry);
  }

  public getRecentGenomes(windowCount?: number): readonly ContentGenome[] {
    const recent = this.getRecentEntries(windowCount);
    return recent.map((e) => e.contentGenome);
  }

  public getRecentEntries(windowCount?: number): readonly ChannelHistoryEntry[] {
    if (!windowCount || windowCount >= this.entries.length) {
      return [...this.entries];
    }
    return this.entries.slice(-windowCount);
  }

  public clear(): void {
    this.entries = [];
    const filePath = path.join(this.storageDir, `${this.channelId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  }

  public size(): number {
    return this.entries.length;
  }

  private persistToDisk(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const filePath = path.join(this.storageDir, `${this.channelId}.json`);
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          channelId: this.channelId,
          coverage: this.coverage,
          entries: this.entries,
        }),
        "utf8"
      );
    } catch {
      // Non-fatal disk sync
    }
  }

  private restoreFromDisk(): void {
    try {
      const filePath = path.join(this.storageDir, `${this.channelId}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (data && Array.isArray(data.entries)) {
          this.entries = data.entries;
          this.coverage = data.coverage || this.coverage;
        }
      }
    } catch {
      // Non-fatal restore
    }
  }
}
