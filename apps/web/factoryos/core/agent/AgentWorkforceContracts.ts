/**
 * FactoryOS Wave 3 — Agent Workforce & Access Contracts
 *
 * Workspace-scoped agents are durable product identities.
 * They are not execution authorities and never contain raw credentials.
 */

export type AgentWorkforceStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type AgentWorkforceRole = "OWNER" | "EDITOR" | "USER";

export interface AgentWorkforceMember {
  readonly principalId: string;
  readonly role: AgentWorkforceRole;
  readonly addedAt: string;
  readonly addedBy: string;
  readonly active: boolean;
}

export interface AgentIntegrationBinding {
  readonly integrationId: string;
  readonly provider: string;
  readonly connectionRef: string;
  readonly scope: string;
  readonly status: "CONNECTED" | "PENDING" | "DISCONNECTED";
}

export interface AgentWorkforceProfile {
  readonly agentId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string;
  readonly role: string;
  readonly specialization: string;
  readonly status: AgentWorkforceStatus;
  readonly creatorId: string;
  readonly members: AgentWorkforceMember[];
  readonly allowedCapabilities: readonly string[];
  readonly allowedToolIds: readonly string[];
  readonly preferredModel?: {
    readonly providerId: string;
    readonly modelId: string;
  };
  readonly systemPrompt?: string;
  readonly responseMode: "JOINS_CONVERSATION" | "MENTION_ONLY";
  readonly integrations: readonly AgentIntegrationBinding[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface AgentWorkforceCreateInput {
  readonly name: string;
  readonly description?: string;
  readonly role: string;
  readonly specialization?: string;
  readonly allowedCapabilities?: string[];
  readonly allowedToolIds?: string[];
  readonly preferredModel?: { providerId: string; modelId: string };
  readonly systemPrompt?: string;
  readonly responseMode?: "JOINS_CONVERSATION" | "MENTION_ONLY";
}

export interface AgentWorkforceUpdateInput {
  readonly name?: string;
  readonly description?: string;
  readonly role?: string;
  readonly specialization?: string;
  readonly status?: AgentWorkforceStatus;
  readonly allowedCapabilities?: string[];
  readonly allowedToolIds?: string[];
  readonly preferredModel?: { providerId: string; modelId: string };
  readonly systemPrompt?: string;
  readonly responseMode?: "JOINS_CONVERSATION" | "MENTION_ONLY";
  readonly expectedVersion?: number;
}

export interface AgentWorkforceGrantInput {
  readonly principalId: string;
  readonly role: AgentWorkforceRole;
}

export interface AgentWorkforceSnapshot {
  readonly workspaceId: string;
  readonly agents: AgentWorkforceProfile[];
}
