import { describe, expect, it } from "vitest";
import { AgentExecutionRouter } from "../../core/agent/execution/AgentExecutionRouter";
import {
  InMemoryAgentExecutionStateStore,
} from "../../core/agent/execution/AgentExecutionStateStore";
import type {
  ExecutionState,
  ExecutionStepContract,
} from "../../core/agent/execution/AgentExecutionContracts";
import { ScopedToolExecutor } from "../../core/agent/execution/ScopedToolExecutor";
import { ToolRegistry } from "../../core/tools/ToolRegistry";
import { ToolExecutor } from "../../core/tools/ToolExecutor";
import { toolOk } from "../../core/tools/ToolContracts";

const classifyStep: ExecutionStepContract = {
  stepId: "classify",
  phase: "INTAKE",
  allowedTools: ["classify.intent"],
  requiredCapabilities: ["CAP_REASON"],
  preconditions: [],
  postconditions: ["intent.classified"],
  sideEffect: "NONE",
  idempotency: "NONE",
  retryPolicy: {
    maxAttempts: 1,
    retryOn: [],
    backoffMs: 0,
    sameIdempotencyKey: false,
  },
  evidenceRequirements: [],
  humanApproval: "NONE",
  riskLevel: "LOW",
};

const policyStep: ExecutionStepContract = {
  stepId: "policy",
  phase: "POLICY",
  allowedTools: [],
  requiredCapabilities: ["CAP_POLICY_CHECK"],
  preconditions: ["intent.classified", "order.loaded"],
  postconditions: ["policy.approved"],
  sideEffect: "NONE",
  idempotency: "NONE",
  retryPolicy: {
    maxAttempts: 1,
    retryOn: [],
    backoffMs: 0,
    sameIdempotencyKey: false,
  },
  evidenceRequirements: [],
  humanApproval: "NONE",
  riskLevel: "LOW",
};

const refundStep: ExecutionStepContract = {
  stepId: "refund",
  phase: "MUTATION",
  allowedTools: ["refund.issue"],
  requiredCapabilities: ["CAP_REFUND"],
  preconditions: ["policy.approved"],
  postconditions: ["refund.confirmed"],
  sideEffect: "FINANCIAL",
  idempotency: "REQUIRED",
  retryPolicy: {
    maxAttempts: 3,
    retryOn: ["UNKNOWN", "FAILED"],
    backoffMs: 0,
    sameIdempotencyKey: true,
  },
  evidenceRequirements: [],
  humanApproval: "WHEN_REQUIRED",
  riskLevel: "CRITICAL",
};

function baseState(stepId = "classify"): ExecutionState {
  return {
    executionId: "exec_final_fabric_01",
    missionId: "mission_01",
    runId: "run_01",
    floorId: "floor02_scripting",
    phase: "INTAKE",
    stepId,
    stepAttempt: 0,
    stateVersion: 1,
    status: "READY",
    facts: {},
    sideEffectStatus: "NOT_STARTED",
    idempotencyKey: "idem_refund_001",
    evidenceRefs: [],
    artifactRefs: [],
    humanApprovalState: "NOT_REQUIRED",
    updatedAt: new Date().toISOString(),
  };
}

