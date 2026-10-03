import { randomUUID } from "node:crypto";

export interface RemoteMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RemoteMcpProbeOptions {
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface RemoteMcpProbeResult {
  endpoint: string;
  reachable: boolean;
  initialized: boolean;
  protocolVersion?: string;
  statusCode?: number;
  redirected?: boolean;
  sessionIdObserved: boolean;
  tools: RemoteMcpTool[];
  evidence: string[];
  errorCode?: string;
  errorMessage?: string;
}

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

function normalizeEndpoint(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("MCP_ENDPOINT_INVALID: endpoint must use HTTP or HTTPS.");
  }
  if (url.pathname === "/mcp") url.pathname = "/mcp/";
  return url.toString();
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

async function postJsonRpc(
  endpoint: string,
  method: string,
  id: string | number | undefined,
  params: Record<string, unknown> | undefined,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{
  response: Response;
  payload: any;
  sessionId?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
    };
    if (id !== undefined) body.id = id;
    if (params !== undefined) body.params = params;

    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": DEFAULT_PROTOCOL_VERSION,
        ...headers,
      },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    let payload: any;
    if (contentType.includes("text/event-stream")) {
      const events = text
        .split(/\r?\n\r?\n/)
        .flatMap((event) =>
          event
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim()),
        )
        .filter(Boolean);

      payload = events.length ? JSON.parse(events[events.length - 1]) : undefined;
    } else {
      payload = text ? JSON.parse(text) : undefined;
    }

    return {
      response,
      payload,
      sessionId:
        response.headers.get("mcp-session-id") ||
        response.headers.get("Mcp-Session-Id") ||
        undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeStreamableHttpMcp(
  options: RemoteMcpProbeOptions,
): Promise<RemoteMcpProbeResult> {
  const endpoint = normalizeEndpoint(options.endpoint);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const headers = { ...(options.headers || {}) };
  const evidence: string[] = [];

  if (headers.Authorization) {
    evidence.push("Bearer authorization supplied from process environment.");
  }
  if (headers["X-API-Key"]) {
    evidence.push("X-API-Key authorization supplied from process environment.");
  }

  let sessionId: string | undefined;

  try {
    const initialize = await postJsonRpc(
      endpoint,
      "initialize",
      randomUUID(),
      {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "shortforge-provider-mcp-probe",
          version: "0.1.0",
        },
      },
      headers,
      timeoutMs,
    );

    sessionId = initialize.sessionId;

    if (!initialize.response.ok) {
      return {
        endpoint,
        reachable: true,
        initialized: false,
        statusCode: initialize.response.status,
        redirected: initialize.response.redirected,
        sessionIdObserved: Boolean(sessionId),
        tools: [],
        evidence,
        errorCode: "REMOTE_MCP_INITIALIZE_FAILED",
        errorMessage:
          typeof initialize.payload?.error?.message === "string"
            ? initialize.payload.error.message.slice(0, 500)
            : "Remote MCP initialize request returned HTTP " + initialize.response.status,
      };
    }

    if (initialize.payload?.error) {
      return {
        endpoint,
        reachable: true,
        initialized: false,
        protocolVersion:
          initialize.payload?.result?.protocolVersion ||
          DEFAULT_PROTOCOL_VERSION,
        statusCode: initialize.response.status,
        redirected: initialize.response.redirected,
        sessionIdObserved: Boolean(sessionId),
        tools: [],
        evidence,
        errorCode: "REMOTE_MCP_INITIALIZE_ERROR",
        errorMessage: String(initialize.payload.error.message || "MCP initialize error").slice(
          0,
          500,
        ),
      };
    }

    evidence.push("Remote MCP initialize handshake succeeded.");

    const commonHeaders: Record<string, string> = { ...headers };
    if (sessionId) commonHeaders["Mcp-Session-Id"] = sessionId;

    // Stateless servers may not return a session id. A notifications/initialized
    // message is harmless for implementations that accept the standard handshake.
    try {
      await postJsonRpc(
        endpoint,
        "notifications/initialized",
        undefined,
        undefined,
        commonHeaders,
        timeoutMs,
      );
    } catch {
      // Some stateless servers don't require or accept notifications/initialized.
    }

    const toolsResult = await postJsonRpc(
      endpoint,
      "tools/list",
      randomUUID(),
      {},
      commonHeaders,
      timeoutMs,
    );

    if (!toolsResult.response.ok) {
      return {
        endpoint,
        reachable: true,
        initialized: true,
        protocolVersion:
          initialize.payload?.result?.protocolVersion ||
          DEFAULT_PROTOCOL_VERSION,
        statusCode: toolsResult.response.status,
        redirected: toolsResult.response.redirected,
        sessionIdObserved: Boolean(sessionId),
        tools: [],
        evidence: [
          ...evidence,
          "MCP endpoint was reachable, but tools/list returned HTTP " +
            toolsResult.response.status +
            ".",
        ],
        errorCode: "REMOTE_MCP_TOOLS_LIST_FAILED",
        errorMessage:
          typeof toolsResult.payload?.error?.message === "string"
            ? toolsResult.payload.error.message.slice(0, 500)
            : "tools/list failed.",
      };
    }

    if (toolsResult.payload?.error) {
      return {
        endpoint,
        reachable: true,
        initialized: true,
        protocolVersion:
          initialize.payload?.result?.protocolVersion ||
          DEFAULT_PROTOCOL_VERSION,
        statusCode: toolsResult.response.status,
        redirected: toolsResult.response.redirected,
        sessionIdObserved: Boolean(sessionId),
        tools: [],
        evidence,
        errorCode: "REMOTE_MCP_TOOLS_LIST_ERROR",
        errorMessage: String(
          toolsResult.payload.error.message || "tools/list error",
        ).slice(0, 500),
      };
    }

    const tools = Array.isArray(toolsResult.payload?.result?.tools)
      ? (toolsResult.payload.result.tools as RemoteMcpTool[])
      : [];

    evidence.push("Remote MCP tools/list succeeded.");
    evidence.push("Discovered " + tools.length + " remote MCP tools.");

    return {
      endpoint,
      reachable: true,
      initialized: true,
      protocolVersion:
        initialize.payload?.result?.protocolVersion ||
        DEFAULT_PROTOCOL_VERSION,
      statusCode: toolsResult.response.status,
      redirected: toolsResult.response.redirected,
      sessionIdObserved: Boolean(sessionId || toolsResult.sessionId),
      tools,
      evidence,
    };
  } catch (error) {
    const message = safeErrorMessage(error);
    const code =
      error instanceof Error && error.name === "AbortError"
        ? "REMOTE_MCP_TIMEOUT"
        : "REMOTE_MCP_NETWORK_ERROR";

    return {
      endpoint,
      reachable: false,
      initialized: false,
      sessionIdObserved: Boolean(sessionId),
      tools: [],
      evidence,
      errorCode: code,
      errorMessage: message,
    };
  }
}
