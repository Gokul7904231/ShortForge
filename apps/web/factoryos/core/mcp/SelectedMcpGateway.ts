/** Selected MCP gateway: Playwright, ComfyUI, Qdrant. Node-only. */
import * as path from "node:path";
import { URL } from "node:url";
import { getSelectedMcpAction, resolveSelectedMcpTool, sha256Json, type McpExecutionObservation, type McpExecutionRequest, type McpServerConfig, type SelectedMcpServerId } from "./McpContracts";
import { StdioMcpAdapter } from "./StdioMcpAdapter";

export interface SelectedMcpConfig {
  readonly enabled:boolean;
  readonly playwright:McpServerConfig & {readonly navigateAllowlist:readonly string[];readonly allowInteraction:boolean};
  readonly comfyui:McpServerConfig & {readonly allowedRoots:readonly string[];readonly licenseMode:"disabled"|"commercial"};
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
      env:{COMFY_PROJECT:env.COMFY_MCP_PROJECT||"",COMFY_BIN:env.COMFY_MCP_BIN||""},protocolVersion:env.COMFY_MCP_PROTOCOL_VERSION||"2025-11-25",
      requestTimeoutMs:positiveInt(env.COMFY_MCP_TIMEOUT_MS,180000),maxResponseBytes:positiveInt(env.COMFY_MCP_MAX_RESPONSE_BYTES,16777216),
      allowedRoots:roots,licenseMode:env.COMFY_MCP_LICENSE_MODE==="commercial"?"commercial":"disabled"},
    qdrant:{serverId:"qdrant",enabled:enabled&&env.QDRANT_MCP_ENABLED==="true",command:env.QDRANT_MCP_COMMAND||"uvx",args:qArgs,cwd:env.QDRANT_MCP_CWD||undefined,
      env:{QDRANT_URL:env.QDRANT_URL||"",QDRANT_API_KEY:env.QDRANT_API_KEY||"",COLLECTION_NAME:collection,QDRANT_LOCAL_PATH:env.QDRANT_LOCAL_PATH||""},
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
export function sanitizeComfyArguments(action:string,input:Record<string,unknown>,roots:readonly string[]):Record<string,unknown>{
  const args={...input};
  if(action==="COMFY_VALIDATE_WORKFLOW"||action==="COMFY_RUN_WORKFLOW"){
    if(typeof args.workflow_path!=="string") throw new Error("comfy_workflow_path_required");
    if(!isPathWithinRoots(args.workflow_path,roots)) throw new Error("comfy_workflow_path_outside_allowlist");
  }
  if(action==="COMFY_FETCH_OUTPUTS"){
    if(typeof args.out_dir!=="string") throw new Error("comfy_output_dir_required");
    if(!isPathWithinRoots(args.out_dir,roots)) throw new Error("comfy_output_dir_outside_allowlist");
  }
  if(action==="COMFY_RUN_WORKFLOW"||action==="COMFY_GENERATE_IMAGE"){
    delete args.confirm_spend; delete args.allow_spend; args.confirm_spend=false;
  }
  return args;
}
export function sanitizeQdrantStoreArguments(input:Record<string,unknown>,collection:string):Record<string,unknown>{
  if(!collection.startsWith("shortforge-derived-")) throw new Error("qdrant_derived_collection_prefix_required");
  if(typeof input.information!=="string"||!input.information.trim()) throw new Error("qdrant_information_required");
  const metadata=input.metadata&&typeof input.metadata==="object"?{...(input.metadata as Record<string,unknown>)}:{};
  if(metadata.canonicalAuthority!==undefined&&metadata.canonicalAuthority!=="memory-fabric") throw new Error("qdrant_store_must_be_memory_fabric_projection");
  return {information:input.information,metadata:{...metadata,projectionOnly:true,canonicalAuthority:"memory-fabric",derivedIndex:"qdrant",indexUpdatedAt:new Date().toISOString()},collection_name:collection};
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

    if(["BROWSER_CLICK","COMFY_RUN_WORKFLOW","COMFY_GENERATE_IMAGE","COMFY_FETCH_OUTPUTS","MEMORY_STORE_DERIVED"].includes(request.action))requireGuardian(request);

    if(request.action==="BROWSER_NAVIGATE"){
      if(typeof request.arguments.url!=="string")throw new Error("browser_url_required");
      if(!isBrowserHostAllowed(request.arguments.url,this.config.playwright.navigateAllowlist))throw new Error("browser_navigation_host_not_allowed");
    }
    if(request.action==="BROWSER_CLICK"&&!this.config.playwright.allowInteraction)throw new Error("browser_interaction_disabled");

    let args={...request.arguments};
    if(request.serverId==="comfyui")args=sanitizeComfyArguments(request.action,args,this.config.comfyui.allowedRoots);
    if(request.serverId==="qdrant"&&request.action==="MEMORY_STORE_DERIVED")args=sanitizeQdrantStoreArguments(args,this.config.qdrant.derivedCollection);
    if(request.serverId==="qdrant"&&request.action==="MEMORY_FIND")args.collection_name=this.config.qdrant.derivedCollection;

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
