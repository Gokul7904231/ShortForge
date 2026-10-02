import { spawn } from "node:child_process";
import path from "node:path";

const provider = process.env.NOTEBOOK_MCP_PROVIDER;
const providers = {
  KAGGLE: {
    dir: "kaggle-notebook-mcp",
    checkTool: "kaggle_connection_check",
    capabilityTool: "kaggle_capabilities",
  },
  COLAB: {
    dir: "colab-notebook-mcp",
    checkTool: "colab_connection_check",
    capabilityTool: "colab_capabilities",
  },
  LIGHTNING: {
    dir: "lightning-notebook-mcp",
    checkTool: "lightning_connection_check",
    capabilityTool: "lightning_capabilities",
  },
};

function fail(message) {
  throw new Error("NOTEBOOK_MCP_LIVE_FAILED: " + message);
}

function onceMessage(child, timeoutMs, expectedId) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout waiting for JSON-RPC response id " + expectedId));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
      child.off("error", onError);
    }

    function onData(chunk) {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id !== expectedId) continue;
        cleanup();
        if (message.error) {
          reject(
            new Error(
              String(message.error.message || "MCP JSON-RPC error"),
            ),
          );
        } else {
          resolve(message.result || {});
        }
        return;
      }
    }

    function onExit(code, signal) {
      cleanup();
      reject(new Error("MCP process exited code=" + code + " signal=" + signal));
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    child.stdout.on("data", onData);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

async function rpc(child, id, method, params) {
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }) + "\n",
  );
  return onceMessage(child, 60000, id);
}

async function main() {
  if (!provider || !providers[provider]) {
    fail("NOTEBOOK_MCP_PROVIDER must be KAGGLE, COLAB, or LIGHTNING");
  }

  const spec = providers[provider];
  const root = process.cwd();
  const packageDir = path.join(root, "tools", "mcp", spec.dir);
  const tsxCli = path.join(packageDir, "node_modules", "tsx", "dist", "cli.mjs");

  const child = spawn(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: packageDir,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    if (process.env.NOTEBOOK_MCP_DEBUG === "1") {
      process.stderr.write("[mcp] " + chunk);
    }
  });

  try {
    const init = await rpc(
      child,
      1,
      "initialize",
      {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: {
          name: "ShortForgeNotebookLiveVerifier",
          version: "1.0.0",
        },
      },
    );

    if (!init.serverInfo?.name) fail("initialize returned no serverInfo.name");

    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }) + "\n",
    );

    const listed = await rpc(child, 2, "tools/list", {});
    const tools = Array.isArray(listed.tools) ? listed.tools : [];
    const names = tools.map((tool) => tool && tool.name).filter(Boolean);

    if (!names.includes(spec.checkTool)) {
      fail("connection check tool missing from tools/list");
    }
    if (!names.includes(spec.capabilityTool)) {
      fail("capability tool missing from tools/list");
    }

    const capabilityResult = await rpc(child, 3, "tools/call", {
      name: spec.capabilityTool,
      arguments: {},
    });

    if (!Array.isArray(capabilityResult.content) || capabilityResult.content.length === 0) {
      fail("capability tool returned no content");
    }

    const connectionResult = await rpc(child, 4, "tools/call", {
      name: spec.checkTool,
      arguments: {},
    });

    const textParts = (connectionResult.content || [])
      .filter((part) => part && part.type === "text")
      .map((part) => part.text)
      .filter(Boolean);

    if (!textParts.length) fail("connection tool returned no text content");

    let validation;
    try {
      validation = JSON.parse(textParts[0]);
    } catch {
      fail("connection tool did not return JSON validation data");
    }

    if (!validation.authenticated) {
      fail(
        provider +
          " MCP connection check was not authenticated: " +
          textParts[0],
      );
    }

    console.log(
      JSON.stringify(
        {
          provider,
          server: init.serverInfo,
          toolCount: tools.length,
          discoveredTools: names,
          authenticated: true,
          evidence: validation.evidence || [],
        },
        null,
        2,
      ),
    );
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
