/** Selected MCP gateway: Playwright, ComfyUI, Qdrant. Node-only. */
import * as path from "node:path";
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { URL } from "node:url";
import { getSelectedMcpAction, resolveSelectedMcpTool, sha256Json, type McpExecutionObservation, type McpExecutionRequest, type McpServerConfig, type SelectedMcpServerId } from "./McpContracts";
import { StdioMcpAdapter } from "./StdioMcpAdapter";
import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityMetadata,
} from "../contracts/CapabilityContracts";

export interface SelectedMcpConfig {
  readonly enabled:boolean;
  readonly playwright:McpServerConfig & {readonly navigateAllowlist:readonly string[];readonly allowInteraction:boolean};
  readonly comfyui:McpServerConfig & {readonly allowedRoots:readonly string[];readonly licenseMode:"disabled"|"commercial";readonly transformRoot:string};
  readonly qdrant:McpServerConfig & {readonly derivedCollection:string};
}

const csv=(v:string|undefined):readonly string[]=>(v??"").split(",").map(x=>x.trim()).filter(Boolean);
function jsonArgs(v:string|undefined,fallback:readonly string[]):readonly string[]{
  if(!v) return fallback;
  const parsed=JSON.parse(v);
  if(!Array.isArray(parsed)||parsed.some(x=>typeof x!=="string")) throw new Error("mcp_args_json_must_be_string_array");
  return parsed;
}
function positiveInt(v:string|undefined,fallback:number):number{
  const n=Number(v??fallback); return Number.isFinite(n)&&n>=1?Math.floor(n):fallback;
}

export function readSelectedMcpConfig(env:NodeJS.ProcessEnv=process.env):SelectedMcpConfig {
  const production=env.NODE_ENV==="production";
  const enabled=env.SHORTFORGE_SELECTED_MCP_ENABLED==="true";
  const pwVersion=env.PLAYWRIGHT_MCP_VERSION?.trim();
  const pwArgs=env.PLAYWRIGHT_MCP_ARGS_JSON?jsonArgs(env.PLAYWRIGHT_MCP_ARGS_JSON,[]):pwVersion?["-y","@playwright/mcp@"+pwVersion]:[];
  const comfyArgs=jsonArgs(env.COMFY_MCP_ARGS_JSON,[]);
  const qArgs=env.QDRANT_MCP_ARGS_JSON?jsonArgs(env.QDRANT_MCP_ARGS_JSON,[]):["mcp-server-qdrant"];
  const roots=csv(env.COMFY_MCP_ALLOWED_ROOTS);
  const collection=env.QDRANT_DERIVED_COLLECTION?.trim()||"shortforge-derived-memory";
  if(enabled&&production){
    if(env.PLAYWRIGHT_MCP_ENABLED==="true"&&!pwArgs.length) throw new Error("production_requires_pinned_playwright_mcp_args");
    if(env.COMFY_MCP_ENABLED==="true"&&env.COMFY_MCP_LICENSE_MODE!=="commercial") throw new Error("production_comfy_mcp_requires_commercial_license_mode");
  }
  return {
    enabled,
    playwright:{serverId:"playwright",enabled:enabled&&env.PLAYWRIGHT_MCP_ENABLED==="true",command:env.PLAYWRIGHT_MCP_COMMAND||"npx",args:pwArgs,cwd:env.PLAYWRIGHT_MCP_CWD||undefined,
      env:{PLAYWRIGHT_MCP_ALLOWED_HOSTS:env.PLAYWRIGHT_MCP_ALLOWED_HOSTS||"127.0.0.1,localhost",PLAYWRIGHT_MCP_ALLOW_UNRESTRICTED_FILE_ACCESS:"false",PLAYWRIGHT_MCP_BLOCK_SERVICE_WORKERS:"true"},
      protocolVersion:env.PLAYWRIGHT_MCP_PROTOCOL_VERSION||"2025-11-25",requestTimeoutMs:positiveInt(env.PLAYWRIGHT_MCP_TIMEOUT_MS,60000),maxResponseBytes:positiveInt(env.PLAYWRIGHT_MCP_MAX_RESPONSE_BYTES,8388608),
      navigateAllowlist:csv(env.PLAYWRIGHT_MCP_NAV_ALLOWLIST),allowInteraction:env.PLAYWRIGHT_MCP_ALLOW_INTERACTION==="true"},
    comfyui:{serverId:"comfyui",enabled:enabled&&env.COMFY_MCP_ENABLED==="true",command:env.COMFY_MCP_COMMAND||"comfy-mcp",args:comfyArgs,cwd:env.COMFY_MCP_CWD||undefined,
      env:{
        ...(env.COMFY_MCP_PROJECT?{COMFY_PROJECT:env.COMFY_MCP_PROJECT}:{}),
        ...(env.COMFY_MCP_BIN?{COMFY_BIN:env.COMFY_MCP_BIN}:{}),
      },protocolVersion:env.COMFY_MCP_PROTOCOL_VERSION||"2025-11-25",
      requestTimeoutMs:positiveInt(env.COMFY_MCP_TIMEOUT_MS,180000),maxResponseBytes:positiveInt(env.COMFY_MCP_MAX_RESPONSE_BYTES,16777216),
      allowedRoots:roots,transformRoot:path.resolve(env.COMFY_MCP_TRANSFORM_ROOT||path.join(process.cwd(),"data","comfy-transform-runtime")),licenseMode:env.COMFY_MCP_LICENSE_MODE==="commercial"?"commercial":"disabled"},
    qdrant:{serverId:"qdrant",enabled:enabled&&env.QDRANT_MCP_ENABLED==="true",command:env.QDRANT_MCP_COMMAND||"uvx",args:qArgs,cwd:env.QDRANT_MCP_CWD||undefined,
      env:{
        ...(env.QDRANT_URL ? {QDRANT_URL:env.QDRANT_URL} : {}),
        ...(env.QDRANT_API_KEY ? {QDRANT_API_KEY:env.QDRANT_API_KEY} : {}),
        COLLECTION_NAME:collection,
        ...(env.QDRANT_LOCAL_PATH ? {QDRANT_LOCAL_PATH:env.QDRANT_LOCAL_PATH} : {}),
      },
      protocolVersion:env.QDRANT_MCP_PROTOCOL_VERSION||"2025-11-25",requestTimeoutMs:positiveInt(env.QDRANT_MCP_TIMEOUT_MS,30000),maxResponseBytes:positiveInt(env.QDRANT_MCP_MAX_RESPONSE_BYTES,4194304),
      derivedCollection:collection}
  };
}

