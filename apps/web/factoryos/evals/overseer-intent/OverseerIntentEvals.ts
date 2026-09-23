/**
 * FactoryOS Frontier v3 — Overseer Intent & Cognitive Routing Evaluation Suite
 * Evaluates the 8 canonical intent routing and grounding scenarios with NVIDIA SkillEvaluator metrics.
 */

import { OverseerCognitivePipeline } from "../../core/cognition/OverseerCognitivePipeline";

export interface IntentBenchmarkCase {
  id: string;
  name: string;
  userPrompt: string;
  previousTurn?: string;
  expectedIntent: string;
  expectedSourceClass: string;
  requiresLiveResearch: boolean;
  staticOkfAllowedAsPrimary: boolean;
  expectedEvidenceKey: string;
  clarificationRequired?: boolean;
}

export const CANONICAL_INTENT_CASES: IntentBenchmarkCase[] = [
  {
    id: "INTENT-001",
    name: "Today's Trend Niche (Live Research Mandatory)",
    userPrompt: "What is today's trend niche?",
    expectedIntent: "CURRENT_TREND",
    expectedSourceClass: "TrendResearchService",
    requiresLiveResearch: true,
    staticOkfAllowedAsPrimary: false,
    expectedEvidenceKey: "topTrend",
  },
  {
    id: "INTENT-002",
    name: "Factory Floor Telemetry (Authoritative Floor Count)",
    userPrompt: "How many floors do we have?",
    expectedIntent: "FACTORY_TELEMETRY",
    expectedSourceClass: "FactoryStateService",
    requiresLiveResearch: false,
    staticOkfAllowedAsPrimary: false,
    expectedEvidenceKey: "floorCount",
  },
  {
    id: "INTENT-003",
    name: "Brand Guide Lookup (.okf Knowledge Pack)",
    userPrompt: "What does our brand guide say?",
    expectedIntent: "DOCUMENT_LOOKUP",
    expectedSourceClass: "KnowledgeDocumentService",
    requiresLiveResearch: false,
    staticOkfAllowedAsPrimary: true,
    expectedEvidenceKey: "content",
  },
  {
    id: "INTENT-004",
    name: "Quota & Credits Query (Quota Service Authority)",
    userPrompt: "What's my quota?",
    expectedIntent: "QUOTA",
    expectedSourceClass: "QuotaService",
    requiresLiveResearch: false,
    staticOkfAllowedAsPrimary: false,
    expectedEvidenceKey: "rendersRemainingToday",
  },
  {
    id: "INTENT-005",
    name: "Video Status & Production State",
    userPrompt: "What is happening with my video?",
    expectedIntent: "VIDEO_STATUS",
    expectedSourceClass: "MissionStateService",
    requiresLiveResearch: false,
    staticOkfAllowedAsPrimary: false,
    expectedEvidenceKey: "activeMissions",
  },
  {
    id: "INTENT-006",
    name: "Trend-Based Video Creation (Research -> Creation Handoff)",
    userPrompt: "Make me a short about today's AI trend.",
    expectedIntent: "CURRENT_TREND",
    expectedSourceClass: "TrendResearchService",
    requiresLiveResearch: true,
    staticOkfAllowedAsPrimary: false,
    expectedEvidenceKey: "topTrend",
  },
  {
    id: "INTENT-007",
    name: "Contextual Rerouting (Second Turn Resets Intent)",
    userPrompt: "How many floors do we have?",
    previousTurn: "What is today's trend?",
    expectedIntent: "FACTORY_TELEMETRY",
    expectedSourceClass: "FactoryStateService",
    requiresLiveResearch: false,
    staticOkfAllowedAsPrimary: false,
    expectedEvidenceKey: "floorCount",
  },
  {
    id: "INTENT-008",
    name: "Ambiguous Request (Clarification Required Gate)",
    userPrompt: "Make it better.",
    expectedIntent: "CLARIFICATION_REQUIRED",
    expectedSourceClass: "GENERAL_KNOWLEDGE",
    requiresLiveResearch: false,
    staticOkfAllowedAsPrimary: false,
    expectedEvidenceKey: "",
    clarificationRequired: true,
  },
];

export class OverseerIntentEvaluator {
  private pipeline = new OverseerCognitivePipeline();

  async evaluateAll(): Promise<{
    totalCases: number;
    intentAccuracy: number;
    sourceSelectionAccuracy: number;
    factualGroundingRate: number;
    results: Array<{ caseId: string; pass: boolean; intent: string; source: string; answer: string }>;
  }> {
    let intentMatches = 0;
    let sourceMatches = 0;
    let groundedMatches = 0;

    const results = [];

    for (const c of CANONICAL_INTENT_CASES) {
      const exec = await this.pipeline.processUserQuery(c.userPrompt, {
        userId: "eval_user",
        userRole: "CREATOR",
        recentMessages: c.previousTurn ? [`user: ${c.previousTurn}`] : [],
      });

      const intentPass = exec.intent === c.expectedIntent;
      const sourcePass = !c.expectedSourceClass || exec.sourceUsed.toLowerCase().includes(c.expectedSourceClass.toLowerCase().replace(/_/g, ""));
      // Truthful UNAVAILABLE/EMPTY fallbacks are grounded — they carry message/content truthfully
      const isTruthfulFallback = exec.evidence.status === "UNAVAILABLE" || exec.evidence.status === "EMPTY" || exec.sourceUsed.includes("Unavailable") || exec.sourceUsed.includes("Empty");
      // Fix: numeric 0 (e.g. activeMissions=0) is truthful grounded value — Boolean(0) was false
      const rawVal = exec.evidence[c.expectedEvidenceKey];
      const hasEvidenceKey = !c.expectedEvidenceKey || (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "");
      const groundedPass = hasEvidenceKey || (isTruthfulFallback && (Boolean(exec.evidence.message) || Boolean(exec.evidence.content)));

      if (intentPass) intentMatches++;
      if (sourcePass) sourceMatches++;
      if (groundedPass) groundedMatches++;

      results.push({
        caseId: c.id,
        pass: intentPass && groundedPass,
        intent: exec.intent,
        source: exec.sourceUsed,
        answer: exec.answer,
      });
    }

    return {
      totalCases: CANONICAL_INTENT_CASES.length,
      intentAccuracy: parseFloat((intentMatches / CANONICAL_INTENT_CASES.length).toFixed(2)),
      sourceSelectionAccuracy: parseFloat((sourceMatches / CANONICAL_INTENT_CASES.length).toFixed(2)),
      factualGroundingRate: parseFloat((groundedMatches / CANONICAL_INTENT_CASES.length).toFixed(2)),
      results,
    };
  }
}
