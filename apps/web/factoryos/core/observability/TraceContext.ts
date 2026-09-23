/**
 * FactoryOS v3 — Distributed Trace Context & Observability Infrastructure
 * Assimilates WeKnora trace hierarchy:
 * Mission -> Run -> AgentExecution -> SkillExecution -> ToolCall -> ProviderCall -> Artifact
 */

import { randomUUID } from "node:crypto";

export interface TraceContextPayload {
  readonly traceId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly agentId?: string;
  readonly skillId?: string;
  readonly toolInvocationId?: string;
  readonly providerInvocationId?: string;
  readonly artifactId?: string;
  readonly parentTraceId?: string;
  readonly timestamp: string;
  readonly attributes: Record<string, string | number | boolean>;
}

export class TraceContext {
  private payload: TraceContextPayload;

  constructor(payload: Partial<TraceContextPayload> & { missionId: string }) {
    this.payload = {
      traceId: payload.traceId || `trc_${randomUUID().substring(0, 10)}`,
      missionId: payload.missionId,
      runId: payload.runId,
      agentId: payload.agentId,
      skillId: payload.skillId,
      toolInvocationId: payload.toolInvocationId,
      providerInvocationId: payload.providerInvocationId,
      artifactId: payload.artifactId,
      parentTraceId: payload.parentTraceId,
      timestamp: payload.timestamp || new Date().toISOString(),
      attributes: { ...(payload.attributes || {}) },
    };
  }

  public getTraceId(): string {
    return this.payload.traceId;
  }

  public getMissionId(): string {
    return this.payload.missionId;
  }

  public toJSON(): TraceContextPayload {
    return { ...this.payload };
  }

  /**
   * Spawns a child trace context inheriting mission and parent trace identity.
   */
  public createChild(overrides: Partial<TraceContextPayload>): TraceContext {
    return new TraceContext({
      ...this.payload,
      ...overrides,
      parentTraceId: this.payload.traceId,
      traceId: `trc_${randomUUID().substring(0, 10)}`,
      timestamp: new Date().toISOString(),
      attributes: { ...this.payload.attributes, ...(overrides.attributes || {}) },
    });
  }

  /**
   * Serializes trace context for propagation over HTTP headers or event envelopes.
   */
  public serialize(): string {
    return JSON.stringify(this.payload);
  }

  public static deserialize(serialized: string): TraceContext {
    const parsed = JSON.parse(serialized);
    return new TraceContext(parsed);
  }
}
