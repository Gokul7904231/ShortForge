/**
 * FactoryOS YouTube Monetization Guardian — Channel Creative History
 * Manages published / approved Content Genomes per channel with configurable sliding window.
 */

import { ContentGenome } from "../../../creative/ContentGenome";

export interface ChannelHistoryConfig {
  readonly maxWindowSize?: number; // default 30
}

export class ChannelCreativeHistory {
  private channelId: string;
  private history: ContentGenome[] = [];
  private maxWindowSize: number;

  public constructor(channelId: string, config?: ChannelHistoryConfig) {
    this.channelId = channelId;
    this.maxWindowSize = config?.maxWindowSize ?? 30;
  }

  public getChannelId(): string {
    return this.channelId;
  }

  public appendGenome(genome: ContentGenome): void {
    this.history.push(genome);
    if (this.history.length > this.maxWindowSize) {
      this.history.shift(); // maintain sliding window
    }
  }

  public getRecentGenomes(windowCount?: number): readonly ContentGenome[] {
    if (!windowCount || windowCount >= this.history.length) {
      return [...this.history];
    }
    return this.history.slice(-windowCount);
  }

  public clear(): void {
    this.history = [];
  }

  public size(): number {
    return this.history.length;
  }
}
