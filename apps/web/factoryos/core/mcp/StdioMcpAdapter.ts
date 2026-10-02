/** Node-only generic stdio MCP transport for ShortForge's selected servers. */
import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadLineInterface } from "node:readline";
import type { McpCapabilitySnapshot, McpServerConfig, McpToolDescriptor, SelectedMcpServerId } from "./McpContracts";

interface JsonRpcResponse {
  readonly id?: number|string;
  readonly result?: Record<string,unknown>;
  readonly error?: { readonly message:string; readonly code?:number; readonly data?:unknown };
}
interface Pending { readonly resolve:(v:JsonRpcResponse)=>void; readonly reject:(e:Error)=>void; readonly timer:ReturnType<typeof setTimeout>; }

function digest(value:unknown):string {
  return createHash("sha256").update(JSON.stringify(value),"utf8").digest("hex");
}

export interface McpAdapterStatus {
  readonly serverId:SelectedMcpServerId; readonly enabled:boolean; readonly connected:boolean;
  readonly pid?:number; readonly protocolVersion?:string; readonly serverName?:string;
  readonly serverVersion?:string; readonly toolCount:number; readonly lastError?:string;
}

export class StdioMcpAdapter {
  private process?:ChildProcessWithoutNullStreams;
  private readline?:ReadLineInterface;
  private nextRequestId=1;
  private pending=new Map<number,Pending>();
  private snapshot?:McpCapabilitySnapshot;
  private connected=false;
  private lastError?:string;

  constructor(private readonly config:McpServerConfig) {
    if(config.requestTimeoutMs<1000) throw new Error("mcp_request_timeout_too_small");
    if(config.maxResponseBytes<1024) throw new Error("mcp_response_limit_too_small");
  }

  status():McpAdapterStatus {
    return {serverId:this.config.serverId,enabled:this.config.enabled,connected:this.connected,pid:this.process?.pid,
      protocolVersion:this.snapshot?.protocolVersion,serverName:this.snapshot?.serverName,serverVersion:this.snapshot?.serverVersion,
      toolCount:this.snapshot?.tools.length??0,lastError:this.lastError};
  }

  async connect():Promise<McpCapabilitySnapshot> {
    if(!this.config.enabled) throw new Error("mcp_disabled:"+this.config.serverId);
    if(this.connected && this.snapshot) return this.snapshot;

    this.process=spawn(this.config.command,[...this.config.args],{
      cwd:this.config.cwd,env:{...process.env,...(this.config.env??{})},stdio:["pipe","pipe","pipe"],shell:false
    });
    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data",()=>{});
    this.readline=createInterface({input:this.process.stdout,crlfDelay:Infinity});
    this.readline.on("line",line=>this.onStdoutLine(line));
    this.process.once("error",e=>{this.lastError=e.message;this.failAllPending(e);});
    this.process.once("exit",(code,signal)=>{
      this.connected=false;
      const e=new Error("mcp_process_exit:"+this.config.serverId+":code="+String(code)+":signal="+String(signal));
      this.lastError=e.message;this.failAllPending(e);this.cleanupProcess();
    });

    try {
      const init=await this.request("initialize",{
        protocolVersion:this.config.protocolVersion,capabilities:{},
        clientInfo:{name:"ShortForge",version:"selected-mcp-fabric-1.0.0"}
      });
      const result=init.result??{};
      const protocol=typeof result.protocolVersion==="string"?result.protocolVersion:this.config.protocolVersion;
      this.notify("notifications/initialized",{});
      this.connected=true;
      const tools=await this.listTools();
      if(tools.length===0) throw new Error("mcp_empty_tool_set:"+this.config.serverId);
      const info=result.serverInfo&&typeof result.serverInfo==="object"?result.serverInfo as Record<string,unknown>:{};
      this.snapshot={
        serverId:this.config.serverId,protocolVersion:protocol,
        serverName:typeof info.name==="string"?info.name:this.config.serverId,
        serverVersion:typeof info.version==="string"?info.version:"unknown",
        tools,discoveredAt:new Date().toISOString(),
        snapshotDigestSha256:digest({serverId:this.config.serverId,protocolVersion:protocol,serverInfo:info,tools})
      };
      return this.snapshot;
    } catch(e) {
      await this.disconnect(); throw e;
    }
  }

