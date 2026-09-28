# Agent Execution Fabric — 2026-09-28

**Classification:** extends existing rule
**Status:** IMPLEMENTED — validation pending

## Decision

ShortForge needs a deterministic execution plane between bounded cognition and side-effecting tools. This wave introduces the Agent Execution Fabric (AEF) without replacing AgentRuntime, Floor Governance Cell, Guardian, MCP, A2A, or F07.

Core invariant:

> Probabilistic cognition may select among permitted possibilities, but it may never define the set of permitted possibilities.

## Architecture

```text
Human / Overseer
      |
      v
Agent Execution Router
      |
      +--> durable structured execution state
      |
      +--> deterministic step graph
      |
      +--> precondition / postcondition facts
      |
      +--> retry / UNKNOWN / idempotency policy
      |
      v
Step-scoped tool exposure
      |
      +--> capability check
      +--> exact tool allowlist
      +--> idempotency contract
      |
      v
ToolExecutor
      |
      +--> internal tools
      +--> provider adapters
      +--> MCP adapters
      |
      v
Evidence / verification / F07
```

## Why this belongs after the FGC

FGC answers: **is this action authorized?**

AEF answers: **which step is legal next, which tools are exposed in this step, what structured state must be true, and how do we recover if execution becomes ambiguous?**

These are complementary controls, not duplicate authority planes.

## Structured state rule

If deterministic runtime code needs a field for an if/else, routing, authorization, retry, recovery, lease, approval, or verification decision, the field belongs in structured execution state rather than model transcript/context.

Model context remains appropriate for semantic reasoning, hypotheses, research notes, drafts, and other non-authoritative cognition.

## Failure semantics

Side-effecting steps distinguish:
- NOT_STARTED
- IN_FLIGHT
- UNKNOWN
- CONFIRMED
- FAILED

Process restart during an in-flight side effect converts the state to UNKNOWN rather than pretending failure or success.

UNKNOWN retry requires an explicit idempotency contract and the configured retry budget.

## Step-scoped tool security

Every execution step declares an exact tool allowlist and required capabilities. `ScopedToolExecutor` refuses any tool not exposed by the current step and refuses execution when required capabilities are missing.

Steps that require idempotency additionally require a context idempotency key and a registered tool whose contract declares idempotency support.

## Protocol placement

MCP remains the vertical agent-to-tool/data integration layer. AEF decides when a tool may be exposed to a specific step; MCP does not mint authority.

A2A remains the horizontal agent-to-agent interoperability layer. An external A2A task may supply messages/artifacts/proposals, but ShortForge's local AEF + FGC remain responsible for local authorization and execution.

## Current scope

Implemented:
- typed execution state
- hash-chained disk/in-memory state store
- deterministic step router
- structured fact preconditions/postconditions
- restart-to-UNKNOWN recovery
- retry-budget/idempotency policy
- step-scoped tool executor
- capability enforcement
- focused regression suite
- CI workflow

Not claimed:
- replacement of the existing AgentRuntime session model
- full distributed workflow engine
- live A2A endpoint implementation
- generic MCP server implementation
- production fine-tuned Ascalon inference
- complete parameter-level capability attenuation

## Research alignment

Current A2A 1.0 is async-first and models stateful Tasks and Artifacts for long-running agent interactions. Current MCP evolution emphasizes stateless protocol operation, explicit task extensions, stronger authorization, and routable tool discovery. ShortForge therefore keeps A2A above the local agent boundary and MCP below the deterministic execution boundary.

See the implementation and `.okf/intelligence/agent-execution-fabric.md` for the canonical mapping.