export function isPathWithinRoots(candidate:string,roots:readonly string[]):boolean{
  if(!roots.length)return false;
  const resolved=path.resolve(candidate);
  return roots.some(root=>{const base=path.resolve(root);const prefix=base.endsWith(path.sep)?base:base+path.sep;return resolved===base||resolved.startsWith(prefix);});
}
export function isBrowserHostAllowed(value:string,allowlist:readonly string[]):boolean{
  let u:URL; try{u=new URL(value);}catch{return false;}
  if(!["http:","https:"].includes(u.protocol)||!allowlist.length)return false;
  const host=u.hostname.toLowerCase();
  return allowlist.some(x=>{const a=x.toLowerCase();return host===a||host.endsWith("."+a);});
}
export function sanitizeComfyArguments(action:string,input:Record<string,unknown>,roots:readonly string[],transformRoot?:string):Record<string,unknown>{
  const args={...input};
  if(action==="COMFY_VALIDATE_WORKFLOW"||action==="COMFY_RUN_WORKFLOW"||action==="COMFY_TRANSFORM_ASSET"){
    if(typeof args.workflow_path!=="string") throw new Error("comfy_workflow_path_required");
    if(!isPathWithinRoots(args.workflow_path,roots)) throw new Error("comfy_workflow_path_outside_allowlist");
  }
  if(action==="COMFY_FETCH_OUTPUTS"||action==="COMFY_FETCH_TRANSFORM_OUTPUT"){
    if(typeof args.out_dir!=="string") throw new Error("comfy_output_dir_required");
    if(!isPathWithinRoots(args.out_dir,roots)) throw new Error("comfy_output_dir_outside_allowlist");
  }
  if(action==="COMFY_RUN_WORKFLOW"||action==="COMFY_GENERATE_IMAGE"){
    delete args.confirm_spend; delete args.allow_spend; args.confirm_spend=false;
  }
  if(action==="COMFY_UPLOAD_INPUT"){
    if(!Array.isArray(args.paths)||args.paths.length===0) throw new Error("comfy_upload_paths_required");
    if(!transformRoot||!args.paths.every(value=>typeof value==="string"&&isPathWithinRoots(value,[transformRoot]))) throw new Error("comfy_upload_path_outside_transform_root");
    args.overwrite=false;
  }
  if(action==="COMFY_WAIT_JOB"){
    if(args.action!=="wait") throw new Error("comfy_wait_action_must_be_wait");
    if(typeof args.prompt_id!=="string"||!args.prompt_id.trim()) throw new Error("comfy_prompt_id_required");
    const timeout=Number(args.timeout_seconds??120);
    if(!Number.isFinite(timeout)||timeout<1||timeout>300) throw new Error("comfy_wait_timeout_out_of_bounds");
    args.timeout_seconds=Math.floor(timeout);
  }
  if(action==="COMFY_TRANSFORM_ASSET"){
    if(!transformRoot||typeof args.recipe_id!=="string"||!args.recipe_id.trim()) throw new Error("comfy_transform_recipe_id_required");
    if(typeof args.workflow_path!=="string"||!isPathWithinRoots(args.workflow_path,[transformRoot])) throw new Error("comfy_transform_workflow_outside_transform_root");
    if(typeof args.workflow_sha256!=="string"||!/^[a-f0-9]{64}$/i.test(args.workflow_sha256)) throw new Error("comfy_transform_workflow_digest_required");
  }
  return args;
}
export function sanitizeQdrantStoreArguments(input:Record<string,unknown>,collection:string):Record<string,unknown>{
  if(!collection.startsWith("shortforge-derived-")) throw new Error("qdrant_derived_collection_prefix_required");
  if(typeof input.information!=="string"||!input.information.trim()) throw new Error("qdrant_information_required");
  const metadata=input.metadata&&typeof input.metadata==="object"?{...(input.metadata as Record<string,unknown>)}:{};
  if(metadata.canonicalAuthority!==undefined&&metadata.canonicalAuthority!=="memory-fabric") throw new Error("qdrant_store_must_be_memory_fabric_projection");
  return {information:input.information,metadata:{...metadata,projectionOnly:true,canonicalAuthority:"memory-fabric",derivedIndex:"qdrant",indexUpdatedAt:new Date().toISOString()}};
}
function requireGuardian(request:McpExecutionRequest):void{
  if(!request.guardianAuthorization?.granted) throw new Error("guardian_authorization_required_for:"+request.action);
  if(!request.guardianAuthorization.certificateId?.trim()) throw new Error("guardian_certificate_required_for:"+request.action);
}
function validatePrimitiveSchema(schema:Record<string,unknown>|undefined,args:Record<string,unknown>):void{
  if(!schema)return;
  const required=Array.isArray(schema.required)?schema.required:[];
  for(const key of required)if(typeof key==="string"&&args[key]===undefined)throw new Error("mcp_required_argument_missing:"+key);
  const properties=schema.properties&&typeof schema.properties==="object"?schema.properties as Record<string,unknown>:{};
  for(const [key,definition] of Object.entries(properties)){
    if(args[key]===undefined||!definition||typeof definition!=="object")continue;
    const type=(definition as Record<string,unknown>).type; const value=args[key];
    if(type==="string"&&typeof value!=="string")throw new Error("mcp_argument_type_invalid:"+key);
    if(type==="number"&&typeof value!=="number")throw new Error("mcp_argument_type_invalid:"+key);
    if(type==="integer"&&(!Number.isInteger(value)||typeof value!=="number"))throw new Error("mcp_argument_type_invalid:"+key);
    if(type==="boolean"&&typeof value!=="boolean")throw new Error("mcp_argument_type_invalid:"+key);
    if(type==="array"&&!Array.isArray(value))throw new Error("mcp_argument_type_invalid:"+key);
    if(type==="object"&&(typeof value!=="object"||value===null||Array.isArray(value)))throw new Error("mcp_argument_type_invalid:"+key);
  }
}

