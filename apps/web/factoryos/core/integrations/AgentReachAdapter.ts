/**
 * FactoryOS v3 — AgentReach External Intelligence Adapter
 * Authoritative provider boundary connecting autonomous agents to real external research sources.
 * Adheres strictly to the Anti-Contamination Charter: never fabricates URLs or synthetic findings.
 */

import { ReachSubsystem, type ReachFetchRequest } from "../research/ReachSubsystem";
import type { EvidenceSource } from "../contracts/ResearchPassportContracts";

export interface ExternalResearchResult {
  readonly query: string;
  readonly domain?: string;
  readonly findings: string[];
  readonly sourceUrls: string[];
  readonly sources: EvidenceSource[];
  readonly confidence: number;
  readonly status: "ONLINE" | "DEGRADED" | "UNAVAILABLE" | "NO_EVIDENCE";
  readonly retrievedAt: string;
  readonly error?: string;
}

export class AgentReachAdapter {
  private reachSubsystem: ReachSubsystem;

  constructor(reachSubsystem?: ReachSubsystem) {
    this.reachSubsystem = reachSubsystem ?? new ReachSubsystem();
  }

  /**
   * Executes external research across web, docs, or social endpoints via the ReachSubsystem.
   */
  async searchExternalKnowledge(query: string, domain?: string, maxSources: number = 3): Promise<ExternalResearchResult> {
    const retrievedAt = new Date().toISOString();

    if (!query || query.trim() === "") {
      return {
        query,
        domain,
        findings: [],
        sourceUrls: [],
        sources: [],
        confidence: 0.0,
        status: "NO_EVIDENCE",
        retrievedAt,
        error: "Empty query provided to AgentReachAdapter",
      };
    }

    try {
      const request: ReachFetchRequest = {
        queryOrUrl: domain ? `${query} site:${domain}` : query,
        type: query.startsWith("http://") || query.startsWith("https://") ? "URL" : "QUERY",
        maxSources,
        callerFloor: "floor00_analyst",
        intent: `Domain-scoped intelligence retrieval for: ${query}`,
      };

      const sources = await this.reachSubsystem.acquireSources(request);
      const onlineSources = sources.filter((s) => s.sourceStatus === "ONLINE");

      if (onlineSources.length === 0) {
        return {
          query,
          domain,
          findings: [],
          sourceUrls: [],
          sources: [],
          confidence: 0.0,
          status: "NO_EVIDENCE",
          retrievedAt,
        };
      }

      const findings = onlineSources.map(
        (s) => `[${s.publisher || "Source"}]: ${s.snippet || s.title}`
      );
      const sourceUrls = onlineSources.map((s) => s.url);
      const avgReliability =
        onlineSources.reduce((acc, s) => acc + (s.reliabilityScore ?? 0.5), 0) /
        onlineSources.length;

      return {
        query,
        domain,
        findings,
        sourceUrls,
        sources: onlineSources,
        confidence: Number(avgReliability.toFixed(2)),
        status: "ONLINE",
        retrievedAt,
      };
    } catch (err: any) {
      return {
        query,
        domain,
        findings: [],
        sourceUrls: [],
        sources: [],
        confidence: 0.0,
        status: "UNAVAILABLE",
        retrievedAt,
        error: err?.message || "Failed executing Reach acquisition",
      };
    }
  }
}