  async callTool(toolName:string,args:Record<string,unknown>):Promise<Record<string,unknown>> {
    await this.connect();
    const response=await this.request("tools/call",{name:toolName,arguments:args});
    if(response.error) throw new Error("mcp_tool_error:"+this.config.serverId+":"+response.error.message);
    if(!response.result) throw new Error("mcp_tool_empty_result:"+toolName);
    return response.result;
  }

  async disconnect():Promise<void> {
    this.connected=false;this.failAllPending(new Error("mcp_connection_closed:"+this.config.serverId));this.cleanupProcess();
  }

  getSnapshot():McpCapabilitySnapshot {
    if(!this.snapshot) throw new Error("mcp_snapshot_unavailable:"+this.config.serverId);
    return this.snapshot;
  }

  private async listTools():Promise<McpToolDescriptor[]> {
    const tools:McpToolDescriptor[]=[]; let cursor:string|undefined;
    do {
      const response=await this.request("tools/list",cursor?{cursor}:{});
      const rows=Array.isArray(response.result?.tools)?response.result.tools:[];
      for(const raw of rows){
        if(!raw||typeof raw!=="object") continue;
        const r=raw as Record<string,unknown>; const name=typeof r.name==="string"?r.name:"";
        if(!name) continue;
        tools.push({name,description:typeof r.description==="string"?r.description:undefined,
          inputSchema:r.inputSchema&&typeof r.inputSchema==="object"?r.inputSchema as Record<string,unknown>:undefined});
      }
      cursor=typeof response.result?.nextCursor==="string"?response.result.nextCursor:undefined;
    } while(cursor&&tools.length<1000);
    return tools;
  }

  private request(method:string,params:Record<string,unknown>):Promise<JsonRpcResponse> {
    if(!this.process?.stdin||this.process.killed) throw new Error("mcp_process_not_running:"+this.config.serverId);
    const id=this.nextRequestId++; const payload=JSON.stringify({jsonrpc:"2.0",id,method,params});
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error("mcp_request_timeout:"+this.config.serverId+":"+method));},this.config.requestTimeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      try{this.process!.stdin.write(payload+"\n");}
      catch(e){clearTimeout(timer);this.pending.delete(id);reject(e instanceof Error?e:new Error(String(e)));}
    });
  }

  private notify(method:string,params:Record<string,unknown>):void {
    if(!this.process?.stdin||this.process.killed) throw new Error("mcp_process_not_running:"+this.config.serverId);
    this.process.stdin.write(JSON.stringify({jsonrpc:"2.0",method,params})+"\n");
  }

  private onStdoutLine(line:string):void {
    if(Buffer.byteLength(line,"utf8")>this.config.maxResponseBytes){
      const e=new Error("mcp_response_budget_exceeded:"+this.config.serverId);
      this.lastError=e.message;this.failAllPending(e);this.cleanupProcess();return;
    }
    let message:JsonRpcResponse;
    try{message=JSON.parse(line) as JsonRpcResponse;}catch{return;}
    if(typeof message.id!=="number") return;
    const pending=this.pending.get(message.id); if(!pending) return;
    clearTimeout(pending.timer);this.pending.delete(message.id);
    if(message.error){pending.reject(new Error(message.error.message));return;}
    pending.resolve(message);
  }

  private failAllPending(error:Error):void {
    for(const [id,p] of this.pending){clearTimeout(p.timer);p.reject(error);this.pending.delete(id);}
  }
  private cleanupProcess():void {
    this.readline?.close();this.readline=undefined;
    if(this.process&&!this.process.killed){try{this.process.kill("SIGTERM");}catch{}}
    this.process=undefined;
  }
}
