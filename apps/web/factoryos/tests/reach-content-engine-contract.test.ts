import { describe, expect, it } from "vitest";
import {
  ReachSubsystem,
  type ReachFetchRequest,
} from "../core/research/ReachSubsystem";
import {
  AgentReachAdapter,
} from "../core/integrations/AgentReachAdapter";
import type { EvidenceSource } from "../core/contracts/ResearchPassportContracts";

const QUIZ_CONTRACT = {
  required: true,
  dataRequirements: [
    "Questions and answers need source-backed verification before release.",
  ],
  queryRules: [
    {
      queryKind: "TREND_SCAN",
      queryTemplate: "{topic} trending quiz topics short-form formats",
    },
    {
      queryKind: "FACT_CHECK",
      queryTemplate: "{topic} fact check answer verification sources",
    },
  ],
  minSources: 2,
  citationRequired: true,
  freshness: "any" as const,
  sourcePolicy: "F00 Research Passport evidence is the upstream research boundary.",
  agentReachProfile: "engine:quiz",
};

function source(id: string): EvidenceSource {
  return {
    id,
    url: "https://example.com/source",
    title: "Example source",
    publisher: "example.com",
    retrievedAt: new Date().toISOString(),
    extractionMethod: "TEST_FIXTURE",
    snippet: "Evidence for the requested engine research operation.",
    reliabilityScore: 0.95,
    contentHash: "fixture-hash",
    sourceStatus: "TEST_FIXTURE",
  };
}

function fixtureProvider(captured: { request?: ReachFetchRequest & { renderedQuery: string } }) {
  return {
    isTestFixture: true as const,
    async acquire(request: ReachFetchRequest & { renderedQuery: string }) {
      captured.request = request;
      return [source("src_engine_01")];
    },
  };
}

describe("Reach — Content Engine Contract Gate", () => {
  it("rejects production acquisition without a Content Engine contract", async () => {
    const reach = new ReachSubsystem();

    await expect(
      reach.acquireSources({
        engineId: "quiz",
        queryKind: "TREND_SCAN",
        topic: "AI quizzes",
        researchContract: undefined as any,
        callerFloor: "floor00_analyst",
      } as any),
    ).rejects.toThrow(/REACH_ENGINE_CONTRACT_REQUIRED/);
  });

  it("rejects a contract whose AgentReach profile does not bind to the selected engine", async () => {
    const captured: { request?: ReachFetchRequest & { renderedQuery: string } } = {};
    const reach = new ReachSubsystem(fixtureProvider(captured));

    await expect(
      reach.acquireSources({
        engineId: "quiz",
        queryKind: "TREND_SCAN",
        topic: "AI quizzes",
        researchContract: {
          ...QUIZ_CONTRACT,
          agentReachProfile: "engine:news",
        },
        callerFloor: "floor00_analyst",
      }),
    ).rejects.toThrow(/REACH_ENGINE_PROFILE_MISMATCH/);
  });

  it("rejects a query kind not declared by the Content Engine", async () => {
    const reach = new ReachSubsystem(fixtureProvider({}));

    await expect(
      reach.acquireSources({
        engineId: "quiz",
        queryKind: "ARBITRARY_WEB_SEARCH",
        topic: "AI quizzes",
        researchContract: QUIZ_CONTRACT,
        callerFloor: "floor00_analyst",
      }),
    ).rejects.toThrow(/REACH_QUERY_KIND_NOT_ALLOWED/);
  });

  it("renders the provider query exclusively from the engine-owned query template", async () => {
    const captured: { request?: ReachFetchRequest & { renderedQuery: string } } = {};
    const reach = new ReachSubsystem(fixtureProvider(captured));

    const sources = await reach.acquireSources({
      engineId: "quiz",
      queryKind: "TREND_SCAN",
      topic: "Quantum Computing",
      researchContract: QUIZ_CONTRACT,
      callerFloor: "floor00_analyst",
      maxSources: 2,
    });

    expect(sources).toHaveLength(1);
    expect(captured.request?.renderedQuery).toBe(
      "Quantum Computing trending quiz topics short-form formats",
    );
    expect(captured.request?.queryKind).toBe("TREND_SCAN");
    expect(captured.request?.engineId).toBe("quiz");
  });

  it("blocks the legacy AgentReach arbitrary-query surface", async () => {
    const adapter = new AgentReachAdapter();
    const result = await adapter.searchExternalKnowledge(
      "search anything outside an engine",
    );

    expect(result.status).toBe("NO_EVIDENCE");
    expect(result.confidence).toBe(0);
    expect(result.error).toMatch(/REACH_ENGINE_CONTRACT_REQUIRED/);
  });
});
