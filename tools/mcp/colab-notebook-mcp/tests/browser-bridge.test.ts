import assert from "node:assert/strict";
import { WebSocket } from "ws";
import {
  ColabBrowserBridgeManager,
  validateNotebookUrl,
} from "../src/ColabBrowserBridge.ts";

async function waitFor<T>(
  read: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 2000,
): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for browser bridge state.");
}

async function main() {
  assert.equal(
    validateNotebookUrl(
      "https://colab.research.google.com/drive/example",
    ),
    "https://colab.research.google.com/drive/example",
  );

  assert.equal(
    validateNotebookUrl(
      "https://colab.google.com/github/example/repo/blob/main/notebook.ipynb",
    ),
    "https://colab.google.com/github/example/repo/blob/main/notebook.ipynb",
  );

  assert.throws(
    () => validateNotebookUrl("https://example.com/notebook.ipynb"),
    /COLAB_BROWSER_INVALID_INPUT/,
  );
  assert.throws(
    () => validateNotebookUrl("http://colab.research.google.com/drive/example"),
    /COLAB_BROWSER_INVALID_INPUT/,
  );

  const manager = new ColabBrowserBridgeManager();
  try {
    const session = await manager.open({
      notebookUrl: "https://colab.research.google.com/drive/example",
      authuser: "1",
    });

    assert.equal(session.state, "WAITING_FOR_BROWSER");
    assert.match(session.connectUrl, /#mcpProxyToken=/);
    assert.match(session.connectUrl, /mcpProxyPort=/);
    assert.match(session.connectUrl, /sf_mcp_nonce=/);
    assert.match(session.connectUrl, /authuser=1/);

    const parsed = new URL(session.connectUrl);
    const token = decodeURIComponent(
      new URLSearchParams(parsed.hash.slice(1)).get("mcpProxyToken") || "",
    );
    assert.ok(token.length >= 16);

    const unauthorized = new WebSocket(
      `ws://127.0.0.1:${session.port}?access_token=wrong-token`,
      "mcp",
      { headers: { Origin: "https://example.com" } },
    );
    await new Promise<void>((resolve) => {
      unauthorized.once("close", () => resolve());
      unauthorized.once("error", () => resolve());
    });
    assert.equal(manager.status(session.sessionId)[0]?.state, "WAITING_FOR_BROWSER");

    const authorized = new WebSocket(
      `ws://127.0.0.1:${session.port}?access_token=${encodeURIComponent(token)}`,
      "mcp",
      { headers: { Origin: "https://colab.google.com" } },
    );
    await new Promise<void>((resolve, reject) => {
      authorized.once("open", () => resolve());
      authorized.once("error", reject);
    });

    const connected = await waitFor(
      () => manager.status(session.sessionId)[0],
      (value) => value?.state === "CONNECTED",
    );
    assert.equal(connected?.state, "CONNECTED");

    authorized.send(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    );

    const seen = await waitFor(
      () => manager.status(session.sessionId)[0],
      (value) => value?.lastMethodSeen === "initialize",
    );
    assert.equal(seen?.lastMethodSeen, "initialize");

    authorized.close();
    await waitFor(
      () => manager.status(session.sessionId)[0],
      (value) => value?.state === "DISCONNECTED",
    );

    const second = await manager.open();
    assert.notEqual(second.sessionId, session.sessionId);
    assert.notEqual(second.port, session.port);

    const closed = await manager.close(session.sessionId);
    assert.equal(closed, true);
    assert.equal(manager.status(session.sessionId).length, 0);

    await manager.closeAll();
    assert.equal(manager.status().length, 0);

    console.log("COLAB_BROWSER_BRIDGE_TEST_OK");
  } finally {
    await manager.closeAll();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
