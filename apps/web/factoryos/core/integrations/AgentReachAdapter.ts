/**
 * FactoryOS v3 — AgentReach External Intelligence Adapter
 * Authoritative provider boundary connecting autonomous agents to real external research sources.
 *
 * AgentReach is intentionally contract-bound:
 * Content Engine -> Research Contract -> AgentReach -> ReachSubsystem -> evidence.
 */

import {
  ReachSubsystem,
  type ReachFetchRequest,
} from "../research/ReachSubsystem";
import type { EvidenceSource } from "../contracts/ResearchPassportContracts";

export interface ExternalResearchResult {
  readonly query: string;
  readonly engineId?: string;
  readonly queryKind?: string;
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
   * Production contract-bound API.
   */
  async searchExternalKnowledge(
    request: ReachFetchRequest,
  ): Promise<ExternalResearchResult>;

  /**
   * Legacy API intentionally retained only as a fail-closed compatibility
   * surface. It can no longer execute an arbitrary query.
   */
  async searchExternalKnowledge(
    query: string,
    domain?: string,
    maxSources?: number,
  ): Promise<ExternalResearchResult>;

  async searchExternalKnowledge(
    requestOrQuery: ReachFetchRequest | string,
    domain?: string,
    maxSources: number = 3,
  ): Promise<ExternalResearchResult> {
    const retrievedAt = new Date().toISOString();

    if (typeof requestOrQuery === "string") {
      return {
        query: requestOrQuery,
        domain,
        findings: [],
        sourceUrls: [],
        sources: [],
        confidence: 0.0,
        status: "NO_EVIDENCE",
        retrievedAt,
        error:
          "REACH_ENGINE_CONTRACT_REQUIRED: arbitrary AgentReach queries are disabled; provide a Content Engine-bound research contract.",
      };
    }

    const request = requestOrQuery;

    try {
      const sources = await this.reachSubsystem.acquireSources({
        ...request,
        maxSources:
          request.maxSources ??
          Math.min(Math.max(Math.floor(maxSources), 1), 20),
        callerFloor: request.callerFloor ?? "floor00_analyst",
      });

      const onlineSources = sources.filter(
        (source) => source.sourceStatus === "ONLINE",
      );

      if (onlineSources.length === 0) {
        return {
          query: request.topic,
          engineId: request.engineId,
          queryKind: request.queryKind,
          findings: [],
          sourceUrls: [],
          sources: [],
          confidence: 0.0,
          status: "NO_EVIDENCE",
          retrievedAt,
        };
      }

      const findings = onlineSources.map(
        (s) => `[${s.publisher || "Source"}]: ${s.snippet || s.title}`,
      );

      const sourceUrls = onlineSources.map((s) => s.url);

      const avgReliability =
        onlineSources.reduce(
          (acc, s) => acc + (s.reliabilityScore ?? 0.5),
          0,
        ) / onlineSources.length;

      return {
        query: request.topic,
        engineId: request.engineId,
        queryKind: request.queryKind,
        findings,
        sourceUrls,
        sources: onlineSources,
        confidence: Number(avgReliability.toFixed(2)),
        status: "ONLINE",
        retrievedAt,
      };
    } catch (err: any) {
      return {
        query: request.topic,
        engineId: request.engineId,
        queryKind: request.queryKind,
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
