import { randomUUID } from "node:crypto";
import type {
  ExternalApiCallResult,
  ExternalApiRequestContext,
} from "./ExternalApiContracts";
import {
  ExternalApiError,
} from "./ExternalApiContracts";

export interface McpToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
}

export interface McpToolResult {
  readonly content?: readonly {
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

function parseSseEvents(text: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];

  for (const block of text.split(/\n\s*\n/)) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (!dataLines.length) continue;

    try {
      const parsed = JSON.parse(dataLines.join("\n"));
      if (parsed && typeof parsed === "object") {
        events.push(parsed);
      }
    } catch {
      // Ignore non-JSON SSE events.
    }
  }

  return events;
}

function parseMcpResponse(text: string): Record<string, unknown> {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new ExternalApiError(
      "perplexity_mcp",
      "Perplexity MCP returned an empty response.",
    );
  }

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  }

  const events = parseSseEvents(trimmed);
  if (events.length) return events[events.length - 1];

  throw new ExternalApiError(
    "perplexity_mcp",
    "Unable to parse Perplexity MCP response.",
  );
}

export class PerplexityMcpClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private sessionId?: string;

  constructor(
    endpoint = process.env.PERPLEXITY_MCP_URL ||
      "https://api.perplexity.ai/mcp",
    apiKey = process.env.PERPLEXITY_API_KEY || "",
  ) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.apiKey = apiKey.trim();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private headers(): Record<string, string> {
    if (!this.apiKey) {
      throw new ExternalApiError(
        "perplexity_mcp",
        "PERPLEXITY_API_KEY is not configured.",
      );
    }

    return {
      Authorization: "Bearer " + this.apiKey,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
    };
  }

  private async rpc<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    context?: ExternalApiRequestContext,
  ): Promise<ExternalApiCallResult<T>> {
    const started = Date.now();
    const id = randomUUID();

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const responseSessionId = response.headers.get("Mcp-Session-Id");
    if (responseSessionId) this.sessionId = responseSessionId;

    const text = await response.text();

    if (!response.ok) {
      throw new ExternalApiError(
        "perplexity_mcp",
        "Perplexity MCP returned HTTP " +
          response.status +
          (text ? ": " + text.slice(0, 500) : ""),
        {
          status: response.status,
          retryable:
            response.status === 429 || response.status >= 500,
        },
      );
    }

    const message = parseMcpResponse(text);

    if (message.error) {
      const error = message.error as Record<string, unknown>;
      throw new ExternalApiError(
        "perplexity_mcp",
        String(error.message || "MCP JSON-RPC error"),
      );
    }

    return {
      providerId: "perplexity_mcp",
      requestId: context?.requestId ?? "mcp_" + randomUUID().slice(0, 12),
      status: response.status,
      durationMs: Date.now() - started,
      data: message.result as T,
    };
  }

  async initialize(
    context?: ExternalApiRequestContext,
  ): Promise<ExternalApiCallResult<unknown>> {
    const result = await this.rpc(
      "initialize",
      {
        protocolVersion:
          process.env.PERPLEXITY_MCP_PROTOCOL_VERSION ||
          "2025-06-18",
        capabilities: {},
        clientInfo: {
          name: "ShortForge",
          version: "external-api-fabric-v1",
        },
      },
      context,
    );

    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Notification is best-effort and has no result to consume.
    }

    return result;
  }

  async listTools(
    context?: ExternalApiRequestContext,
  ): Promise<readonly McpToolDefinition[]> {
    const result = await this.rpc<{
      tools?: readonly McpToolDefinition[];
    }>("tools/list", {}, context);

    return result.data.tools ?? [];
  }

  async callTool(
    name: string,
    arguments_: Record<string, unknown>,
    context?: ExternalApiRequestContext,
  ): Promise<ExternalApiCallResult<McpToolResult>> {
    const result = await this.rpc<McpToolResult>(
      "tools/call",
      {
        name,
        arguments: arguments_,
      },
      context,
    );

    return result;
  }
}
