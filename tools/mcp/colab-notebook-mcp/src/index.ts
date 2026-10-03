import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { ColabNotebookAdapter } from "../../../../apps/web/factoryos/core/compute/notebooks/ColabNotebookAdapter.ts";

const adapter = new ColabNotebookAdapter();

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({
  name: "shortforge-colab-notebook",
  version: "0.1.0",
  description: "Bounded Google Colab runtime connection diagnostics. No production-worker authority.",
});

server.registerTool(
  "colab_connection_check",
  {
    title: "Colab connection check",
    description: "Validate the configured Colab OAuth access token against the runtime-spec endpoint. The token is read only from the process environment.",
    inputSchema: z.object({}),
  },
  async () => jsonResult(await adapter.validateCredentials()),
);

server.registerTool(
  "colab_capabilities",
  {
    title: "Colab capabilities",
    description: "Return canonical ShortForge Colab notebook capability metadata.",
    inputSchema: z.object({}),
  },
  async () => jsonResult(adapter.metadata),
);

void serveStdio(() => server);