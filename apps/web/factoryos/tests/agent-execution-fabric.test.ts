import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { AgentExecutionRouter } from "../core/agent/execution/AgentExecutionRouter";
import {
  DiskAgentExecutionStateStore,
  InMemoryAgentExecutionStateStore,
} from "../core/agent/execution/AgentExecutionStateStore";
import {
  DiskAgentExecutionApprovalStore,
  InMemoryAgentExecutionApprovalStore,
} from "../core/agent/execution/AgentExecutionApprovalStore";
import type {
  ExecutionState,
  ExecutionStepContract,
} from "../core/agent/execution/AgentExecutionContracts";
import { ScopedToolExecutor } from "../core/agent/execution/ScopedToolExecutor";
import { ToolRegistry } from "../core/tools/ToolRegistry";
import { ToolExecutor } from "../core/tools/ToolExecutor";
import { toolOk } from "../core/tools/ToolContracts";

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
      factsPatch: { "order.loaded": true },
    });

    expect(afterClassify.nextStepId).toBe("policy");

    const policyReady = store.get("exec_final_fabric_01")!;
    const policyState = router.start(policyReady);
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
    const store = new InMemoryAgentExecutionStateStore();
    const router = new AgentExecutionRouter(store);

    router.registerStep(refundStep);

    const scoped = new ScopedToolExecutor(
      router,
      registry,
      executor,
      new Set(["CAP_REFUND"])
    );

    const state: ExecutionState = router.start({
      ...baseState("refund"),
      phase: "MUTATION",
      facts: { "policy.approved": true },
    });

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
      router.start({
        ...baseState("refund"),
        phase: "MUTATION",
        facts: { "policy.approved": true },
      }),
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