export class SelectedMcpGateway {
  private readonly config:SelectedMcpConfig;
  private readonly adapters:Map<SelectedMcpServerId,StdioMcpAdapter>;
  constructor(config:SelectedMcpConfig=readSelectedMcpConfig()){
    this.config=config;
    this.adapters=new Map([[ "playwright",new StdioMcpAdapter(config.playwright) ],["comfyui",new StdioMcpAdapter(config.comfyui)],["qdrant",new StdioMcpAdapter(config.qdrant)]]);
  }
  status(){return {enabled:this.config.enabled,servers:Array.from(this.adapters.values()).map(x=>x.status())};}
  async execute(request:McpExecutionRequest):Promise<McpExecutionObservation>{
    if(!this.config.enabled)throw new Error("selected_mcp_fabric_disabled");
    const action=getSelectedMcpAction(request.serverId,request.action);
    if(!action)throw new Error("mcp_action_not_registered:"+request.serverId+":"+request.action);

    if(["BROWSER_CLICK","COMFY_RUN_WORKFLOW","COMFY_GENERATE_IMAGE","COMFY_FETCH_OUTPUTS","COMFY_UPLOAD_INPUT","COMFY_TRANSFORM_ASSET","COMFY_WAIT_JOB","COMFY_FETCH_TRANSFORM_OUTPUT","MEMORY_STORE_DERIVED"].includes(request.action))requireGuardian(request);

    if(request.action==="BROWSER_NAVIGATE"){
      if(typeof request.arguments.url!=="string")throw new Error("browser_url_required");
      if(!isBrowserHostAllowed(request.arguments.url,this.config.playwright.navigateAllowlist))throw new Error("browser_navigation_host_not_allowed");
    }
    if(request.action==="BROWSER_CLICK"&&!this.config.playwright.allowInteraction)throw new Error("browser_interaction_disabled");

    let args={...request.arguments};
    if(request.serverId==="comfyui")args=sanitizeComfyArguments(request.action,args,this.config.comfyui.allowedRoots,this.config.comfyui.transformRoot);
    if(request.serverId==="qdrant"&&request.action==="MEMORY_STORE_DERIVED")args=sanitizeQdrantStoreArguments(args,this.config.qdrant.derivedCollection);
    // Qdrant collection identity is bound by the MCP server process environment.
    // Do not pass collection_name: current qdrant-mcp may omit it from the tool schema when a default collection is configured.

    if(request.serverId==="comfyui"&&request.action==="COMFY_TRANSFORM_ASSET"){
      const currentDigest=createHash("sha256").update(fs.readFileSync(args.workflow_path as string)).digest("hex");
      if(currentDigest.toLowerCase()!==(args.workflow_sha256 as string).toLowerCase()) throw new Error("comfy_transform_workflow_digest_mismatch");
    }
    const adapter=this.adapters.get(request.serverId)!;
    const snapshot=await adapter.connect();
    const toolName=resolveSelectedMcpTool(action,snapshot.tools);
    if(!toolName)throw new Error("mcp_runtime_tool_unavailable:"+request.serverId+":"+request.action);
    const descriptor=snapshot.tools.find(x=>x.name===toolName);
    validatePrimitiveSchema(descriptor?.inputSchema,args);

    const startedAt=new Date().toISOString(); const started=Date.now();
    const result=await adapter.callTool(toolName,args);
    return {
      serverId:request.serverId,action:request.action,toolName,
      requestDigestSha256:sha256Json({serverId:request.serverId,action:request.action,missionId:request.missionId,jobId:request.jobId,floorId:request.floorId,arguments:args}),
      capabilitySnapshotDigestSha256:snapshot.snapshotDigestSha256,
      startedAt,completedAt:new Date().toISOString(),durationMs:Date.now()-started,success:true,result,
      trustClass:request.serverId==="qdrant"?(request.action==="MEMORY_FIND"?"DERIVED_RETRIEVAL":"EXECUTION_RESULT"):"OBSERVATION_UNVERIFIED",
      verificationRequired:true,
      verificationHints:[
        "MCP output is untrusted until domain-specific verification.",
        ...(request.serverId==="playwright"?["Web observations can be stale or page-controlled."]:[]),
        ...(request.serverId==="comfyui"?["Visual output must be hashed and physically inspected before F07."]:[]),
        ...(request.serverId==="qdrant"?["Derived ANN retrieval requires canonical Memory Fabric recheck before promotion."]:[])
      ]
    };
  }
  async disconnectAll(){await Promise.all(Array.from(this.adapters.values()).map(x=>x.disconnect()));}
}


