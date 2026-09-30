/**
 * ShortForge Blender MCP Adapter
 *
 * Production-oriented Node-side adapter for the third-party mcp-for-blender
 * server. The adapter:
 *   - launches the MCP server as an isolated child process;
 *   - performs the MCP initialize handshake;
 *   - discovers the live tool set with tools/list;
 *   - resolves only approved semantic Blender actions to discovered tools;
 *   - blocks arbitrary Python unless explicitly enabled;
 *   - records deterministic request/result digests;
 *   - keeps transport details out of Ascalon's decision contract.
 *
 * IMPORTANT:
 * This file is Node-only. Do not import it into Edge/Cloudflare bundles.
 */

import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadLineInterface } from "node:readline";
import { compileStructuredBlenderAction } from "./BlenderActionScriptCompiler";
import {
  BLENDER_ACTIONS,
  type BlenderActionRequest,
  type BlenderCapabilitySnapshot,
  type BlenderExecutionObservation,
  type BlenderToolDescriptor,
  type BlenderSemanticAction,
  type BlenderActionResolution,
} from "./BlenderMcpContracts";

const DEFAULT_MCP_PACKAGE = "mcp-for-blender==2.1.1";
const DEFAULT_MCP_COMMAND = "uvx";
const DEFAULT_MCP_ARGS = ["--from", DEFAULT_MCP_PACKAGE, "mcp-for-blender"];
const DEFAULT_MCP_PROTOCOL_VERSION = "2025-11-25";
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

interface JsonRpcResponse {
  readonly jsonrpc?: string;
  readonly id?: number | string;
  readonly result?: Record<string, unknown>;
  readonly error?: { code?: number; message: string; data?: unknown };
}

interface PendingRequest {
  readonly resolve: (value: JsonRpcResponse) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface BlenderMcpAdapterConfig {
  readonly enabled: boolean;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly protocolVersion: string;
  readonly requestTimeoutMs: number;
  readonly maxResponseBytes: number;
  readonly allowPythonExecution: boolean;
}

export interface BlenderMcpAdapterStatus {
  readonly enabled: boolean;
  readonly connected: boolean;
  readonly pid?: number;
  readonly protocolVersion?: string;
  readonly serverName?: string;
  readonly serverVersion?: string;
  readonly toolCount: number;
  readonly lastError?: string;
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function envArgs(env = process.env): readonly string[] {
  const raw = env.BLENDER_MCP_ARGS_JSON;
  if (!raw) return DEFAULT_MCP_ARGS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "string")) {
      throw new Error("BLENDER_MCP_ARGS_JSON must be a JSON string array");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Invalid BLENDER_MCP_ARGS_JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function readBlenderMcpConfig(env = process.env): BlenderMcpAdapterConfig {
  const production = env.NODE_ENV === "production";
  const safeMode = production ? "1" : (env.BLENDER_MCP_SAFE_MODE || "1");
  const disableTelemetry = production ? "true" : (env.DISABLE_TELEMETRY || "true");

  return {
    enabled: env.BLENDER_MCP_ENABLED === "true",
    command: env.BLENDER_MCP_COMMAND || DEFAULT_MCP_COMMAND,
    args: env.BLENDER_MCP_ARGS_JSON ? envArgs(env) : DEFAULT_MCP_ARGS,
    cwd: env.BLENDER_MCP_CWD || undefined,
    env: {
      BLENDER_HOST: env.BLENDER_HOST || "localhost",
      BLENDER_PORT: env.BLENDER_PORT || "9876",
      BLENDER_MCP_SAFE_MODE: safeMode,
      DISABLE_TELEMETRY: disableTelemetry,
    },
    protocolVersion: env.BLENDER_MCP_PROTOCOL_VERSION || DEFAULT_MCP_PROTOCOL_VERSION,
    requestTimeoutMs: Number(env.BLENDER_MCP_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS),
    maxResponseBytes: Number(env.BLENDER_MCP_MAX_RESPONSE_BYTES || DEFAULT_MAX_RESPONSE_BYTES),
    allowPythonExecution: env.BLENDER_MCP_ALLOW_PYTHON === "true",
  };
}

function validateToolArguments(
  tool: BlenderMcpToolDescriptor,
  args: Record<string, unknown>,
): string[] {
  const schema = tool.inputSchema;
  if (!schema || typeof schema !== "object") return [];

  const errors: string[] = [];
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (typeof key === "string" && args[key] === undefined) {
      errors.push(`Missing required MCP argument '${key}' for tool '${tool.name}'`);
    }
  }

  const properties =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, unknown>)
      : {};

