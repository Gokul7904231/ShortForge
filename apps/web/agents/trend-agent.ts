/**
 * FactoryOS — Authoritative Trend Agent
 * Discovers real trends by delegating to F00 ResearchRuntime and AgentReach.
 * Eliminates synthetic stubs in favor of cryptographically verifiable ResearchPassports.
 */

import { ResearchRuntime, type ResearchRequest } from "../factoryos/core/research/ResearchRuntime";
import type { AnalystReport } from "../factoryos/core/contracts/ResearchPassportContracts";

export type TrendAgentInput = {
  topic: string;
  style?: string;
  missionId?: string;
  targetSourceCount?: number;
};

export interface TrendAgentOutput {
  readonly topic: string;
  readonly trends: string[];
  readonly report?: AnalystReport;
  readonly passportId?: string;
  readonly evidenceConfidence: number;
}

export async function trendAgent(input: TrendAgentInput): Promise<TrendAgentOutput> {
  const runtime = new ResearchRuntime();
  const missionId = input.missionId ?? `trend_${Date.now().toString(36)}`;

  const request: ResearchRequest = {
    missionId,
    topic: input.topic,
    intent: `Autonomous trend discovery for "${input.topic}" (${input.style || "STANDARD"})`,
    methodology: "TREND_SCAN",
    targetSourceCount: input.targetSourceCount ?? 3,
  };

  const report = await runtime.executeResearch(request);
  const trends = report.keyFindings.filter((f) => !f.toLowerCase().includes("lacks external"));

  return {
    topic: input.topic,
    trends,
    report,
    passportId: report.passport?.passportId,
    evidenceConfidence: report.passport?.confidence ?? 0.0,
  };
}