type McpCapabilityRequest = CapabilityExecutionRequest<Record<string, unknown>>;
type McpCapabilityResult = CapabilityExecutionResult<Record<string, unknown>>;
type McpCapabilityHandler = (request: McpCapabilityRequest) => Promise<McpCapabilityResult>;

export interface CapabilityRegistrationSink {
  register(metadata: CapabilityMetadata, handler: McpCapabilityHandler): void;
}

function actionInput(request: McpCapabilityRequest): { readonly action?: string; readonly arguments?: Record<string, unknown>; readonly guardianAuthorization?: { granted: boolean; certificateId?: string } } {
  const input = request.inputData;
  const action = typeof input.action === "string" ? input.action : undefined;
  const args = input.arguments && typeof input.arguments === "object"
    ? input.arguments as Record<string, unknown>
    : undefined;
  const guardianAuthorization = input.guardianAuthorization && typeof input.guardianAuthorization === "object"
    ? input.guardianAuthorization as { granted: boolean; certificateId?: string }
    : undefined;
  return { action, arguments: args, guardianAuthorization };
}

async function executeComfyTransformCapability(
  gateway: SelectedMcpGateway,
  request: McpCapabilityRequest,
): Promise<McpCapabilityResult> {
  const input = request.inputData as Record<string, unknown>;
  const sourceAsset = input.sourceAsset;
  const steps = input.steps;
  const guardianCertificateId = typeof input.guardianCertificateId === "string" ? input.guardianCertificateId : "";
  if (!sourceAsset || typeof sourceAsset !== "object" || !Array.isArray(steps) || !guardianCertificateId.trim()) {
    return {
      requestExecutionId: request.requestExecutionId,
      capabilityId: "mcp.comfyui.transform",
      status: "REJECTED",
      error: "Comfy transform capability requires sourceAsset, steps, and guardianCertificateId",
      durationMs: 0,
    };
  }
  const { ComfyVisualTransformEngine } = await import("../visual/ComfyVisualTransformEngine");
  try {
    const result = await new ComfyVisualTransformEngine(gateway).transform({
      missionId: request.missionId,
      jobId: request.jobId,
      floorId: (request.floorId ?? "floor04_media_synthesis") as
        "floor04_media_synthesis" | "floor05_timeline_composition" | "floor06_rendering",
      environment: request.environment ?? "production",
      sourceAsset: sourceAsset as any,
      steps: steps as any,
      guardianCertificateId,
    });
    return {
      requestExecutionId: request.requestExecutionId,
      capabilityId: "mcp.comfyui.transform",
      status: "SUCCESS",
      findings: ["Comfy transformation completed; derived asset remains non-F07-truth until independent verification."],
      outputData: result as any,
      guardianCertificateId,
      durationMs: 0,
    };
  } catch (error) {
    return {
      requestExecutionId: request.requestExecutionId,
      capabilityId: "mcp.comfyui.transform",
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      findings: ["Governed Comfy transform engine failed closed"],
      durationMs: 0,
    };
  }
}

