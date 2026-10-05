import { createHash, randomUUID } from "node:crypto";
import type { EvidenceSource } from "../../contracts/ResearchPassportContracts";
import type {
  ReachProvider,
  ReachProviderRequest,
  ReachProviderResponse,
} from "../../research/ReachContracts";
import { ReachProviderError } from "../../research/ReachContracts";
import { PerplexityMcpClient } from "./PerplexityMcpClient";

function hash(value: string): string {
  return createHash("sha256").update(value || "", "utf8").digest("hex");
}

function urlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]}>,]+/g) ?? [];
  return [...new Set(matches)];
}

export class PerplexityReachProvider implements ReachProvider {
  readonly id = "PERPLEXITY_MCP" as const;
  readonly capabilities = ["SEARCH"] as const;

  private readonly client: PerplexityMcpClient;

  constructor(client = new PerplexityMcpClient()) {
    this.client = client;
  }

  async search(
    input: ReachProviderRequest,
  ): Promise<ReachProviderResponse> {
    if (!this.client.isConfigured()) {
      throw new ReachProviderError(
        "PERPLEXITY_API_KEY is not configured.",
      );
    }

    const requestId = "perplexity_" + randomUUID().slice(0, 8);
    const started = Date.now();

    try {
      await this.client.initialize();

      const tools = await this.client.listTools();
      const searchTool = tools.find(
        (tool) => tool.name === "perplexity_search",
      );

      if (!searchTool) {
        throw new ReachProviderError(
          "Perplexity MCP does not expose perplexity_search.",
        );
      }

      const result = await this.client.callTool(
        "perplexity_search",
        {
          query: input.renderedQuery,
        },
      );

      if (result.data.isError) {
        throw new ReachProviderError(
          "Perplexity MCP perplexity_search returned an error.",
        );
      }

      const text = (result.data.content ?? [])
        .map((item) => item.text ?? "")
        .filter(Boolean)
        .join("\n");

      const urls = urlsFromText(text);
      const maxSources = Math.min(
        Math.max(Number(input.request.maxSources ?? 5), 1),
        20,
      );

      const sources: EvidenceSource[] = urls
        .slice(0, maxSources)
        .map((url) => ({
          id: "src_" + randomUUID().slice(0, 8),
          url,
          title: "Perplexity search result",
          publisher: "Perplexity",
          retrievedAt: new Date().toISOString(),
          extractionMethod: "API_FEED" as const,
          snippet: text.slice(0, 600),
          reliabilityScore: 0.75,
          contentHash: hash(text),
          sourceStatus: "ONLINE" as const,
          provider: this.id,
          providerRequestId: requestId,
          renderedQuery: input.renderedQuery,
        }));

      if (!sources.length && text) {
        throw new ReachProviderError(
          "Perplexity MCP returned research text without extractable source URLs; evidence was not fabricated.",
        );
      }

      return {
        provider: this.id,
        capability: "SEARCH",
        sources,
        requestId,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (error instanceof ReachProviderError) throw error;
      throw new ReachProviderError(
        error instanceof Error ? error.message : String(error),
        { retryable: true },
      );
    }
  }
}
