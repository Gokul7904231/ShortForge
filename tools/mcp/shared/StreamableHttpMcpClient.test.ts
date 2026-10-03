import assert from "node:assert/strict";
import { createServer } from "node:http";
import { probeStreamableHttpMcp } from "./StreamableHttpMcpClient.ts";

async function main() {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    let body = "";
    for await (const chunk of req) body += chunk.toString();
    const request = JSON.parse(body) as { method?: string };

    res.setHeader("content-type", "application/json");
    res.setHeader("mcp-session-id", "test-session-1");

    if (request.method === "initialize") {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "init",
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "test-litserve", version: "0.1.0" },
          },
        }),
      );
      return;
    }

    if (request.method === "notifications/initialized") {
      res.end(JSON.stringify({ jsonrpc: "2.0", result: {} }));
      return;
    }

    if (request.method === "tools/list") {
      assert.equal(req.headers.authorization, "Bearer secret");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "tools",
          result: {
            tools: [
              {
                name: "probe",
                description: "Deterministic MCP probe",
                inputSchema: {
                  type: "object",
                  properties: { value: { type: "string" } },
                },
              },
            ],
          },
        }),
      );
      return;
    }

    res.writeHead(400);
    res.end(JSON.stringify({ error: { message: "unexpected method" } }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const result = await probeStreamableHttpMcp({
      endpoint: `http://127.0.0.1:${address.port}/mcp`,
      headers: { Authorization: "Bearer secret" },
      timeoutMs: 2000,
    });

    assert.equal(result.reachable, true);
    assert.equal(result.initialized, true);
    assert.equal(result.protocolVersion, "2025-06-18");
    assert.equal(result.sessionIdObserved, true);
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0]?.name, "probe");
    assert.equal(result.tools[0]?.description, "Deterministic MCP probe");
    assert.equal(result.endpoint.endsWith("/mcp/"), true);

    console.log("STREAMABLE_HTTP_MCP_CLIENT_TEST_OK");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