describe("Agent Execution Fabric — Human Approval / Durable Wait", () => {
  it("persists a human approval request, survives restart, and resumes only after explicit approval", () => {
    const executionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-hitl-"));

    try {
      const stateStore = new DiskAgentExecutionStateStore(executionRoot);
      const approvalStore = new DiskAgentExecutionApprovalStore(executionRoot);
      const router = new AgentExecutionRouter(stateStore, approvalStore);

      const approvalStep: ExecutionStepContract = {
        ...refundStep,
        stepId: "approval_step",
        humanApproval: "ALWAYS",
        preconditions: ["policy.approved"],
      };

      router.registerStep(approvalStep);

      const ready = {
        ...baseState("approval_step"),
        phase: "MUTATION",
        facts: { "policy.approved": true },
      };

      const requested = router.requestHumanApproval(ready, {
        requestedByAgent: "guardian_floor02",
        reason: "High-risk external mutation requires human approval.",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

      expect(requested.state.status).toBe("WAITING");
      expect(requested.state.humanApprovalState).toBe("PENDING");
      expect(requested.state.approvalId).toBe(requested.approval.approvalId);

      const afterRestartStateStore = new DiskAgentExecutionStateStore(executionRoot);
      const afterRestartApprovalStore = new DiskAgentExecutionApprovalStore(executionRoot);
      const restartedRouter = new AgentExecutionRouter(
        afterRestartStateStore,
        afterRestartApprovalStore,
      );

      restartedRouter.registerStep(approvalStep);

      const recovered = restartedRouter.recoverAfterRestart();
      expect(recovered).toHaveLength(0);

      const waiting = afterRestartStateStore.get(requested.state.executionId)!;
      expect(waiting.status).toBe("WAITING");
      expect(afterRestartApprovalStore.get(requested.approval.approvalId)?.status).toBe("PENDING");

      const resolved = restartedRouter.resolveHumanApproval(
        requested.approval.approvalId,
        "APPROVED",
        "human_001",
        "Approved for controlled execution.",
      );
      expect(resolved.status).toBe("APPROVED");

      const resumed = restartedRouter.resumeAfterApproval(waiting);
      expect(resumed.allowed).toBe(true);
      expect(resumed.state.status).toBe("READY");
      expect(resumed.state.humanApprovalState).toBe("APPROVED");

      const running = restartedRouter.start(resumed.state);
      expect(running.status).toBe("RUNNING");
    } finally {
      fs.rmSync(executionRoot, { recursive: true, force: true });
    }
  });

  it("never applies an approval to a changed execution state", () => {
    const stateStore = new InMemoryAgentExecutionStateStore();
    const approvalStore = new InMemoryAgentExecutionApprovalStore();
    const router = new AgentExecutionRouter(stateStore, approvalStore);

    const approvalStep: ExecutionStepContract = {
      ...refundStep,
      stepId: "approval_step_stale",
      humanApproval: "WHEN_REQUIRED",
      preconditions: ["policy.approved"],
    };

    router.registerStep(approvalStep);

    const ready = {
      ...baseState("approval_step_stale"),
      phase: "MUTATION",
      facts: { "policy.approved": true },
    };

    const requested = router.requestHumanApproval(ready, {
      requestedByAgent: "guardian_floor02",
      reason: "Controlled mutation approval.",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    router.resolveHumanApproval(
      requested.approval.approvalId,
      "APPROVED",
      "human_002",
    );

    const changed = {
      ...requested.state,
      stateVersion: requested.state.stateVersion + 1,
      facts: { "policy.approved": true, "authorization.changed": true },
    };
    stateStore.save(changed);

    const resumed = router.resumeAfterApproval(changed);
    expect(resumed.allowed).toBe(false);
    expect(resumed.reason).toBe(
      "approval_binding_no_longer_matches_execution_state",
    );
    expect(resumed.state.status).toBe("BLOCKED");
  });

  it("expires a waiting approval and blocks recovery instead of auto-resuming", () => {
    const stateStore = new InMemoryAgentExecutionStateStore();
    const approvalStore = new InMemoryAgentExecutionApprovalStore();
    const router = new AgentExecutionRouter(stateStore, approvalStore);

    const approvalStep: ExecutionStepContract = {
      ...refundStep,
      stepId: "approval_step_expiry",
      humanApproval: "ALWAYS",
      preconditions: ["policy.approved"],
    };

    router.registerStep(approvalStep);

    const ready = {
      ...baseState("approval_step_expiry"),
      phase: "MUTATION",
      facts: { "policy.approved": true },
    };

    const expiresAt = new Date(Date.now() + 10).toISOString();
    const requested = router.requestHumanApproval(ready, {
      requestedByAgent: "guardian_floor02",
      reason: "Awaiting human decision.",
      expiresAt,
    });

    const now = new Date(Date.now() + 30_000);
    const recovered = router.recoverAfterRestart(now);

    expect(recovered).toHaveLength(1);
    expect(recovered[0].status).toBe("BLOCKED");
    expect(recovered[0].lastError).toContain("approval_expired");

    const approval = approvalStore.get(requested.approval.approvalId)!;
    expect(approval.status).toBe("EXPIRED");
  });

  it("does not auto-resume an already-approved waiting state after restart", () => {
    const stateStore = new InMemoryAgentExecutionStateStore();
    const approvalStore = new InMemoryAgentExecutionApprovalStore();
    const router = new AgentExecutionRouter(stateStore, approvalStore);

    const approvalStep: ExecutionStepContract = {
      ...refundStep,
      stepId: "approval_step_no_auto_resume",
      humanApproval: "ALWAYS",
      preconditions: ["policy.approved"],
    };

    router.registerStep(approvalStep);

    const requested = router.requestHumanApproval(
      {
        ...baseState("approval_step_no_auto_resume"),
        phase: "MUTATION",
        facts: { "policy.approved": true },
      },
      {
        requestedByAgent: "guardian_floor02",
        reason: "Approval must not execute automatically after restart.",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    );

    router.resolveHumanApproval(
      requested.approval.approvalId,
      "APPROVED",
      "human_003",
    );

    const recovered = router.recoverAfterRestart();
    expect(recovered).toHaveLength(0);

    const persisted = stateStore.get(requested.state.executionId)!;
    expect(persisted.status).toBe("WAITING");
    expect(persisted.humanApprovalState).toBe("PENDING");

    const resumed = router.resumeAfterApproval(persisted);
    expect(resumed.allowed).toBe(true);
    expect(resumed.state.status).toBe("READY");
  });
});
