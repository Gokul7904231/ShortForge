/** FactoryOS Wave 5 — Mission Automation & Fleet Orchestration contracts. */

import type { TaskExecutionType } from "../contracts/MissionContracts";

export type AutomationRecipeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type AutomationLaunchMode = "CREATE_ONLY" | "START_MISSION";
export type OrchestrationLaunchState = "PLANNED" | "MATERIALIZED" | "STARTED" | "FAILED";

export interface AutomationRecipeStep {
  readonly stepId: string;
  readonly name: string;
  readonly ownerAgent: string;
  readonly capabilityRequired: string;
  readonly expectedOutputType: string;
  readonly executionType?: TaskExecutionType;
  readonly dependencyStepIds?: readonly string[];
  readonly input?: Record<string, unknown>;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly requiresReview?: boolean;
  readonly workerLane?: string;
}

export interface MissionAutomationRecipe {
  readonly recipeId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string;
  readonly ownerId: string;
  readonly status: AutomationRecipeStatus;
  readonly version: number;
  readonly steps: readonly AutomationRecipeStep[];
  readonly missionDefaults: {
    readonly objective?: string;
    readonly constraints?: readonly string[];
    readonly priority?: number;
    readonly failurePolicy?: "RETRY" | "FAIL_FAST" | "REPLAN" | "PAUSE" | "ESCALATE";
    readonly maxTokens?: number;
    readonly maxCostUsd?: number;
    readonly maxDurationMs?: number;
    readonly maxParallelTasks?: number;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AutomationRecipeCreateInput {
  readonly name: string;
  readonly description?: string;
  readonly steps: readonly AutomationRecipeStep[];
  readonly missionDefaults?: MissionAutomationRecipe["missionDefaults"];
}

export interface AutomationRecipeUpdateInput {
  readonly name?: string;
  readonly description?: string;
  readonly status?: AutomationRecipeStatus;
  readonly steps?: readonly AutomationRecipeStep[];
  readonly missionDefaults?: MissionAutomationRecipe["missionDefaults"];
  readonly expectedVersion?: number;
}

export interface RecipeLaunchInput {
  readonly recipeId: string;
  readonly goal: string;
  readonly inputs?: Record<string, unknown>;
  readonly mode?: AutomationLaunchMode;
  readonly idempotencyKey?: string;
}

export interface RecipeLaunchRecord {
  readonly launchId: string;
  readonly recipeId: string;
  readonly recipeVersion: number;
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly missionId: string;
  readonly taskIds: readonly string[];
  readonly state: OrchestrationLaunchState;
  readonly mode: AutomationLaunchMode;
  readonly idempotencyKey?: string;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly error?: string;
}

export interface FleetActivityRecord {
  readonly activityId: string;
  readonly workspaceId: string;
  readonly missionId?: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly source: string;
  readonly topic: string;
  readonly summary: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
}

export interface FleetActivityFilter {
  readonly missionId?: string;
  readonly agentId?: string;
  readonly topics?: readonly string[];
  readonly cursor?: string;
  readonly limit?: number;
}

export interface FleetActivityPage {
  readonly items: readonly FleetActivityRecord[];
  readonly nextCursor?: string;
}

export interface FleetOrchestrationSnapshot {
  readonly recipes: readonly MissionAutomationRecipe[];
  readonly launches: readonly RecipeLaunchRecord[];
  readonly activity: FleetActivityPage;
}