describe("Agent Execution Fabric", () => {
  it("uses structured facts as deterministic router state and promotes success to postcondition facts", () => {
    const store = new InMemoryAgentExecutionStateStore();
    const router = new AgentExecutionRouter(store);

    router.registerStep(classifyStep);
    router.registerStep(policyStep);
    router.registerStep(refundStep);

    router.registerTransition({
      fromStepId: "classify",
      toStepId: "policy",
      on: "SUCCEEDED",
    });
    router.registerTransition({
      fromStepId: "policy",
      toStepId: "refund",
      on: "SUCCEEDED",
    });

    const started = router.start(baseState());
    expect(started.status).toBe("RUNNING");

    const afterClassify = router.recordOutcome(started, {
      status: "SUCCEEDED",
      sideEffectStatus: "CONFIRMED",
      lastOutcome: "intent=refund",
      evidenceRefs: [],
      artifactRefs: [],
    });

    expect(afterClassify.nextStepId).toBe("policy");

    const policyState = store.get("exec_final_fabric_01")!;
    const afterPolicy = router.recordOutcome(policyState, {
      status: "SUCCEEDED",
      sideEffectStatus: "CONFIRMED",
      lastOutcome: "eligible",
      evidenceRefs: [],
      artifactRefs: [],
    });

    expect(afterPolicy.nextStepId).toBe("refund");

    const refundState = store.get("exec_final_fabric_01")!;
    expect(refundState.facts["intent.classified"]).toBe(true);
    expect(refundState.facts["policy.approved"]).toBe(true);
  });

  it("cannot enter a consequential step before its state preconditions are true", () => {
    const store = new InMemoryAgentExecutionStateStore();
    const router = new AgentExecutionRouter(store);

    router.registerStep(refundStep);

    expect(() =>
      router.start(baseState("refund"))
    ).toThrow("execution_preconditions_missing:policy.approved");
  });

  it("turns an in-flight side effect into UNKNOWN after restart", () => {
    const store = new InMemoryAgentExecutionStateStore();
    const router = new AgentExecutionRouter(store);

    router.registerStep(refundStep);

    const running = router.start({
      ...baseState("refund"),
      phase: "MUTATION",
      facts: { "policy.approved": true },
    });

    expect(running.sideEffectStatus).toBe("IN_FLIGHT");

    const recovered = router.recoverAfterRestart();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].status).toBe("UNKNOWN");
    expect(recovered[0].sideEffectStatus).toBe("UNKNOWN");
    expect(recovered[0].lastError).toBe(
      "process_restart_during_side_effect"
    );
  });

  it("allows UNKNOWN retry only when the same idempotency key is preserved", () => {
    const store = new InMemoryAgentExecutionStateStore();
    const router = new AgentExecutionRouter(store);

    router.registerStep(refundStep);
    router.registerTransition({
      fromStepId: "refund",
      toStepId: "refund",
      on: "UNKNOWN",
    });

    const running = router.start({
      ...baseState("refund"),
      phase: "MUTATION",
      facts: { "policy.approved": true },
    });

    const decision = router.recordOutcome(running, {
      status: "UNKNOWN",
      sideEffectStatus: "UNKNOWN",
      lastError: "provider_timeout",
      evidenceRefs: [],
      artifactRefs: [],
    });

    expect(decision.allowed).toBe(true);
    expect(decision.nextStepId).toBe("refund");

    const retry = store.get("exec_final_fabric_01")!;
    expect(retry.stepAttempt).toBe(1);
    expect(retry.idempotencyKey).toBe("idem_refund_001");
    expect(retry.status).toBe("READY");
  });

  it("blocks step tools that are not explicitly exposed and blocks missing capabilities", async () => {
    const registry = new ToolRegistry();
    registry.register({
      id: "refund.issue",
      name: "Issue Refund",
      version: "1.0.0",
      description: "Test refund tool",
      capability: "CAP_REFUND",
      riskLevel: "CRITICAL",
      sideEffects: "FINANCIAL",
      supportsIdempotency: true,
      execute: async () => toolOk({ transactionId: "TX_001" }),
    });
    registry.register({
      id: "refund.read",
      name: "Read Refund",
      version: "1.0.0",
      description: "Read-only test tool",
      capability: "CAP_REFUND",
      riskLevel: "LOW",
      sideEffects: "READ_ONLY",
      supportsIdempotency: true,
      execute: async () => toolOk({ status: "UNKNOWN" }),
    });

    const executor = new ToolExecutor(registry);
    const router = new AgentExecutionRouter(
      new InMemoryAgentExecutionStateStore()
    );

    router.registerStep(refundStep);

    const scoped = new ScopedToolExecutor(
      router,
      registry,
      executor,
      new Set(["CAP_REFUND"])
    );

    const state: ExecutionState = {
      ...baseState("refund"),
      phase: "MUTATION",
      facts: { "policy.approved": true },
    };

    const deniedTool = await scoped.execute(
      state,
      "refund.read",
      {},
      {
        workflowId: "workflow",
        runId: "run_01",
        stepId: "refund",
        toolId: "refund.read",
        idempotencyKey: "idem_refund_001",
      }
    );
    expect(deniedTool.error?.code).toBe("STEP_TOOL_NOT_ALLOWED");

    const allowedTool = await scoped.execute(
      state,
      "refund.issue",
      {},
      {
        workflowId: "workflow",
        runId: "run_01",
        stepId: "refund",
        toolId: "refund.issue",
        idempotencyKey: "idem_refund_001",
      }
    );
    expect(allowedTool.success).toBe(true);
  });

  it("fails closed when a consequential step lacks the required capability", async () => {
    const registry = new ToolRegistry();
    registry.register({
      id: "refund.issue",
      name: "Issue Refund",
      version: "1.0.0",
      description: "Test refund tool",
      capability: "CAP_REFUND",
      riskLevel: "CRITICAL",
      sideEffects: "FINANCIAL",
      supportsIdempotency: true,
      execute: async () => toolOk({ transactionId: "TX_002" }),
    });

    const router = new AgentExecutionRouter(
      new InMemoryAgentExecutionStateStore()
    );
    router.registerStep(refundStep);

    const scoped = new ScopedToolExecutor(
      router,
      registry,
      new ToolExecutor(registry),
      new Set(),
    );

    const result = await scoped.execute(
      {
        ...baseState("refund"),
        phase: "MUTATION",
        facts: { "policy.approved": true },
      },
      "refund.issue",
      {},
      {
        workflowId: "workflow",
        runId: "run_01",
        stepId: "refund",
        toolId: "refund.issue",
        idempotencyKey: "idem_refund_001",
      }
    );

    expect(result.error?.code).toBe("STEP_CAPABILITY_NOT_GRANTED");
  });
});
