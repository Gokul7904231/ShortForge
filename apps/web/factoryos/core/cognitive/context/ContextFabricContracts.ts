/**
 * Canonical active working-context contracts.
 *
 * ContextFabric is a working-context boundary, not a policy, security,
 * economic, artifact, verification, or execution authority.
 */

import type { ContextReference, ContextOperationType } from "../CognitiveContracts";

export type ContextEditActor = "SYSTEM" | "CLM_PROPOSAL" | "OPERATOR";

export interface ContextEditBase {
  readonly editId: string;
  readonly baseVersion: number;
  readonly actor: ContextEditActor;
  readonly reason: string;
}

export type ContextEdit =
  | (ContextEditBase & { readonly type: "RETAIN"; readonly reference: ContextReference })
  | (ContextEditBase & { readonly type: "REORDER"; readonly priorityType?: ContextReference["type"] })
  | (ContextEditBase & { readonly type: "OPTIMIZE" });

export interface ContextWorkspace {
  readonly workspaceId: string;
  readonly missionId: string;
  readonly taskId: string;
  readonly version: number;
  readonly contextHash: string;
  readonly activeReferences: ContextReference[];
  readonly totalTokens: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContextFabricSnapshot extends ContextWorkspace {
  readonly health: {
    readonly totalItems: number;
    readonly totalTokens: number;
    readonly staleCount: number;
    readonly redundantCount: number;
    readonly lowConfidenceCount: number;
    readonly healthScore: number;
  };
  readonly recentOperations: ContextOperationType[];
}

export interface ContextFabricSeed {
  readonly missionId: string;
  readonly taskId: string;
  readonly references: ContextReference[];
}
