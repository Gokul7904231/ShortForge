# Agent Execution Fabric

## 1. Purpose

The Agent Execution Fabric (AEF) is the deterministic execution-plane complement to ShortForge's cognitive and governance layers.

## 2. Layer map

| Layer | Responsibility | Authority |
|---|---|---|
| Ascalon / cognitive runtime | reasoning, proposal, candidate selection | none |
| Floor Council | bounded deliberation and evidence | none |
| Floor Governance Cell / Guardian | authorization and mutation boundary | floor authority |
| Agent Execution Router | deterministic sequencing and recovery | execution policy only |
| ScopedToolExecutor | step-specific tool/capability exposure | none |
| ToolExecutor / MCP / provider | bounded physical/tool operation | implementation only |
| F07 / Auditor | independent production verification | release truth |

## 3. AEF state

Structured state carries execution facts and machine-readable side-effect status. Transcript/context remains non-authoritative cognition.

## 4. Router contract

The router may only select registered transitions. It evaluates current structured facts and step contracts; it never asks a model which transition is permitted.

## 5. Recovery contract

If the process dies while an external side effect is in flight, the state becomes UNKNOWN on recovery. A retry is legal only when the step's retry policy permits the outcome and the idempotency contract can preserve identity across attempts.

## 6. Tool contract

A step receives an exact tool allowlist. A capability grant does not automatically expose every tool carrying that capability. This closes the 'global tool list' failure mode where a model can skip a mandatory policy step and directly call a consequential tool.

## 7. MCP boundary

MCP is a connector/integration protocol. It remains subordinate to AEF step exposure and FactoryOS authority. MCP success is a tool result, not proof of production success.

## 8. A2A boundary

A2A is the agent-to-agent interoperability layer. Remote agents exchange Tasks/Messages/Artifacts; ShortForge does not import their internal authority, memory, or tool permissions. Remote results enter the local evidence/proposal boundary before execution.

## 9. Product impact

This design allows ShortForge to run more capable asynchronous agents while moving deterministic memory, permission sequencing, retry identity, and recovery out of the model context and into executable state.

## Validation closure

- Agent Execution Fabric Validation: **PASS — 36397184661**
- Team Change Gate: **PASS — 36397184653**
- Validated executable head: `fa5a64b407faca57ad074b3384446778f4b217f7`
- Broader repository CI/security lanes remain separate and are not represented as a false pass.

## 10. Durable human-in-the-loop recovery

The final integration adds a local durable approval ledger rather than keeping a worker process alive while waiting for a person.

```text
RUNNING/READY
     |
     | requestHumanApproval()
     v
WAITING + approvalId
     |
     +--> human rejects/expiry --> BLOCKED
     |
     +--> human approves
              |
              v
      fingerprint + stateVersion check
              |
              v
            READY
              |
              v
           start()
```

The approval record stores execution/mission/run/floor/step identity; requesting agent and reason; risk level; expected execution state version; deterministic execution-state fingerprint; creation and expiry timestamps; and resolution identity and decision.

A restart never auto-executes an approved waiting step. The state remains WAITING until an explicit resume operation succeeds against the same execution-state binding.

An approval for a changed execution state is invalidated by the fingerprint/version check.

Expired, rejected, cancelled, or missing approval records move the execution to BLOCKED.

This aligns with the supplied architecture material's long-running human-wait pattern and with current A2A/MCP task designs, which represent interrupted/async work as durable task state rather than requiring a continuously alive worker. 