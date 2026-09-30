/**
 * ShortForge Reach — Controlled External Information Access Subsystem
 * Contract-gated research acquisition with provider-independent routing.
 */

import type { EvidenceSource } from "../contracts/ResearchPassportContracts";
import type { EngineResearchQueryRule } from "../../../lib/core/EngineConfigurationContracts";
import { deduplicateEvidenceSources } from "./ReachCache";
import {
  ReachProviderRouter,
  type ReachRouterOptions,
} from "./ReachProviderRouter";
import type { ReachFetchRequest } from "./ReachContracts";
import { randomUUID } from "node:crypto";

export type { ReachFetchRequest } from "./ReachContracts";

export interface ReachTestProvider {
  isTestFixture: true;
  acquire(
    request: ReachFetchRequest & { readonly renderedQuery: string },
  ): Promise<EvidenceSource[]>;
}

export interface ReachSubsystemOptions extends ReachRouterOptions {
  readonly testProvider?: ReachTestProvider;
}

function assertBoundedQueryRequest(
  request: ReachFetchRequest,
): EngineResearchQueryRule {
  if (!request.engineId || !request.engineId.trim()) {
    throw new Error(
      "REACH_ENGINE_ID_REQUIRED: Content Engine identity is required.",
    );
  }

  if (!request.researchContract || request.researchContract.required !== true) {
    throw new Error(
      "REACH_ENGINE_CONTRACT_REQUIRED: Reach only accepts research authorized by a required Content Engine research contract.",
    );
  }

  const expectedProfile = "engine:" + request.engineId;

  if (request.researchContract.agentReachProfile !== expectedProfile) {
    throw new Error(
      "REACH_ENGINE_PROFILE_MISMATCH: expected " +
        expectedProfile +
        ", received " +
        (request.researchContract.agentReachProfile || "missing") +
        ".",
    );
  }

  if (request.callerFloor && request.callerFloor !== "floor00_analyst") {
    throw new Error(
      "REACH_CALLER_NOT_AUTHORIZED: production Reach queries must originate from floor00_analyst.",
    );
  }

  if (!request.queryKind || !request.queryKind.trim()) {
    throw new Error(
      "REACH_QUERY_KIND_REQUIRED: Content Engine query kind is required.",
    );
  }

  if (!request.topic || !request.topic.trim()) {
    throw new Error("REACH_TOPIC_REQUIRED: Research topic is required.");
  }

  const rule = (request.researchContract.queryRules || []).find(
    (candidate) => candidate.queryKind === request.queryKind,
  );

  if (!rule) {
    throw new Error(
      "REACH_QUERY_KIND_NOT_ALLOWED: engine " +
        request.engineId +
        " does not authorize query kind " +
        request.queryKind +
        ".",
    );
  }

  const placeholders = [
    ...rule.queryTemplate.matchAll(/\{([a-zA-Z0-9_]+)\}/g),
  ].map((match) => match[1]);

  const declaredParameters = new Set([
    "topic",
    ...(rule.requiredParameters || []),
  ]);

  for (const suppliedParameter of Object.keys(request.parameters || {})) {
    if (!declaredParameters.has(suppliedParameter)) {
      throw new Error(
        "REACH_QUERY_PARAMETER_NOT_ALLOWED: parameter \"" +
          suppliedParameter +
          "\" is not declared by " +
          rule.queryKind +
          ".",
      );
    }
  }

  for (const placeholder of placeholders) {
    if (!declaredParameters.has(placeholder)) {
      throw new Error(
        "REACH_QUERY_TEMPLATE_INVALID: undeclared template parameter {" +
          placeholder +
          "} in " +
          rule.queryKind +
          ".",
      );
    }
  }

  for (const parameter of rule.requiredParameters || []) {
    const value =
      parameter === "topic"
        ? request.topic
        : request.parameters?.[parameter];

    if (!value || String(value).trim() === "") {
      throw new Error(
        "REACH_QUERY_PARAMETER_REQUIRED: parameter \"" +
          parameter +
          "\" is required for " +
          rule.queryKind +
          ".",
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
    throw new Error(
      "REACH_RENDERED_QUERY_EMPTY: Content Engine query rendered to an empty string.",
    );
  }

  if (rendered.length > 2000) {
    throw new Error(
      "REACH_RENDERED_QUERY_TOO_LARGE: rendered query exceeds 2000 characters.",
    );
  }

  return rendered;
}

export class ReachSubsystem {
  private readonly testProvider?: ReachTestProvider;
  private readonly router: ReachProviderRouter;

  constructor(
    testProviderOrOptions?: ReachTestProvider | ReachSubsystemOptions,
  ) {
    if (
      testProviderOrOptions &&
      "isTestFixture" in testProviderOrOptions
    ) {
      this.testProvider = testProviderOrOptions;
      this.router = new ReachProviderRouter();
      return;
    }

    const options = (testProviderOrOptions || {}) as ReachSubsystemOptions;
    this.testProvider = options.testProvider;
    this.router = new ReachProviderRouter(options);
  }

  async acquireSources(
    request: ReachFetchRequest,
  ): Promise<EvidenceSource[]> {
    const rule = assertBoundedQueryRequest(request);
    const renderedQuery = renderEngineQuery(request, rule);

    if (this.testProvider) {
      const testSources = await this.testProvider.acquire({
        ...request,
        renderedQuery,
      });

      return deduplicateEvidenceSources(
        testSources.map((source) => ({
          ...source,
          extractionMethod: "TEST_FIXTURE" as const,
          sourceStatus: "TEST_FIXTURE" as const,
          provider: "TEST_FIXTURE",
          providerRequestId:
            source.providerRequestId ||
            "test_" + randomUUID().slice(0, 8),
          renderedQuery,
        })),
      );
    }

    const result = await this.router.acquire(
      request,
      renderedQuery,
    );

    return result.sources.map((source) => ({
      ...source,
      renderedQuery: source.renderedQuery || renderedQuery,
    }));
  }
}

export {
  ReachResearchCache,
  deduplicateEvidenceSources,
} from "./ReachCache";

export {
  ReachProviderRouter,
  InMemoryReachTelemetry,
} from "./ReachProviderRouter";

export type {
  ReachResearchMode,
  ReachProviderId,
  ReachProviderCapability,
  ReachProvider,
  ReachProviderRequest,
  ReachProviderResponse,
  ReachProviderHealthSnapshot,
  ReachEvent,
  ReachTelemetrySink,
} from "./ReachContracts";

export {
  SearXNGProvider,
  DecodoFastSearchProvider,
  DecodoWebScrapingProvider,
} from "./ReachProviders";
