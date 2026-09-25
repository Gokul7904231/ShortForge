/**
 * Canonical F01 runtime adapter.
 *
 * Overseer remains lifecycle authority. Strategy logic stays in the Python F01
 * service. This adapter only converts the verified F00 report into the F01
 * input contract and transports it.
 */

import { ResearchRuntime } from "../research/ResearchRuntime";
import type { AnalystReport } from "../contracts/ResearchPassportContracts";

export interface Floor01RuntimeRequest {
  request_id: string;
  topic_query: string;
  target_audience: string;
  platform: string;
  content_format: string;
  niche_context?: string;
  learning_level?: string;
  constraints?: Record<string, unknown>;
  research_context?: Record<string, unknown>;
}

export class Floor01RuntimeAdapter {
  private readonly serviceUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(
    serviceUrl: string | undefined = process.env.FLOOR01_SERVICE_URL,
    apiKey: string | undefined =
      process.env.FLOOR01_SERVICE_API_KEY || process.env.INTERNAL_API_SECRET_KEY,
    timeoutMs = Number(process.env.FLOOR01_SERVICE_TIMEOUT_MS || 30000),
  ) {
    this.serviceUrl = serviceUrl;
    this.apiKey = apiKey;
    this.timeoutMs = Number.isFinite(timeoutMs)
      ? Math.min(Math.max(timeoutMs, 1000), 120000)
      : 30000;
  }

  async execute(
    request: Floor01RuntimeRequest,
  ): Promise<Record<string, unknown>> {
    if (!this.serviceUrl) {
      throw new Error(
        "F01_SERVICE_UNCONFIGURED: FLOOR01_SERVICE_URL is required; Overseer will not synthesize a second F01 implementation.",
      );
    }

    if (!this.apiKey) {
      throw new Error(
        "F01_SERVICE_AUTH_UNCONFIGURED: FLOOR01_SERVICE_API_KEY or INTERNAL_API_SECRET_KEY is required.",
      );
    }

    const url = this.serviceUrl.replace(/\/$/, "") + "/v1/plan";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.apiKey,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          "F01_SERVICE_TIMEOUT: canonical F01 service did not respond before the configured deadline.",
        );
      }
      throw new Error(
        "F01_SERVICE_UNREACHABLE: canonical F01 service request failed.",
      );
    } finally {
      clearTimeout(timeout);
    }

    const raw = await response.text();
    if (raw.length > 1_000_000) {
      throw new Error("F01_SERVICE_RESPONSE_TOO_LARGE: response exceeded the safety limit.");
    }
    if (!response.ok) {
      throw new Error(
        "F01_SERVICE_EXECUTION_FAILED: HTTP " +
          response.status +
          " " +
          raw.slice(0, 500),
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error("F01_SERVICE_INVALID_RESPONSE: canonical service returned invalid JSON.");
    }
    if (payload.floor_id !== "floor01_strategy") {
      throw new Error(
        "F01_CONTRACT_IDENTITY_MISMATCH: expected floor01_strategy.",
      );
    }
    if (payload.handoff_status === "REJECTED") {
      throw new Error("F01_STRATEGY_REJECTED_BY_CANONICAL_RUNTIME");
    }
    if (payload.handoff_status === "DEGRADED") {
      throw new Error(
        "F01_DEGRADED_HANDOFF_NOT_ALLOWED: canonical production handoff must be VALIDATED.",
      );
    }
    if (payload.handoff_status !== "VALIDATED") {
      throw new Error(
        "F01_INVALID_HANDOFF_STATUS: canonical production handoff status is not recognized.",
      );
    }

    return payload;
  }

  static fromAnalystReport(
    requestId: string,
    analystReport: AnalystReport,
    input: {
      targetAudience?: string;
      platform?: string;
      contentFormat?: string;
      nicheContext?: string;
      learningLevel?: string;
      constraints?: Record<string, unknown>;
    } = {},
  ): Floor01RuntimeRequest {
    const passport = analystReport.passport;
    const integrity = ResearchRuntime.verifyResearchPassport(passport);

    return {
      request_id: requestId,
      topic_query: analystReport.topic,
      target_audience: input.targetAudience || passport.researchContext?.audience || "general_learners",
      platform: input.platform || "youtube_shorts",
      content_format: input.contentFormat || "educational_short",
      niche_context: input.nicheContext,
      learning_level: input.learningLevel || "beginner",
      constraints: input.constraints || {},
      research_context: {
        passport_id: passport.passportId,
        mission_id: passport.missionId,
        integrity_verified: integrity.valid,
        question: passport.question,
        confidence: passport.confidence,
        source_count: passport.sources.length,
        verified_claim_count: passport.claims.filter((claim) => claim.verificationStatus === "VERIFIED").length,
        unresolved_issue_count: passport.unresolvedIssues.length,
        freshness: passport.researchContext?.freshness || "any",
        key_findings: analystReport.keyFindings,
        recommended_hook: analystReport.hookIntelligence.recommendedHook,
        hook_archetype: analystReport.hookIntelligence.hookArchetype,
        evidence: passport.claims.map((claim) => ({
          evidence_id: claim.claimId,
          claim_id: claim.claimId,
          statement: claim.statement,
          verification_status: claim.verificationStatus,
          confidence: claim.confidence,
          supporting_source_ids: claim.supportingSources || [],
          source_quality: claim.source ? [claim.source.sourceQuality || "UNVERIFIED"] : [],
        })),
        provenance: [
          "ResearchRuntime.verifyResearchPassport",
          passport.provenance.reachProvider,
          passport.provenance.floorId,
        ],
      },
    };
  }
}