  for (const [key, definition] of Object.entries(properties)) {
    if (args[key] === undefined || !definition || typeof definition !== "object") continue;
    const type = (definition as Record<string, unknown>).type;
    const value = args[key];

    if (type === "string" && typeof value !== "string") {
      errors.push(`MCP argument '${key}' must be string`);
    } else if (type === "number" && typeof value !== "number") {
      errors.push(`MCP argument '${key}' must be number`);
    } else if (type === "integer" && (!Number.isInteger(value) || typeof value !== "number")) {
      errors.push(`MCP argument '${key}' must be integer`);
    } else if (type === "boolean" && typeof value !== "boolean") {
      errors.push(`MCP argument '${key}' must be boolean`);
    } else if (type === "array" && !Array.isArray(value)) {
      errors.push(`MCP argument '${key}' must be array`);
    } else if (type === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
      errors.push(`MCP argument '${key}' must be object`);
    }

    const enumValues = (definition as Record<string, unknown>).enum;
    if (Array.isArray(enumValues) && !enumValues.some((entry) => Object.is(entry, value))) {
      errors.push(`MCP argument '${key}' has unsupported enum value`);
    }
  }

  return errors;
}

export function resolveBlenderActionAgainstTools(
  action: BlenderSemanticAction,
  tools: readonly BlenderToolDescriptor[],
  allowPythonExecution: boolean,
): BlenderActionResolution {
  const definition = BLENDER_ACTIONS.find((entry) => entry.action === action);
  if (!definition) {
    return { resolved: false, action, reasonCode: "INVALID_ACTION", candidates: [] };
  }

  if (action === "PYTHON_EXECUTE" && !allowPythonExecution) {
    return {
      resolved: false,
      action,
      reasonCode: "PYTHON_DISABLED",
      candidates: [...definition.preferredTools],
    };
  }

  const available = new Set(tools.map((tool) => tool.name));
  const candidates = definition.preferredTools.filter((name) => available.has(name));

  if (candidates.length === 0) {
    return {
      resolved: false,
      action,
      reasonCode: "NO_RUNTIME_TOOL",
      candidates: [...definition.preferredTools],
    };
  }

  if (["ASSET_SEARCH", "ASSET_IMPORT", "ASSET_GENERATE"].includes(action) && candidates.length > 1) {
    return {
      resolved: false,
      action,
      reasonCode: "AMBIGUOUS_TOOL",
      candidates,
    };
  }

  return {
    resolved: true,
    action,
    toolName: candidates[0],
    reasonCode: "RESOLVED",
    candidates,
  };
}

export class BlenderMcpAdapter {
  private readonly config: BlenderMcpAdapterConfig;
  private process?: ChildProcessWithoutNullStreams;
  private readline?: ReadLineInterface;
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private snapshot?: BlenderCapabilitySnapshot;
  private lastError?: string;
  private connected = false;

  constructor(config: BlenderMcpAdapterConfig = readBlenderMcpConfig()) {
    this.config = {
      ...config,
      requestTimeoutMs: Math.max(1000, config.requestTimeoutMs),
      maxResponseBytes: Math.max(1024, config.maxResponseBytes),
    };
  }

  public status(): BlenderMcpAdapterStatus {
    return {
      enabled: this.config.enabled,
      connected: this.connected,
      pid: this.process?.pid,
      protocolVersion: this.snapshot?.protocolVersion,
      serverName: this.snapshot?.serverName,
      serverVersion: this.snapshot?.serverVersion,
      toolCount: this.snapshot?.tools.length || 0,
      lastError: this.lastError,
    };
  }

