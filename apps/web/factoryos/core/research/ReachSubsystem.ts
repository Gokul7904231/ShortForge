/**
 * ShortForge Reach — Controlled External Information Access Subsystem
 * Gated, policy-aware interface providing source access, normalized data, and evidence.
 *
 * Reach is intentionally NOT a generic query oracle.
 * Every production query must be rendered from the selected Content Engine's
 * immutable research contract.
 */

import { LightpandaBrowserAdapter } from "./LightpandaBrowserAdapter";
import type { EvidenceSource } from "../contracts/ResearchPassportContracts";
import type {
  EngineResearchContract,
  EngineResearchQueryRule,
} from "../../../lib/core/EngineConfigurationContracts";
import { randomUUID, createHash } from "node:crypto";

export interface ReachFetchRequest {
  readonly engineId: string;
  readonly queryKind: string;
  readonly topic: string;
  readonly parameters?: Readonly<Record<string, string>>;
  readonly researchContract: EngineResearchContract;
  readonly maxSources?: number;
  readonly callerFloor?: string;
  readonly intent?: string;
}

/**
 * Test-only provider hook. It still receives the fully validated/rendered
 * research request, so unit tests can verify the same contract boundary.
 */
export interface ReachTestProvider {
  isTestFixture: true;
  acquire(request: ReachFetchRequest & { readonly renderedQuery: string }): Promise<EvidenceSource[]>;
}

function assertBoundedQueryRequest(request: ReachFetchRequest): EngineResearchQueryRule {
  if (!request.engineId || !request.engineId.trim()) {
    throw new Error("REACH_ENGINE_ID_REQUIRED: Content Engine identity is required.");
  }

  if (!request.researchContract || request.researchContract.required !== true) {
    throw new Error(
      "REACH_ENGINE_CONTRACT_REQUIRED: Reach only accepts research authorized by a required Content Engine research contract.",
    );
  }

  const expectedProfile = `engine:${request.engineId}`;
  if (request.researchContract.agentReachProfile !== expectedProfile) {
    throw new Error(
      `REACH_ENGINE_PROFILE_MISMATCH: expected ${expectedProfile}, received ${request.researchContract.agentReachProfile || "missing"}.`,
    );
  }

  if (request.callerFloor && request.callerFloor !== "floor00_analyst") {
    throw new Error(
      "REACH_CALLER_NOT_AUTHORIZED: production Reach queries must originate from floor00_analyst.",
    );
  }

  if (!request.queryKind || !request.queryKind.trim()) {
    throw new Error("REACH_QUERY_KIND_REQUIRED: Content Engine query kind is required.");
  }

  if (!request.topic || !request.topic.trim()) {
    throw new Error("REACH_TOPIC_REQUIRED: Research topic is required.");
  }

  const rule = (request.researchContract.queryRules || []).find(
    (candidate) => candidate.queryKind === request.queryKind,
  );

  if (!rule) {
    throw new Error(
      `REACH_QUERY_KIND_NOT_ALLOWED: engine ${request.engineId} does not authorize query kind ${request.queryKind}.`,
    );
  }

  const placeholders = [...rule.queryTemplate.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);
  const declaredParameters = new Set(["topic", ...(rule.requiredParameters || [])]);

  for (const placeholder of placeholders) {
    if (!declaredParameters.has(placeholder)) {
      throw new Error(
        `REACH_QUERY_TEMPLATE_INVALID: undeclared template parameter {${placeholder}} in ${rule.queryKind}.`,
      );
    }
  }

  for (const parameter of rule.requiredParameters || []) {
    const value = parameter === "topic"
      ? request.topic
      : request.parameters?.[parameter];

    if (!value || String(value).trim() === "") {
      throw new Error(
        `REACH_QUERY_PARAMETER_REQUIRED: parameter "${parameter}" is required for ${rule.queryKind}.`,
      );
    }
  }

  return rule;
}

function renderEngineQuery(
  request: ReachFetchRequest,
  rule: EngineResearchQueryRule,
): string {
  const values: Record<string, string> = {
    topic: request.topic.trim(),
    ...(request.parameters || {}),
  };

  const rendered = rule.queryTemplate
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => values[key] ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!rendered) {
    throw new Error("REACH_RENDERED_QUERY_EMPTY: Content Engine query rendered to an empty string.");
  }

  if (rendered.length > 2000) {
    throw new Error("REACH_RENDERED_QUERY_TOO_LARGE: rendered query exceeds 2000 characters.");
  }

  return rendered;
}

export class ReachSubsystem {
  private browserAdapter: LightpandaBrowserAdapter;
  private testProvider?: ReachTestProvider;

  constructor(testProvider?: ReachTestProvider) {
    this.browserAdapter = new LightpandaBrowserAdapter();
    this.testProvider = testProvider;
  }

  /**
   * Acquires external sources.
   *
   * IMPORTANT:
   * - No raw/free-form production query is accepted.
   * - No direct URL retrieval is accepted through this production path.
   * - The query sent to an external provider is rendered exclusively from
   *   the Content Engine research contract + bounded request parameters.
   */
  async acquireSources(request: ReachFetchRequest): Promise<EvidenceSource[]> {
    const rule = assertBoundedQueryRequest(request);
    const renderedQuery = renderEngineQuery(request, rule);

    if (this.testProvider) {
      const testSources = await this.testProvider.acquire({
        ...request,
        renderedQuery,
      });
      return testSources.map((s) => ({
        ...s,
        extractionMethod: "TEST_FIXTURE" as const,
        sourceStatus: "TEST_FIXTURE" as const,
      }));
    }

    const sources: EvidenceSource[] = [];
    const now = new Date().toISOString();
    const searchApiUrl = process.env.SEARCH_API_URL;

    if (!searchApiUrl) {
      return [];
    }

    try {
      const res = await fetch(
        `${searchApiUrl}?q=${encodeURIComponent(renderedQuery)}`,
        {
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!res.ok) {
        return [];
      }

      const data = await res.json();

      if (!Array.isArray(data.results)) {
        return [];
      }

      for (const item of data.results.slice(0, request.maxSources || 5)) {
        if (!item?.url || typeof item.url !== "string") {
          continue;
        }

        const itemHash = createHash("sha256")
          .update(item.snippet || item.title || "", "utf8")
          .digest("hex");

        sources.push({
          id: `src_${randomUUID().substring(0, 8)}`,
          url: item.url,
          title: item.title || renderedQuery,
          publisher:
            item.publisher ||
            (item.url ? new URL(item.url).hostname : "Search Provider"),
          retrievedAt: now,
          extractionMethod: "API_FEED",
          snippet: (item.snippet || "").slice(0, 600),
          reliabilityScore:
            typeof item.score === "number" ? item.score : 0.85,
          contentHash: itemHash,
          sourceStatus: "ONLINE",
        });
      }

      return sources;
    } catch (err: any) {
      console.warn(
        `[ReachSubsystem] Engine-scoped search failed: ${err?.message || "unknown error"}`,
      );
      return [];
    }
  }
}
