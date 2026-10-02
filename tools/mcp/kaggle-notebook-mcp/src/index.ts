import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { KaggleNotebookAdapter } from "../../../../apps/web/factoryos/core/compute/notebooks/KaggleNotebookAdapter.ts";

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
  "kaggle_capabilities",
  {
    title: "Kaggle capabilities",
    description: "Return canonical ShortForge Kaggle notebook capability metadata.",
    inputSchema: z.object({}),
  },
  async () => jsonResult(adapter.metadata),
);

void serveStdio(server);