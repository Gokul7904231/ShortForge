/** ShortForge Selected MCP Fabric — semantic contracts. */
import { createHash } from "node:crypto";

export type SelectedMcpServerId = "playwright" | "comfyui" | "qdrant";
export type McpRisk = "READ_ONLY" | "MUTATING" | "HIGH_RISK" | "CRITICAL";
export type McpTrustClass = "OBSERVATION_UNVERIFIED" | "DERIVED_RETRIEVAL" | "EXECUTION_RESULT";

export interface McpToolDescriptor {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
}
export interface McpCapabilitySnapshot {
  readonly serverId: SelectedMcpServerId;
  readonly protocolVersion: string;
  readonly serverName: string;
  readonly serverVersion: string;
  readonly tools: readonly McpToolDescriptor[];
  readonly discoveredAt: string;
  readonly snapshotDigestSha256: string;
}
export interface McpServerConfig {
  readonly serverId: SelectedMcpServerId;
  readonly enabled: boolean;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string,string>;
  readonly protocolVersion: string;
  readonly requestTimeoutMs: number;
  readonly maxResponseBytes: number;
}
export interface McpActionDefinition {
  readonly serverId: SelectedMcpServerId;
  readonly action: string;
  readonly risk: McpRisk;
  readonly requiredCapability: string;
  readonly preferredTools: readonly string[];
  readonly description: string;
}
export interface McpExecutionRequest {
  readonly serverId: SelectedMcpServerId;
  readonly action: string;
  readonly missionId: string;
  readonly jobId: string;
  readonly floorId: string;
  readonly environment: "development" | "staging" | "production" | "test";
  readonly arguments: Record<string, unknown>;
  readonly guardianAuthorization?: { readonly granted: boolean; readonly certificateId?: string };
}
export interface McpExecutionObservation {
  readonly serverId: SelectedMcpServerId;
  readonly action: string;
  readonly toolName: string;
  readonly requestDigestSha256: string;
  readonly capabilitySnapshotDigestSha256: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly result: unknown;
  readonly trustClass: McpTrustClass;
  readonly verificationRequired: true;
  readonly verificationHints: readonly string[];
}

export const SELECTED_MCP_ACTIONS: readonly McpActionDefinition[] = [
  { serverId:"playwright", action:"BROWSER_NAVIGATE", risk:"READ_ONLY", requiredCapability:"CAP_MCP_PLAYWRIGHT_RESEARCH", preferredTools:["browser_navigate"], description:"Navigate to an allowed research URL." },
  { serverId:"playwright", action:"BROWSER_SNAPSHOT", risk:"READ_ONLY", requiredCapability:"CAP_MCP_PLAYWRIGHT_RESEARCH", preferredTools:["browser_snapshot"], description:"Read the current page accessibility snapshot." },
  { serverId:"playwright", action:"BROWSER_FIND", risk:"READ_ONLY", requiredCapability:"CAP_MCP_PLAYWRIGHT_RESEARCH", preferredTools:["browser_find"], description:"Find text or patterns in the current page snapshot." },
  { serverId:"playwright", action:"BROWSER_CLICK", risk:"MUTATING", requiredCapability:"CAP_MCP_PLAYWRIGHT_INTERACT", preferredTools:["browser_click"], description:"Click an explicitly selected browser target." },

  { serverId:"comfyui", action:"COMFY_SERVER_INFO", risk:"READ_ONLY", requiredCapability:"CAP_MCP_COMFY_READ", preferredTools:["server_info"], description:"Inspect the controlled ComfyUI runtime." },
  { serverId:"comfyui", action:"COMFY_SEARCH_TEMPLATES", risk:"READ_ONLY", requiredCapability:"CAP_MCP_COMFY_READ", preferredTools:["search_templates"], description:"Discover available workflow templates." },
  { serverId:"comfyui", action:"COMFY_VALIDATE_WORKFLOW", risk:"READ_ONLY", requiredCapability:"CAP_MCP_COMFY_READ", preferredTools:["validate_workflow"], description:"Validate a bounded workflow before execution." },
  { serverId:"comfyui", action:"COMFY_UPLOAD_INPUT", risk:"MUTATING", requiredCapability:"CAP_MCP_COMFY_TRANSFORM", preferredTools:["upload_file"], description:"Stage an approved visual input into the target ComfyUI runtime." },
  { serverId:"comfyui", action:"COMFY_TRANSFORM_ASSET", risk:"HIGH_RISK", requiredCapability:"CAP_MCP_COMFY_TRANSFORM", preferredTools:["run_workflow"], description:"Run an approved transformation workflow against a staged visual asset." },
  { serverId:"comfyui", action:"COMFY_WAIT_JOB", risk:"MUTATING", requiredCapability:"CAP_MCP_COMFY_TRANSFORM", preferredTools:["job"], description:"Wait for a bounded ComfyUI transformation job to reach a terminal state." },
  { serverId:"comfyui", action:"COMFY_FETCH_TRANSFORM_OUTPUT", risk:"MUTATING", requiredCapability:"CAP_MCP_COMFY_TRANSFORM", preferredTools:["fetch_outputs"], description:"Copy completed transformation outputs into a bounded artifact directory." },
  { serverId:"comfyui", action:"COMFY_RUN_WORKFLOW", risk:"HIGH_RISK", requiredCapability:"CAP_MCP_COMFY_EXECUTE", preferredTools:["run_workflow"], description:"Run an explicitly approved local workflow." },
  { serverId:"comfyui", action:"COMFY_GENERATE_IMAGE", risk:"HIGH_RISK", requiredCapability:"CAP_MCP_COMFY_EXECUTE", preferredTools:["generate_image"], description:"Generate a visual asset through local ComfyUI." },
  { serverId:"comfyui", action:"COMFY_FETCH_OUTPUTS", risk:"MUTATING", requiredCapability:"CAP_MCP_COMFY_EXECUTE", preferredTools:["fetch_outputs"], description:"Copy completed outputs into a bounded artifact directory." },

  { serverId:"qdrant", action:"MEMORY_FIND", risk:"READ_ONLY", requiredCapability:"CAP_MCP_QDRANT_READ", preferredTools:["qdrant-find"], description:"Retrieve candidate memories from the derived ANN index." },
  { serverId:"qdrant", action:"MEMORY_STORE_DERIVED", risk:"MUTATING", requiredCapability:"CAP_MCP_QDRANT_DERIVED_WRITE", preferredTools:["qdrant-store"], description:"Store a projection-only derived memory." },
];

export function getSelectedMcpAction(serverId:SelectedMcpServerId, action:string) {
  return SELECTED_MCP_ACTIONS.find(x=>x.serverId===serverId && x.action===action);
}
export function resolveSelectedMcpTool(action:McpActionDefinition, tools:readonly McpToolDescriptor[]) {
  const available=new Set(tools.map(t=>t.name));
  return action.preferredTools.find(t=>available.has(t));
}
export function sha256Json(value:unknown):string {
  return createHash("sha256").update(JSON.stringify(value),"utf8").digest("hex");
}
