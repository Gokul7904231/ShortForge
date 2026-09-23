/**
 * FactoryOS v3 — Agent Runtime Harness
 * Authoritative runtime harness managing agent sessions, capability boundaries,
 * execution budgets, and checkpointing.
 */

import { randomUUID } from "node:crypto";
import type {
  AgentIdentity,
  AgentSession,
  ExecutionBudget,
  AgentInvocationRequest,
  AgentInvocationResult,
  AgentSessionCheckpoint,
} from "./AgentRuntimeContracts";
import { TraceContext } from "../observability/TraceContext";

export class AgentRuntime {
  private activeSessions: Map<string, AgentSession> = new Map();

  /**
   * Initializes a supervised agent session with execution boundaries and budget.
   */
  public createSession(
    agent: AgentIdentity,
    missionId: string,
    budget: ExecutionBudget
  ): AgentSession {
    const sessionId = `sess_${agent.agentId}_${randomUUID().substring(0, 8)}`;
    const now = new Date().toISOString();
    const expiresAt = Date.now() + budget.maxDurationMs;

    const traceContext = new TraceContext({
      missionId,
      agentId: agent.agentId,
      attributes: {
        sessionId,
        role: agent.role,
        authorityLevel: agent.authorityLevel,
      },
    });

    const session: AgentSession = {
      sessionId,
      missionId,
      agent,
      budget,
      status: "INITIALIZED",
      checkpoints: [],
      traceContext,
      startedAt: now,
      expiresAt,
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Records a deterministic state checkpoint during session execution.
   */
  public checkpointSession(
    sessionId: string,
    stepIndex: number,
    stateSnapshot: Record<string, unknown>
  ): AgentSessionCheckpoint {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    const checkpoint: AgentSessionCheckpoint = {
      checkpointId: `chk_${sessionId}_step${stepIndex}_${randomUUID().substring(0, 6)}`,
      stepIndex,
      stateSnapshot: structuredClone(stateSnapshot),
      timestamp: new Date().toISOString(),
    };

    session.checkpoints.push(checkpoint);
    return checkpoint;
  }

  /**
   * Executes a bound agent task within budget constraints and capability gates.
   */
  public async executeTask<TInput = Record<string, unknown>, TOutput = Record<string, unknown>>(
    request: AgentInvocationRequest<TInput>,
    executor: (payload: TInput, trace: TraceContext) => Promise<TOutput>
  ): Promise<AgentInvocationResult<TOutput>> {
    const start = Date.now();
    const session = request.session;
    const trace = session.traceContext.createChild({
      toolInvocationId: request.requiredCapability,
      attributes: { taskName: request.taskName },
    });

    // 1. Lease / Budget Timeout Check
    if (Date.now() > session.expiresAt) {
      return {
        status: "TIMEOUT",
        error: `Agent session expired. Budget limit of ${session.budget.maxDurationMs}ms exceeded.`,
        durationMs: Date.now() - start,
        traceId: trace.getTraceId(),
      };
    }

    // 2. Capability Gate Check
    if (!session.agent.allowedCapabilities.includes(request.requiredCapability)) {
      return {
        status: "BLOCKED",
        error: `Agent ${session.agent.agentId} (${session.agent.role}) lacks authorization for capability: ${request.requiredCapability}`,
        durationMs: Date.now() - start,
        traceId: trace.getTraceId(),
      };
    }

    // 3. Execution with Timeout Race
    try {
      const remainingTime = Math.max(100, session.expiresAt - Date.now());
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Execution deadline exceeded")), remainingTime)
      );

      const output = await Promise.race([
        executor(request.payload, trace),
        timeoutPromise,
      ]);

      return {
        status: "SUCCESS",
        output,
        durationMs: Date.now() - start,
        traceId: trace.getTraceId(),
      };
    } catch (err: any) {
      return {
        status: err?.message === "Execution deadline exceeded" ? "TIMEOUT" : "FAILED",
        error: err?.message || "Task execution failed",
        durationMs: Date.now() - start,
        traceId: trace.getTraceId(),
      };
    }
  }

  public getSession(sessionId: string): AgentSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  public terminateSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      (session as any).status = "TERMINATED";
    }
  }
}
