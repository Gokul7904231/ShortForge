import { describe, it, expect } from "vitest";
import { OverseerIntentEvaluator, CANONICAL_INTENT_CASES } from "../evals/overseer-intent/OverseerIntentEvals";
import { OverseerCognitivePipeline } from "../core/cognition/OverseerCognitivePipeline";
import { OverseerCognitionProvider } from "../core/cognition/OverseerCognitionProvider";
import { GeminiTTSProvider } from "../core/voice/GeminiTTSProvider";

describe("FactoryOS Frontier v3 — Overseer Cognitive Runtime & Intent Routing Suite", () => {
  const pipeline = new OverseerCognitivePipeline();

  it("1. Today's Trend Niche: routes to CURRENT_TREND with AGENT_REACH and disables static RAG truth", async () => {
    const res = await pipeline.processUserQuery("What is today's trend niche?", {
      userId: "u1",
      userRole: "CREATOR",
    });

    expect(res.intent).toBe("CURRENT_TREND");
    expect(res.sourceUsed).toContain("TrendResearchService");
    // Truthful UNAVAILABLE fallback when GEMINI_API_KEY/live research unavailable still satisfies intent routing
    if (res.evidence.status === "UNAVAILABLE") {
      expect(res.evidence.message).toBeDefined();
    } else {
      expect(res.evidence.topTrend).toBeDefined();
      expect(res.evidence.sources).toBeDefined();
    }
    expect(res.answer.toLowerCase()).toContain("trend");
  });

  it("2. Factory Telemetry: routes to FACTORY_TELEMETRY and returns authoritative floor count", async () => {
    const res = await pipeline.processUserQuery("How many floors do we have?", {
      userId: "u1",
      userRole: "CREATOR",
    });

    expect(res.intent).toBe("FACTORY_TELEMETRY");
    expect(res.sourceUsed).toBe("FactoryStateService");
    expect(res.evidence.floorCount).toBe(7);
    expect(res.answer).toContain("7");
    expect(res.answer).not.toContain("agent swarm");
    expect(res.answer).not.toContain("RAG");
  });

  it("3. Document Lookup: routes to DOCUMENT_LOOKUP and retrieves from .okf knowledge pack", async () => {
    const res = await pipeline.processUserQuery("What does our brand guide say?", {
      userId: "u1",
      userRole: "CREATOR",
    });

    expect(res.intent).toBe("DOCUMENT_LOOKUP");
    expect(res.sourceUsed).toContain("KnowledgeDocumentService");
    expect(res.evidence.title).toBeDefined();
  });

  it("4. Quota Query: routes to QUOTA and queries QuotaService without invoking LLM hallucination", async () => {
    const res = await pipeline.processUserQuery("What's my quota?", {
      userId: "u1",
      userRole: "CREATOR",
    });

    expect(res.intent).toBe("QUOTA");
    expect(res.sourceUsed).toBe("QuotaService");
    expect(res.evidence.rendersRemainingToday).toBeDefined();
  });

  it("5. Video Status: queries authoritative mission/job database", async () => {
    const res = await pipeline.processUserQuery("What is happening with my video?", {
      userId: "u1",
      userRole: "CREATOR",
    });

    expect(res.intent).toBe("VIDEO_STATUS");
    expect(res.sourceUsed).toBe("MissionStateService");
  });

  it("6. Second-Turn Intent Rerouting: previous turn does not stick or pollute new question", async () => {
    const res = await pipeline.processUserQuery("How many floors do we have?", {
      userId: "u1",
      userRole: "CREATOR",
      recentMessages: ["user: What is today's trend?"],
    });

    expect(res.intent).toBe("FACTORY_TELEMETRY");
    expect(res.sourceUsed).toBe("FactoryStateService");
    expect(res.evidence.floorCount).toBe(7);
  });

  it("7. Ambiguous Query Gate: asks for clarification instead of guessing", async () => {
    const res = await pipeline.processUserQuery("Make it better.", {
      userId: "u1",
      userRole: "CREATOR",
    });

    expect(res.intent).toBe("CLARIFICATION_REQUIRED");
    expect(res.clarificationRequired).toBe(true);
    expect(res.answer).toContain("clarify");
  });

  it("8. Google Gemini TTS Provider: generates structured audio profile for Voice Generation capability", async () => {
    // Mock Gemini TTS endpoint to avoid live API dependency in CI
    const mockAudioBase64 = Buffer.from("mock-audio-bytes-for-test").toString("base64");
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ inlineData: { data: mockAudioBase64, mimeType: "audio/mp3" } }] } }],
        }),
      } as any);
    const tts = new GeminiTTSProvider("test_api_key_for_mock");
    const result = await tts.synthesizeSpeech({
      transcript: "Discover the top 3 AI breakthroughs reshaping 2026.",
      voice: "Puck",
      style: "ENERGETIC",
      scene: "Hook Intro Scene",
      directorNotes: "High energy, sharp punchy delivery",
    });

    expect(result.provider).toBe("google_gemini_tts");
    expect(result.model).toBe("gemini-3.1-flash-tts-preview");
    expect(result.durationSeconds).toBeGreaterThan(0);
    expect(result.evidence.directorNotesApplied).toBe(true);
    (globalThis as any).fetch = originalFetch;
  });

  it("9. NVIDIA SkillEvaluator Benchmark: runs canonical intent suite with 100% accuracy", async () => {
    const evaluator = new OverseerIntentEvaluator();
    const report = await evaluator.evaluateAll();

    expect(report.totalCases).toBe(CANONICAL_INTENT_CASES.length);
    expect(report.intentAccuracy).toBe(1.0);
    expect(report.factualGroundingRate).toBe(1.0);
  });
});