  public async connect(): Promise<BlenderCapabilitySnapshot> {
    if (!this.config.enabled) {
      throw new Error("Blender MCP is disabled by configuration (BLENDER_MCP_ENABLED=true required)");
    }
    if (this.connected && this.snapshot) return this.snapshot;

    const childEnv = {
      ...process.env,
      ...this.config.env,
      BLENDER_MCP_SAFE_MODE: this.config.env?.BLENDER_MCP_SAFE_MODE || "1",
      DISABLE_TELEMETRY: this.config.env?.DISABLE_TELEMETRY || "true",
    };

    this.process = spawn(this.config.command, [...this.config.args], {
      cwd: this.config.cwd,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", () => {
      // Third-party MCP logs stay off stdout. Keep only a bounded diagnostic bit.
    });

    this.readline = createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });
    this.readline.on("line", (line) => this.onStdoutLine(line));

    this.process.once("error", (error) => {
      this.lastError = error.message;
      this.failAllPending(error);
    });

    this.process.once("exit", (code, signal) => {
      this.connected = false;
      const error = new Error(`Blender MCP process exited (code=${String(code)}, signal=${String(signal)})`);
      this.lastError = error.message;
      this.failAllPending(error);
      this.cleanupProcess();
    });

    try {
      const init = await this.request("initialize", {
        protocolVersion: this.config.protocolVersion,
        capabilities: {},
        clientInfo: {
          name: "ShortForge",
          version: "comms-blender-1.0.0",
        },
      });

      const result = init.result || {};
      const negotiatedProtocol =
        typeof result.protocolVersion === "string"
          ? result.protocolVersion
          : this.config.protocolVersion;

      this.connected = true;

      await this.notify("notifications/initialized", {});

      const descriptors = await this.listAllTools();

      if (descriptors.length === 0) {
        throw new Error("Blender MCP returned an empty tools/list; refusing to treat the server as operational");
      }

      this.snapshot = {
        protocolVersion: negotiatedProtocol,
        serverName:
          result.serverInfo && typeof result.serverInfo === "object"
            ? String((result.serverInfo as Record<string, unknown>).name || "mcp-for-blender")
            : "mcp-for-blender",
        serverVersion:
          result.serverInfo && typeof result.serverInfo === "object"
            ? String((result.serverInfo as Record<string, unknown>).version || "unknown")
            : "unknown",
        tools: descriptors,
        discoveredAt: new Date().toISOString(),
      };

      return this.snapshot;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  public async probe(): Promise<{ healthy: boolean; addonStatus?: unknown; sceneObserved?: boolean; reason?: string }> {
    try {
      const snapshot = await this.connect();
      let addonStatus: unknown;
      let sceneObserved = false;

      if (snapshot.tools.some((tool) => tool.name === "get_addon_status")) {
        const result = await this.request("tools/call", {
          name: "get_addon_status",
          arguments: {},
        });
        addonStatus = result.result || result.error || null;
      }

      if (snapshot.tools.some((tool) => tool.name === "get_scene_info")) {
        const result = await this.request("tools/call", {
          name: "get_scene_info",
          arguments: {},
        });
        sceneObserved = !Boolean(result.result?.isError) && !result.error;
      }

      return {
        healthy: Boolean(sceneObserved),
        addonStatus,
        sceneObserved,
        reason: sceneObserved ? undefined : "Required Blender scene inspection did not complete",
      };
    } catch (error) {
      return {
        healthy: false,
        sceneObserved: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.failAllPending(new Error("Blender MCP connection closed"));
    this.cleanupProcess();
  }

  public getSnapshot(): BlenderCapabilitySnapshot {
    if (!this.snapshot) {
      throw new Error("Blender MCP capability snapshot unavailable; connect first");
    }
    return this.snapshot;
  }

  public resolveAction(action: BlenderSemanticAction): BlenderActionResolution {
    return resolveBlenderActionAgainstTools(
      action,
      this.getSnapshot().tools,
      this.config.allowPythonExecution,
    );
  }

  private async listAllTools(): Promise<BlenderToolDescriptor[]> {
    const all: BlenderToolDescriptor[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.request("tools/list", cursor ? { cursor } : {});
      const listed = Array.isArray(response.result?.tools) ? response.result.tools : [];
      for (const tool of listed) {
        if (!tool || typeof tool !== "object") continue;
        const raw = tool as Record<string, unknown>;
        const name = typeof raw.name === "string" ? raw.name : "";
        if (!name) continue;
        all.push({
          name,
          description: typeof raw.description === "string" ? raw.description : undefined,
          inputSchema:
            raw.inputSchema && typeof raw.inputSchema === "object"
              ? (raw.inputSchema as Record<string, unknown>)
              : undefined,
        });
      }
      cursor = typeof response.result?.nextCursor === "string"
        ? response.result.nextCursor
        : undefined;
    } while (cursor && all.length < 500);

    return all;
  }

  public async execute(request: BlenderActionRequest): Promise<BlenderExecutionObservation> {
    const snapshot = await this.connect();

    const resolution = this.resolveAction(request.action);
    if (!resolution.resolved || !resolution.toolName) {
      throw new Error(
        `Blender action '${request.action}' rejected: ${resolution.reasonCode}; candidates=[${resolution.candidates.join(", ")}]`,
      );
    }

    if (request.action === "PYTHON_EXECUTE" && !request.allowPythonExecution) {
      throw new Error("PYTHON_EXECUTE requires request.allowPythonExecution=true");
    }
    if (request.action === "PYTHON_EXECUTE" && !this.config.allowPythonExecution) {
      throw new Error("PYTHON_EXECUTE disabled by production configuration");
    }

    if (request.action === "ASSET_SEARCH" || request.action === "ASSET_IMPORT" || request.action === "ASSET_GENERATE") {
      const provider = typeof request.arguments.provider === "string"
        ? request.arguments.provider.trim().toLowerCase()
        : "";
      const selected = this.selectProviderTool(request.action, provider, snapshot.tools, request.arguments);
      if (!selected) {
        throw new Error(
          `Blender ${request.action} requires an explicit supported provider; received '${provider || "none"}'`,
        );
      }
      return this.callAndObserve(request, selected, request.arguments);
    }

    const resolvedTool = snapshot.tools.find((tool) => tool.name === resolution.toolName);
    if (!resolvedTool) {
      throw new Error(`Resolved Blender tool '${resolution.toolName}' disappeared from the live capability snapshot`);
    }

    const definition = BLENDER_ACTIONS.find((entry) => entry.action === request.action);
    if (!definition) {
      throw new Error(`Unknown Blender semantic action '${request.action}'`);
    }

    let toolArguments: Record<string, unknown>;
    if (definition.executionMode === "STRUCTURED_SCRIPT") {
      const compiled = compileStructuredBlenderAction(request.action, request.arguments);
      toolArguments = {
        code: compiled.code,
        user_prompt: compiled.userPrompt || request.userPrompt || "",
      };
    } else if (definition.executionMode === "RAW_PYTHON") {
      if (!request.allowPythonExecution || !this.config.allowPythonExecution) {
        throw new Error(
          `Raw Python-backed Blender action '${request.action}' is disabled; explicit Python capability is required`,
        );
      }
      if (typeof request.arguments.code !== "string" || request.arguments.code.trim().length === 0) {
        throw new Error(`Raw Python-backed Blender action '${request.action}' requires arguments.code`);
      }
      toolArguments = {
        code: request.arguments.code,
        user_prompt: request.userPrompt || request.arguments.user_prompt || "",
      };
    } else {
      toolArguments = { ...request.arguments };
    }

    const schemaErrors = validateToolArguments(resolvedTool, toolArguments);
    if (schemaErrors.length > 0) {
      throw new Error(`Blender MCP argument contract rejected: ${schemaErrors.join("; ")}`);
    }

    return this.callAndObserve(request, resolution.toolName, toolArguments);
  }

  private selectProviderTool(
    action: BlenderSemanticAction,
    provider: string,
    tools: readonly BlenderToolDescriptor[],
    args: Record<string, unknown> = {},
  ): string | undefined {
    if (!provider) return undefined;

    const wanted: Record<string, Record<string, string>> = {
      ASSET_SEARCH: {
        polyhaven: "search_polyhaven_assets",
        sketchfab: "search_sketchfab_models",
        polypizza: "search_polypizza_models",
      },
      ASSET_IMPORT: {
        polyhaven: "download_polyhaven_asset",
        sketchfab: "download_sketchfab_model",
        polypizza: "download_polypizza_model",
        hyper3d: "import_generated_asset",
        hunyuan3d: "import_generated_asset_hunyuan",
        tripo: "import_generated_asset_tripo",
      },
      ASSET_GENERATE: {
        hyper3d: "generate_hyper3d_model_via_text",
        hunyuan3d: "generate_hunyuan3d_model",
        tripo: "generate_tripo_model",
      },
    };

    if (action === "ASSET_GENERATE" && provider === "hyper3d") {
      const hasImageInput =
        typeof args.input_image_url === "string" ||
        typeof args.image_url === "string" ||
        Array.isArray(args.images);

      const imageTool = "generate_hyper3d_model_via_images";
      const textTool = "generate_hyper3d_model_via_text";
      if (hasImageInput && tools.some((candidate) => candidate.name === imageTool)) return imageTool;
      if (!hasImageInput && tools.some((candidate) => candidate.name === textTool)) return textTool;
    }

    const tool = wanted[action]?.[provider];
    return tool && tools.some((candidate) => candidate.name === tool) ? tool : undefined;
  }

  private async callAndObserve(
    request: BlenderActionRequest,
    toolName: string,
    toolArguments: Record<string, unknown>,
  ): Promise<BlenderExecutionObservation> {
    const snapshot = this.getSnapshot();
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const requestDigestSha256 = sha256({
      missionId: request.missionId,
      jobId: request.jobId,
      floorId: request.floorId,
      action: request.action,
      arguments: this.redactForDigest(request.arguments),
    });
    const resolvedArgumentsDigestSha256 = sha256(this.redactForDigest(toolArguments));

    const result = await this.request("tools/call", {
      name: toolName,
      arguments: toolArguments,
    });

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - started;
    const isError = Boolean(result.result?.isError);
    const success = !isError && !result.error;

    return {
      action: request.action,
      toolName,
      requestDigestSha256,
      capabilitySnapshotDigestSha256: sha256({
        protocolVersion: snapshot.protocolVersion,
        serverName: snapshot.serverName,
        serverVersion: snapshot.serverVersion,
        tools: snapshot.tools.map((tool) => ({
          name: tool.name,
          inputSchema: tool.inputSchema,
        })),
      }),
      resolvedArgumentsDigestSha256,
      runtimeProtocolVersion: snapshot.protocolVersion,
      runtimeServerVersion: snapshot.serverVersion,
      startedAt,
      completedAt,
      durationMs,
      success,
      isError,
      result: result.result || result.error || null,
      verificationHints: this.verificationHints(request.action, toolName, result.result),
    };
  }

  private redactForDigest(value: unknown): unknown {
    if (typeof value === "string") {
      if (value.length > 2000) {
        return `[REDACTED_LONG_STRING_SHA256:${sha256(value)}]`;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((v) => this.redactForDigest(v));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        out[key.toLowerCase().includes("token") || key.toLowerCase().includes("secret")
          ? "[REDACTED_KEY]"
          : key] = this.redactForDigest(item);
      }
      return out;
    }
    return value;
  }

  private verificationHints(
    action: BlenderSemanticAction,
    toolName: string,
    result?: Record<string, unknown>,
  ): string[] {
    const hints: string[] = [];

    if (action === "SCENE_INSPECT") hints.push("Persist scene inspection as observation evidence.");
    if (action === "VIEWPORT_CAPTURE") hints.push("Verify screenshot corresponds to current Blender file/session.");
    if (action === "OBJECT_CREATE" || action === "OBJECT_UPDATE" || action === "OBJECT_DELETE") {
      hints.push("Re-inspect scene/object state after mutation.");
    }
    if (
      action === "MATERIAL_UPDATE" ||
      action === "CAMERA_CONFIGURE" ||
      action === "LIGHTING_CONFIGURE" ||
      action === "ANIMATION_CONFIGURE" ||
      action === "GEOMETRY_NODES_CONFIGURE"
    ) {
      hints.push("Capture post-mutation scene state and, where visual, a viewport screenshot.");
    }
    if (action === "RENDER") {
      hints.push("Verify physical render artifact exists, metadata matches intent, and SHA-256 is recorded.");
    }
    if (action === "SCENE_EXPORT") {
      hints.push("Verify exported file exists and hash/size are recorded before downstream use.");
    }
    if (action === "PYTHON_EXECUTE") {
      hints.push("Treat execution result as untrusted until the requested state is independently observed.");
    }

    if (result && typeof result === "object" && "content" in result) {
      hints.push(`MCP tool '${toolName}' returned MCP content; semantic success still requires domain verification.`);
    }

    return hints;
  }

  private async request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this.process?.stdin || this.process.killed) {
      throw new Error("Blender MCP process is not running");
    }

    const id = this.nextRequestId++;
    const line = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Blender MCP request timed out: ${method}`));
      }, this.config.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.process!.stdin.write(line + "\n");
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.process?.stdin || this.process.killed) {
      throw new Error("Blender MCP process is not running");
    }
    this.process.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  private onStdoutLine(line: string): void {
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (lineBytes > this.config.maxResponseBytes) {
      const error = new Error("Blender MCP response budget exceeded");
      this.lastError = error.message;
      this.failAllPending(error);
      this.cleanupProcess();
      return;
    }

    let message: JsonRpcResponse;
    try {
      message = JSON.parse(line) as JsonRpcResponse;
    } catch {
      // Stdio MCP must remain machine-readable; ignore non-JSON noise but do not
      // interpret it as a successful response.
      return;
    }

    if (typeof message.id !== "number") {
      // Notifications/server-initiated messages are intentionally ignored by this
      // request/response adapter until a dedicated event bridge is added.
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message);
  }

  private failAllPending(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private cleanupProcess(): void {
    this.readline?.close();
    this.readline = undefined;

    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");
    }
    this.process = undefined;
    // stdout is bounded per JSON response line; no cumulative response counter is required.
  }
}