async function executeRegisteredMcp(
  gateway: SelectedMcpGateway,
  request: McpCapabilityRequest,
  capabilityId: string,
  serverId: SelectedMcpServerId,
  defaultFloor: string,
): Promise<McpCapabilityResult> {
  const input = actionInput(request);
  if (!input.action || !input.arguments) {
    return {
      requestExecutionId: request.requestExecutionId,
      capabilityId,
      status: "REJECTED",
      error: "MCP capability requires a semantic action and object arguments",
      findings: ["Malformed selected MCP capability request"],
      durationMs: 0,
    };
  }

  try {
    const observation = await gateway.execute({
      serverId,
      action: input.action,
      missionId: request.missionId,
      jobId: request.jobId,
      floorId: request.floorId ?? defaultFloor,
      environment: request.environment ?? "production",
      arguments: input.arguments,
      guardianAuthorization: input.guardianAuthorization,
    });
    return {
      requestExecutionId: request.requestExecutionId,
      capabilityId,
      status: observation.success ? "SUCCESS" : "FAILED",
      findings: [...observation.verificationHints],
      outputData: { observation },
      guardianCertificateId: input.guardianAuthorization?.certificateId,
      durationMs: observation.durationMs,
    };
  } catch (error) {
    return {
      requestExecutionId: request.requestExecutionId,
      capabilityId,
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      findings: ["Selected MCP gateway execution failed closed"],
      durationMs: 0,
    };
  }
}

