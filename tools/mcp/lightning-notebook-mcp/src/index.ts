import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { LightningNotebookAdapter } from "../../../../apps/web/factoryos/core/compute/notebooks/LightningNotebookAdapter.ts";
import { probeStreamableHttpMcp } from "../../shared/StreamableHttpMcpClient.ts";

const adapter = new LightningNotebookAdapter();

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({
  name: "shortforge-lightning-notebook",
  version: "0.1.0",
  description: "Bounded Lightning AI Studio connection diagnostics. No production-worker authority.",
});

server.registerTool(
  "lightning_connection_check",
  {
    title: "Lightning connection check",
    description: "Validate configured Lightning credentials using the provider CLI. Credentials are read only from the process environment.",
    inputSchema: z.object({}),
  },
  async () => jsonResult(await adapter.validateCredentials()),
);


function litServeMcpAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (process.env.LIGHTNING_LITSERVE_MCP_TOKEN) {
    headers.Authorization = "Bearer " + process.env.LIGHTNING_LITSERVE_MCP_TOKEN;
  }
  if (process.env.LIGHTNING_LITSERVE_API_KEY) {
    headers["X-API-Key"] = process.env.LIGHTNING_LITSERVE_API_KEY;
  }
  return headers;
}

server.registerTool(
  "lightning_litserve_mcp_check",
  {
    title: "Lightning LitServe MCP check",
    description:
      "Probe a configured LitServe MCP endpoint with the Streamable HTTP initialize/tools-list handshake. Set LIGHTNING_LITSERVE_MCP_URL. Optional bearer/API-key credentials are read only from the process environment.",
    inputSchema: z.object({}),
  },
  async () => {
    const endpoint = process.env.LIGHTNING_LITSERVE_MCP_URL?.trim();
    if (!endpoint) {
      return jsonResult({
        provider: "LIGHTNING",
        status: "UNCONFIGURED",
        verificationLevel: "UNAVAILABLE",
        evidence: [
          "LIGHTNING_LITSERVE_MCP_URL is not configured.",
          "This check targets a LitServe MCP endpoint, not the Lightning Studio control plane.",
        ],
      });
    }

    return jsonResult(
      await probeStreamableHttpMcp({
        endpoint,
        headers: litServeMcpAuthHeaders(),
      }),
    );
  },
);

server.registerTool(
  "lightning_litserve_mcp_tools",
  {
    title: "Lightning LitServe MCP tools",
    description:
      "Discover tools published by a configured LitServe MCP endpoint. No remote tool execution is performed.",
    inputSchema: z.object({}),
  },
  async () => {
    const endpoint = process.env.LIGHTNING_LITSERVE_MCP_URL?.trim();
    if (!endpoint) {
      return jsonResult({
        provider: "LIGHTNING",
        status: "UNCONFIGURED",
        tools: [],
        evidence: [
          "Set LIGHTNING_LITSERVE_MCP_URL to enable live LitServe MCP discovery.",
        ],
      });
    }

    const result = await probeStreamableHttpMcp({
      endpoint,
      headers: litServeMcpAuthHeaders(),
    });

    return jsonResult({
      provider: "LIGHTNING",
      endpoint: result.endpoint,
      status: result.reachable && result.initialized ? "READY" : "UNAVAILABLE",
      protocolVersion: result.protocolVersion,
      tools: result.tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
      evidence: result.evidence,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });
  },
);

server.registerTool(
  "lightning_capabilities",
  {
    title: "Lightning capabilities",
    description: "Return canonical ShortForge Lightning notebook capability metadata.",
    inputSchema: z.object({}),
  },
  async () => jsonResult(adapter.metadata),
);

void serveStdio(() => server);