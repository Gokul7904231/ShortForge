import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { LightningNotebookAdapter } from "../../../../apps/web/factoryos/core/compute/notebooks/LightningNotebookAdapter.ts";

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