export function registerSelectedMcpCapabilities(
  sink: CapabilityRegistrationSink,
): void {
  const config = readSelectedMcpConfig();
  const gateway = new SelectedMcpGateway(config);

  sink.register(
    {
      id: "mcp.playwright.research",
      name: "Playwright MCP Research Gateway",
      version: "1.0.0",
      type: "RESEARCH",
      targetAnomalies: ["RESEARCH_BROWSER_REQUIRED", "WEB_SOURCE_INSPECTION_REQUIRED", "BROWSER_VERIFICATION_REQUIRED"],
      riskLevel: "MEDIUM",
      maxRetries: 1,
      timeoutMs: 60000,
      requiresGuardianGate: false,
      implementationStatus: "EXTERNAL",
      isProductionRoutable: config.playwright.enabled,
      executionClass: "PRODUCTION",
      provider: "microsoft/playwright-mcp",
      runtime: "browser",
      licenseMetadata: { spdx: "Apache-2.0", copyleft: false, commercialPermitted: true },
      provenance: { sourceRepo: "https://github.com/microsoft/playwright-mcp", adoptionMode: "ISOLATED_PROVIDER", documentedAt: "2026-10-01" },
      policy: {
        allowedRoles: ["SYSTEM", "ADMIN", "OVERSEER", "F00_ANALYST", "F01_STRATEGIST", "RESEARCHER"],
        allowedFloors: ["floor00_analyst", "floor01_strategy"],
        environments: ["development", "staging", "production", "test"],
        networkAccess: "RESTRICTED",
        dataAccess: "READ_ONLY",
        secretRequirements: [],
        securityClass: "RESTRICTED",
        commercialUsageAllowed: true,
        auditPolicy: "EVIDENCE_REQUIRED",
      },
      trainingEligibility: "ELIGIBLE",
    },
    async (request) =>
      executeRegisteredMcp(gateway, request, "mcp.playwright.research", "playwright", "floor00_analyst"),
  );

  sink.register(
    {
      id: "mcp.playwright.interact",
      name: "Playwright MCP Guarded Interaction Gateway",
      version: "1.0.0",
      type: "BROWSER",
      targetAnomalies: ["BROWSER_INTERACTION_REQUIRED"],
      riskLevel: "HIGH",
      maxRetries: 1,
      timeoutMs: 60000,
      requiresGuardianGate: true,
      implementationStatus: "EXTERNAL",
      isProductionRoutable: config.playwright.enabled && config.playwright.allowInteraction,
      executionClass: "PRODUCTION",
      provider: "microsoft/playwright-mcp",
      runtime: "browser",
      licenseMetadata: { spdx: "Apache-2.0", copyleft: false, commercialPermitted: true },
      provenance: { sourceRepo: "https://github.com/microsoft/playwright-mcp", adoptionMode: "ISOLATED_PROVIDER", documentedAt: "2026-10-01" },
      policy: {
        allowedRoles: ["SYSTEM", "ADMIN", "OVERSEER", "RESEARCHER"],
        allowedFloors: ["floor00_analyst", "floor01_strategy"],
        environments: ["development", "staging", "test"],
        networkAccess: "RESTRICTED",
        dataAccess: "READ_ONLY",
        secretRequirements: [],
        consentRequirements: ["GUARDIAN_CERTIFICATE"],
        securityClass: "RESTRICTED",
        commercialUsageAllowed: true,
        auditPolicy: "NON_REPUDIATION",
      },
      trainingEligibility: "ELIGIBLE",
    },
    async (request) =>
      executeRegisteredMcp(gateway, request, "mcp.playwright.interact", "playwright", "floor00_analyst"),
  );

  sink.register(
    {
      id: "mcp.comfyui.transform",
      name: "ComfyUI MCP Programmable Visual Transformation Gateway",
      version: "1.0.0",
      type: "VISUAL",
      targetAnomalies: ["VISUAL_TRANSFORM_REQUIRED", "VISUAL_UPSCALE_REQUIRED", "VISUAL_RESTYLE_REQUIRED", "VISUAL_INPAINT_REQUIRED", "VISUAL_OUTPAINT_REQUIRED"],
      riskLevel: "HIGH",
      maxRetries: 1,
      timeoutMs: 300000,
      requiresGuardianGate: true,
      implementationStatus: "EXTERNAL",
      isProductionRoutable: config.comfyui.enabled && config.comfyui.licenseMode === "commercial",
      executionClass: "PRODUCTION",
      provider: "Comfy-Org/comfy-mcp",
      runtime: "python",
      licenseMetadata: { spdx: "AGPL-3.0-or-later OR LicenseRef-Comfy-Commercial", copyleft: true, commercialPermitted: config.comfyui.licenseMode === "commercial" },
      provenance: { sourceRepo: "https://github.com/Comfy-Org/comfy-mcp", adoptionMode: "ISOLATED_PROVIDER", documentedAt: "2026-10-01" },
      policy: {
        allowedRoles: ["SYSTEM", "ADMIN", "OVERSEER", "MEDIA_SYNTHESIZER", "ASSET_REALIZER", "TIMELINE_COMPOSER", "RENDER_ROUTER"],
        allowedFloors: ["floor04_media_synthesis", "floor05_timeline_composition", "floor06_rendering"],
        environments: ["development", "staging", "production", "test"],
        networkAccess: "RESTRICTED",
        dataAccess: "READ_WRITE",
        secretRequirements: [],
        consentRequirements: ["GUARDIAN_CERTIFICATE"],
        securityClass: "RESTRICTED",
        commercialUsageAllowed: config.comfyui.licenseMode === "commercial",
        auditPolicy: "EVIDENCE_REQUIRED",
      },
      trainingEligibility: "ELIGIBLE",
    },
    async (request) => executeComfyTransformCapability(gateway, request),
  );

  sink.register(
    {
      id: "mcp.comfyui.visual",
      name: "ComfyUI MCP Visual Generation Gateway",
      version: "1.0.0",
      type: "VISUAL",
      targetAnomalies: ["VISUAL_GENERATION_REQUIRED", "COMFY_WORKFLOW_FAILURE", "ASSET_GENERATION_FAILURE"],
      riskLevel: "HIGH",
      maxRetries: 2,
      timeoutMs: 180000,
      requiresGuardianGate: true,
      implementationStatus: "EXTERNAL",
      isProductionRoutable: config.comfyui.enabled && config.comfyui.licenseMode === "commercial",
      executionClass: "PRODUCTION",
      provider: "Comfy-Org/comfy-mcp",
      runtime: "python",
      costPerInvocationUsd: 0,
      licenseMetadata: {
        spdx: "AGPL-3.0-or-later OR LicenseRef-Comfy-Commercial",
        copyleft: true,
        commercialPermitted: config.comfyui.licenseMode === "commercial",
      },
      provenance: { sourceRepo: "https://github.com/Comfy-Org/comfy-mcp", adoptionMode: "ISOLATED_PROVIDER", documentedAt: "2026-10-01" },
      policy: {
        allowedRoles: ["SYSTEM", "ADMIN", "OVERSEER", "CREATOR", "MEDIA_SYNTHESIZER", "ASSET_REALIZER", "TIMELINE_COMPOSER", "RENDER_ROUTER"],
        allowedFloors: ["floor03_asset_realization", "floor04_media_synthesis", "floor05_timeline_composition", "floor06_rendering"],
        environments: ["development", "staging", "production", "test"],
        networkAccess: "RESTRICTED",
        dataAccess: "READ_WRITE",
        secretRequirements: [],
        securityClass: "RESTRICTED",
        commercialUsageAllowed: config.comfyui.licenseMode === "commercial",
        auditPolicy: "EVIDENCE_REQUIRED",
      },
      trainingEligibility: "ELIGIBLE",
    },
    async (request) =>
      executeRegisteredMcp(gateway, request, "mcp.comfyui.visual", "comfyui", "floor03_asset_realization"),
  );

  sink.register(
    {
      id: "mcp.qdrant.memory-search",
      name: "Qdrant MCP Memory Search (Derived ANN)",
      version: "1.0.0",
      type: "ANALYSIS",
      targetAnomalies: ["MEMORY_RECALL_REQUIRED", "SEMANTIC_RETRIEVAL_REQUIRED"],
      riskLevel: "LOW",
      maxRetries: 2,
      timeoutMs: 30000,
      requiresGuardianGate: false,
      implementationStatus: "EXTERNAL",
      isProductionRoutable: config.qdrant.enabled,
      executionClass: "PRODUCTION",
      provider: "qdrant/mcp-server-qdrant",
      runtime: "python",
      licenseMetadata: { spdx: "Apache-2.0", copyleft: false, commercialPermitted: true },
      provenance: { sourceRepo: "https://github.com/qdrant/mcp-server-qdrant", adoptionMode: "ISOLATED_PROVIDER", documentedAt: "2026-10-01" },
      policy: {
        allowedRoles: ["SYSTEM", "ADMIN", "OVERSEER", "F00_ANALYST", "F01_STRATEGIST", "CREATOR", "MEDIA_SYNTHESIZER", "ASSET_REALIZER", "TIMELINE_COMPOSER"],
        allowedFloors: ["floor00_analyst", "floor01_strategy", "floor02_scripting", "floor03_asset_realization", "floor04_media_synthesis", "floor05_timeline_composition", "floor06_rendering"],
        environments: ["development", "staging", "production", "test"],
        networkAccess: "RESTRICTED",
        dataAccess: "READ_ONLY",
        secretRequirements: [],
        securityClass: "RESTRICTED",
        commercialUsageAllowed: true,
        auditPolicy: "EVIDENCE_REQUIRED",
      },
      trainingEligibility: "ELIGIBLE",
    },
    async (request) =>
      executeRegisteredMcp(gateway, request, "mcp.qdrant.memory-search", "qdrant", "floor00_analyst"),
  );

  sink.register(
    {
      id: "mcp.qdrant.memory-derived-write",
      name: "Qdrant MCP Memory Derived Projection",
      version: "1.0.0",
      type: "ANALYSIS",
      targetAnomalies: ["MEMORY_INDEX_REFRESH_REQUIRED"],
      riskLevel: "MEDIUM",
      maxRetries: 1,
      timeoutMs: 30000,
      requiresGuardianGate: true,
      implementationStatus: "EXTERNAL",
      isProductionRoutable: false,
      executionClass: "PROTOTYPE",
      provider: "qdrant/mcp-server-qdrant",
      runtime: "python",
      licenseMetadata: { spdx: "Apache-2.0", copyleft: false, commercialPermitted: true },
      provenance: { sourceRepo: "https://github.com/qdrant/mcp-server-qdrant", adoptionMode: "ISOLATED_PROVIDER", documentedAt: "2026-10-01" },
      policy: {
        allowedRoles: ["SYSTEM", "ADMIN", "OVERSEER"],
        allowedFloors: ["floor00_analyst", "floor01_strategy"],
        environments: ["development", "staging", "test"],
        networkAccess: "RESTRICTED",
        dataAccess: "READ_WRITE",
        secretRequirements: [],
        consentRequirements: ["GUARDIAN_CERTIFICATE"],
        securityClass: "RESTRICTED",
        commercialUsageAllowed: true,
        auditPolicy: "NON_REPUDIATION",
      },
      trainingEligibility: "PENDING_REVIEW",
    },
    async (request) =>
      executeRegisteredMcp(gateway, request, "mcp.qdrant.memory-derived-write", "qdrant", "floor00_analyst"),
  );
}
