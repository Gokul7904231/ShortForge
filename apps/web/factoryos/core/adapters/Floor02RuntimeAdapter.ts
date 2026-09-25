import { createHash } from "crypto";

export interface Floor02RuntimeInput {
  requestId: string;
  topic: string;
  targetDurationSeconds: number;
  strategy: Record<string, any>;
  upstreamHandoff?: Record<string, any>;
}

export interface Floor02RuntimeResult {
  handoffPayload: Record<string, any>;
  executionReport?: Record<string, any>;
}

function provenance(sourceType: string, summary: string) {
  return {
    evidence_type: "DETERMINISTIC_RULE",
    source_type: sourceType,
    source_identifier: "overseer_f02_runtime_adapter_v2",
    method: "canonical_f01_compatibility_handoff",
    confidence_score: 1.0,
    summary,
    raw_data: {},
  };
}

function normalizedTopic(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200) || "general_education";
}

function buildCompatibilityFloor01Handoff(input: Floor02RuntimeInput): Record<string, any> {
  if (input.upstreamHandoff) return input.upstreamHandoff;

  const strategy = input.strategy || {};
  const topic = input.topic || "General Education";
  const audience = strategy.targetAudience || "general_learners";
  const platform = strategy.platform || "youtube_shorts";
  const hook = strategy.recommendedHook || `Learn the key idea behind ${topic} in a few seconds.`;
  const p = provenance(
    "overseer_strategy_adapter",
    "Constructed a schema-valid Floor 01 compatibility handoff from the Overseer strategy payload. The canonical Python Floor 02 remains authoritative for scripting."
  );

  return {
    plan_id: `plan_${createHash("sha256").update(input.requestId).digest("hex").slice(0, 16)}`,
    request_id: input.requestId,
    floor_id: "floor01_strategy",
    floor_version: "compatibility-v2",
    created_at: new Date().toISOString(),
    execution_mode: "DETERMINISTIC",
    topic: {
      selected_topic: topic,
      normalized_topic: normalizedTopic(topic),
      category: "general_education",
      niche: "general",
      selection_reason: "Provided by canonical Overseer strategy execution.",
      similarity_risk_score: 0,
      uniqueness_verdict: "MEMORY_UNSEEN",
      provenance: [p],
    },
    strategy: {
      target_audience: audience,
      platform,
      content_angle: strategy.contentAngle || "practical_mental_model",
      tone: strategy.tone || "engaging_educational",
      format: strategy.format || "educational_short",
      target_duration_seconds: input.targetDurationSeconds,
      platform_spec: strategy.platformSpec || { platform },
      execution_mode: "DETERMINISTIC",
      provenance: [p],
    },
    content_plan: {
      core_objective: `Explain ${topic} clearly for ${audience}.`,
      key_takeaways: [
        strategy.contentAngle || `Understand the core idea behind ${topic}`,
        strategy.recommendedHook || `Apply the key idea behind ${topic}`,
      ],
      hook_direction: hook,
      cta_direction: strategy.ctaDirection || "Save this explanation for later.",
      structural_outline: ["Hook", "Retain", "Payoff"],
      pacing_guidance: {
        hook: Math.min(8, Math.max(3, Math.round(input.targetDurationSeconds * 0.1))),
        retain: Math.max(5, Math.round(input.targetDurationSeconds * 0.7)),
        payoff: Math.max(5, Math.round(input.targetDurationSeconds * 0.2)),
      },
      downstream_requirements: {
        canonicalRuntime: "floor02_scripting",
      },
      provenance: [p],
    },
    curriculum: {
      difficulty_level: strategy.learningLevel || "beginner",
      prerequisites: [],
      learning_objectives: [`Understand ${topic}`],
      bloom_taxonomy_level: "UNDERSTAND",
      concept_dependencies: [],
      knowledge_gap_hypothesis: [],
      assessment_opportunities: [],
      suggested_sequence_order: 1,
      provenance: [p],
    },
    decision_quality_score: 0.8,
    handoff_status: "VALIDATED",
  };
}

export class Floor02RuntimeAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    baseUrl = process.env.FLOOR02_RUNTIME_URL || "",
    apiKey = process.env.FLOOR02_SERVICE_API_KEY || process.env.FLOOR02_API_KEY || ""
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async plan(input: Floor02RuntimeInput): Promise<Floor02RuntimeResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "[Floor02RuntimeAdapter] Canonical Python Floor 02 runtime is not configured. " +
        "Set FLOOR02_RUNTIME_URL and FLOOR02_SERVICE_API_KEY."
      );
    }

    const payload = {
      request_id: input.requestId,
      topic_query: input.topic,
      target_duration_seconds: input.targetDurationSeconds,
      narrative_format: "educational_explainer",
      words_per_second: 2.5,
      strict_upstream: true,
      floor01_payload: buildCompatibilityFloor01Handoff(input),
    };

    const response = await fetch(`${this.baseUrl}/v1/script/plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        `[Floor02RuntimeAdapter] Canonical F02 runtime rejected request: HTTP ${response.status}`
      );
    }

    let result: Record<string, any>;
    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error("[Floor02RuntimeAdapter] Canonical F02 runtime returned invalid JSON");
    }

    if (
      result.floor_id !== "floor02_scripting" ||
      result.floor_version !== "2.0.0" ||
      !result.script_ir ||
      result.script_ir.schema_version !== "2.0" ||
      result.handoff_status !== "VALIDATED" ||
      !result.quality_report?.accepted
    ) {
      throw new Error(
        "[Floor02RuntimeAdapter] Canonical F02 runtime returned an invalid or unvalidated handoff"
      );
    }

    return { handoffPayload: result };
  }
}
