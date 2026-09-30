/**
 * FactoryOS Frontier v2 — Capability Router
 * Dynamically discovers, scores, and routes capabilities based on permissions, risk, reliability, and cost.
 */

export interface CapabilityTool {
  readonly toolId: string;
  readonly name: string;
  readonly category: "TELEMETRY" | "CODEBASE" | "EXTERNAL_INTEL" | "FLOOR_ACTION" | "DATABASE" | "COMPUTATION";
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly permissionsRequired: string[];
  readonly riskScore: number; // 0.0 (safe read) to 1.0 (destructive kernel)
  readonly averageLatencyMs: number;
  readonly costPerInvocationUsd: number;
  readonly reliabilityScore: number; // 0.0 to 1.0
  readonly requiresGuardianApproval: boolean;
}

export interface CapabilityRoutingRequest {
  readonly taskDescription: string;
  readonly targetCategory?: CapabilityTool["category"];
  readonly maxRiskTolerance?: number;
  readonly callerPermissions: string[];
}

export class CapabilityRouter {
  private registry: Map<string, CapabilityTool> = new Map();

  constructor() {
    this.registerDefaultCapabilities();
  }

  registerTool(tool: CapabilityTool): void {
    this.registry.set(tool.toolId, structuredClone(tool));
  }

  getTool(toolId: string): CapabilityTool | undefined {
    const tool = this.registry.get(toolId);
    return tool ? structuredClone(tool) : undefined;
  }

  routeCapability(request: CapabilityRoutingRequest): {
    selectedTool: CapabilityTool;
    candidatesEvaluated: number;
    rationale: string;
  } {
    const candidates = Array.from(this.registry.values()).filter((tool) => {
      // 1. Permission check
      const hasPermissions = tool.permissionsRequired.every((p) => request.callerPermissions.includes(p));
      if (!hasPermissions) return false;

      // 2. Risk check
      if (request.maxRiskTolerance !== undefined && tool.riskScore > request.maxRiskTolerance) {
        return false;
      }

      // 3. Category match (if requested)
      if (request.targetCategory && tool.category !== request.targetCategory) {
        return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      throw new Error(`No permitted capability tool found for task: "${request.taskDescription}"`);
    }

    // Rank candidates by composite score: reliability - (0.3 * cost) - (0.2 * risk)
    candidates.sort((a, b) => {
      const scoreA = a.reliabilityScore - a.costPerInvocationUsd * 10 - a.riskScore * 0.2;
      const scoreB = b.reliabilityScore - b.costPerInvocationUsd * 10 - b.riskScore * 0.2;
      return scoreB - scoreA;
    });

    const selected = candidates[0];
    return {
      selectedTool: structuredClone(selected),
      candidatesEvaluated: candidates.length,
      rationale: `Selected ${selected.name} (${selected.toolId}) with composite score (reliability: ${selected.reliabilityScore}, risk: ${selected.riskScore}).`,
    };
  }

  private registerDefaultCapabilities(): void {
    this.registerTool({
      toolId: "tool_internal_telemetry",
      name: "Internal Telemetry Inspection",
      category: "TELEMETRY",
      description: "Queries live CPU, memory, queue depths, and floor statuses from World State",
      inputSchema: { floorId: "string" },
      outputSchema: { metrics: "object" },
      permissionsRequired: ["telemetry:read"],
      riskScore: 0.0,
      averageLatencyMs: 5,
      costPerInvocationUsd: 0.0,
      reliabilityScore: 0.99,
      requiresGuardianApproval: false,
    });

    this.registerTool({
      toolId: "tool_agent_reach",
      name: "Agent-Reach External Intelligence",
      category: "EXTERNAL_INTEL",
      description: "Searches GitHub, web documentation, and technical forums for external release issues and bugs",
      inputSchema: { query: "string", domain: "string" },
      outputSchema: { findings: "array" },
      permissionsRequired: ["external:search"],
      riskScore: 0.1,
      averageLatencyMs: 800,
      costPerInvocationUsd: 0.002,
      reliabilityScore: 0.95,
      requiresGuardianApproval: false,
    });

    this.registerTool({
      toolId: "tool_gstack_engineering",
      name: "gstack Codebase Engineering Engine",
      category: "CODEBASE",
      description: "Inspects git diffs, executes test suites, and plans code-level fixes",
      inputSchema: { issueDescription: "string", targetFiles: "array" },
      outputSchema: { plan: "object", diff: "string" },
      permissionsRequired: ["codebase:read", "codebase:write"],
      riskScore: 0.4,
      averageLatencyMs: 2500,
      costPerInvocationUsd: 0.015,
      reliabilityScore: 0.92,
      requiresGuardianApproval: true,
    });

    this.registerTool({
      toolId: "tool_floor_repair_action",
      name: "Floor Transactional Repair Action",
      category: "FLOOR_ACTION",
      description: "Applies atomic transactional floor repairs under Guardian safety gate",
      inputSchema: { floorId: "string", actionType: "string" },
      outputSchema: { success: "boolean" },
      permissionsRequired: ["floor:mutate"],
      riskScore: 0.3,
      averageLatencyMs: 150,
      costPerInvocationUsd: 0.0,
      reliabilityScore: 0.98,
      requiresGuardianApproval: true,
    });
  }
}
