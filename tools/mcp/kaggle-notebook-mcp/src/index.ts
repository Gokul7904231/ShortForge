import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { KaggleNotebookAdapter } from "../../../../apps/web/factoryos/core/compute/notebooks/KaggleNotebookAdapter.ts";
import { probeStreamableHttpMcp } from "../../shared/StreamableHttpMcpClient.ts";

const adapter = new KaggleNotebookAdapter();

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({
  name: "shortforge-kaggle-notebook",
  version: "0.1.0",
  description: "Bounded Kaggle notebook connection diagnostics. No production-worker authority.",
});

server.registerTool(
  "kaggle_connection_check",
  {
    title: "Kaggle connection check",
    description: "Validate configured Kaggle credentials and provider reachability. Credentials are read only from the process environment.",
    inputSchema: z.object({}),
  },
  async () => jsonResult(await adapter.validateCredentials()),
);


server.registerTool(
  "kaggle_official_mcp_check",
  {
    title: "Kaggle official MCP check",
    description:
      "Probe Kaggle's official remote MCP endpoint and report whether the MCP initialize/tools-list handshake succeeds. The optional bearer token is read only from KAGGLE_MCP_TOKEN.",
    inputSchema: z.object({}),
  },
  async () => {
    const token = process.env.KAGGLE_MCP_TOKEN;
    if (!token) {
      return jsonResult({
        provider: "KAGGLE",
        endpoint: "https://www.kaggle.com/mcp",
        status: "UNCONFIGURED",
        verificationLevel: "UNAVAILABLE",
        evidence: [
          "KAGGLE_MCP_TOKEN is not configured.",
          "Kaggle CLI credentials are intentionally not reused as MCP bearer credentials.",
        ],
      });
    }

    return jsonResult(
      await probeStreamableHttpMcp({
        endpoint: "https://www.kaggle.com/mcp",
        headers: { Authorization: "Bearer " + token },
      }),
    );
  },
);

server.registerTool(
  "kaggle_official_mcp_tools",
  {
    title: "Kaggle official MCP tools",
    description:
      "Discover the live tool catalog exposed by Kaggle's official remote MCP server. No tool execution is performed.",
    inputSchema: z.object({}),
  },
  async () => {
    const token = process.env.KAGGLE_MCP_TOKEN;
    if (!token) {
      return jsonResult({
        provider: "KAGGLE",
        endpoint: "https://www.kaggle.com/mcp",
        status: "UNCONFIGURED",
        tools: [],
        evidence: ["Set KAGGLE_MCP_TOKEN to enable live remote MCP discovery."],
      });
    }

    const result = await probeStreamableHttpMcp({
      endpoint: "https://www.kaggle.com/mcp",
      headers: { Authorization: "Bearer " + token },
    });

    return jsonResult({
      provider: "KAGGLE",
      endpoint: result.endpoint,
      status: result.reachable && result.initialized ? "READY" : "UNAVAILABLE",
      protocolVersion: result.protocolVersion,
      tools: result.tools.map(({ name, description }) => ({
        name,
        description,
      })),
      evidence: result.evidence,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });
  },
);

server.registerTool(
  "kaggle_capabilities",
  {
    title: "Kaggle capabilities",
    description: "Return canonical ShortForge Kaggle notebook capability metadata.",
    inputSchema: z.object({}),
  },
  async () => jsonResult(adapter.metadata),
);

void serveStdio(() => server);