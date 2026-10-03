import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { ColabNotebookAdapter } from "../../../../apps/web/factoryos/core/compute/notebooks/ColabNotebookAdapter.ts";
import { ColabBrowserBridgeManager, validateNotebookUrl } from "./ColabBrowserBridge.ts";

const adapter = new ColabNotebookAdapter();
const browserBridge = new ColabBrowserBridgeManager();

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
  "colab_browser_connection_info",
  {
    title: "Colab browser connection info",
    description:
      "Show active local Colab browser-session bridge state without exposing the session token.",
    inputSchema: z.object({
      session_id: z.string().uuid().optional(),
    }),
  },
  async ({ session_id }) =>
    jsonResult({
      provider: "COLAB",
      mode: "BROWSER_BRIDGE",
      sessions: browserBridge.status(session_id),
      evidence: [
        "Local browser bridge is bound to loopback only.",
        "Only https://colab.google.com and https://colab.research.google.com origins are accepted.",
        "Session tokens are kept out of status responses.",
      ],
    }),
);

server.registerTool(
  "colab_open_browser_connection",
  {
    title: "Open Colab browser connection",
    description:
      "Create a bounded local bridge for a Colab browser session. Optionally target an existing Colab notebook URL or select a Google account with authuser. Browser opening is disabled by default.",
    inputSchema: z.object({
      notebook_url: z.string().url().optional(),
      authuser: z.string().regex(/^\\d+$/).optional(),
      open_browser: z.boolean().optional().default(false),
    }),
  },
  async ({ notebook_url, authuser, open_browser }) =>
    jsonResult(
      await browserBridge.open({
        notebookUrl: notebook_url
          ? validateNotebookUrl(notebook_url)
          : undefined,
        authuser,
        openBrowser: open_browser,
      }),
    ),
);

server.registerTool(
  "colab_disconnect_browser_connection",
  {
    title: "Disconnect Colab browser connection",
    description:
      "Disconnect one local Colab browser bridge session while retaining its forensic state.",
    inputSchema: z.object({
      session_id: z.string().uuid(),
    }),
  },
  async ({ session_id }) =>
    jsonResult({
      sessionId: session_id,
      disconnected: browserBridge.disconnect(session_id),
    }),
);

server.registerTool(
  "colab_close_browser_connection",
  {
    title: "Close Colab browser connection",
    description:
      "Close and remove one local Colab browser bridge session and its listening port.",
    inputSchema: z.object({
      session_id: z.string().uuid(),
    }),
  },
  async ({ session_id }) =>
    jsonResult({
      sessionId: session_id,
      closed: await browserBridge.close(session_id),
    }),
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

process.once("SIGINT", () => void browserBridge.closeAll());
process.once("SIGTERM", () => void browserBridge.closeAll());

void serveStdio(() => server);