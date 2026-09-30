/**
 * Ascalon → Blender decision bridge.
 *
 * This is the explicit cognitive-layer API for Blender.
 *
 * Ascalon emits semantic intent. This bridge:
 *   1. validates the semantic action;
 *   2. requires explicit provider selection for multi-provider asset actions;
 *   3. requires Guardian authorization for mutating/high-risk actions;
 *   4. converts the decision into the canonical CapabilityExecutionRequest;
 *   5. executes through CapabilityRegistry — never directly through MCP.
 *
 * Ascalon remains bounded cognition: the bridge does not grant authority.
 */

import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
} from "../../contracts/CapabilityContracts";
import type { ExecutionInitiator } from "../../contracts/FloorProtocolContracts";
import { CapabilityRegistry } from "../../cognitive/CapabilityRegistry";
import {
  BLENDER_ACTIONS,
  type BlenderActionRisk,
  type BlenderSemanticAction,
} from "../../comms/BlenderMcpContracts";

export interface AscalonGuardianAuthorization {
  readonly granted: boolean;
  readonly certificateId: string;
  readonly policyVersion: string;
  readonly grantedAt: string;
}

export interface AscalonBlenderDecision {
  readonly missionId: string;
  readonly jobId: string;
  readonly floorId: string;
  readonly semanticAction: BlenderSemanticAction;
  readonly arguments: Record<string, unknown>;
  readonly provider?: string;
  readonly rationale?: string;
  readonly preconditions?: readonly string[];
  readonly guardianAuthorization?: AscalonGuardianAuthorization;
  readonly environment?: "development" | "staging" | "production" | "test";
  readonly initiatedBy?: ExecutionInitiator;
  readonly userPrompt?: string;
}

export interface AscalonBlenderDecisionValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly actionRisk?: BlenderActionRisk;
  readonly requiresGuardianGate?: boolean;
}

function getAction(action: BlenderSemanticAction) {
  return BLENDER_ACTIONS.find((entry) => entry.action === action);
}

export function validateAscalonBlenderDecision(
  decision: AscalonBlenderDecision,
): AscalonBlenderDecisionValidation {
  const definition = getAction(decision.semanticAction);
  if (!definition) {
    return {
      valid: false,
      errors: [`Unknown Blender semantic action: ${decision.semanticAction}`],
    };
  }

  const errors: string[] = [];

  if (!decision.missionId.trim()) errors.push("missionId is required");
  if (!decision.jobId.trim()) errors.push("jobId is required");
  if (!decision.floorId.trim()) errors.push("floorId is required");

  if (["ASSET_SEARCH", "ASSET_IMPORT", "ASSET_GENERATE"].includes(decision.semanticAction)) {
    if (!decision.provider?.trim()) {
      errors.push("Explicit provider selection is required for multi-provider asset actions");
    }
  }

  if (definition.risk !== "READ_ONLY" || definition.requiresGuardianGate) {
    if (!decision.guardianAuthorization?.granted) {
      errors.push(
        `Guardian authorization is required for Blender action ${decision.semanticAction}`,
      );
    } else if (!decision.guardianAuthorization.certificateId.trim()) {
      errors.push("Guardian authorization certificateId is required");
    }
  }

  if (decision.semanticAction === "PYTHON_EXECUTE") {
    if (!decision.guardianAuthorization?.granted) {
      errors.push("PYTHON_EXECUTE requires an explicit Guardian grant");
    }
    if (decision.arguments.code === undefined) {
      errors.push("PYTHON_EXECUTE requires arguments.code");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    actionRisk: definition.risk,
    requiresGuardianGate: definition.requiresGuardianGate,
  };
}

export class AscalonBlenderDecisionBridge {
  private readonly registry: CapabilityRegistry;

  constructor(registry: CapabilityRegistry = CapabilityRegistry.getInstance()) {
    this.registry = registry;
  }

  public validate(decision: AscalonBlenderDecision): AscalonBlenderDecisionValidation {
    return validateAscalonBlenderDecision(decision);
  }

  public buildCapabilityRequest(
    decision: AscalonBlenderDecision,
  ): CapabilityExecutionRequest<Record<string, unknown>> {
    const validation = this.validate(decision);
    if (!validation.valid) {
      throw new Error(
        `Ascalon Blender decision rejected: ${validation.errors.join("; ")}`,
      );
    }

    const inputData: Record<string, unknown> = {
      action: decision.semanticAction,
      arguments: {
        ...decision.arguments,
        ...(decision.provider ? { provider: decision.provider } : {}),
      },
      allowPythonExecution: decision.semanticAction === "PYTHON_EXECUTE",
      rationale: decision.rationale,
      preconditions: decision.preconditions ? [...decision.preconditions] : [],
      guardianAuthorization: decision.guardianAuthorization,
      userPrompt: decision.userPrompt,
    };

    return {
      requestExecutionId: `ascalon_blender_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`,
      capabilityId: "blender.mcp",
      missionId: decision.missionId,
      jobId: decision.jobId,
      floorId: decision.floorId,
      inputData,
      initiatedBy: decision.initiatedBy || "overseer",
      timestamp: new Date().toISOString(),
      callerRole: "OVERSEER",
      environment: decision.environment || "production",
    };
  }

  public async execute(
    decision: AscalonBlenderDecision,
  ): Promise<CapabilityExecutionResult> {
    const request = this.buildCapabilityRequest(decision);
    const result = await this.registry.execute(request);

    return {
      ...result,
      findings: [
        ...(result.findings || []),
        `Ascalon semantic Blender action: ${decision.semanticAction}`,
        `Guardian certificate: ${decision.guardianAuthorization?.certificateId || "not supplied"}`,
      ],
    };
  }
}
