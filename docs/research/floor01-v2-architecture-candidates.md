# Floor 01 v2 — Architecture Candidates and Research Notes

Date: 2026-09-25

This document records the external ideas considered for Floor 01. ShortForge adopts patterns, not external authority.

## Durable workflow: Temporal

Source: https://docs.temporal.io/

Useful pattern:
- durable workflow state
- recoverability after infrastructure failure
- separation of deterministic orchestration from external activities

F01 adoption:
- Overseer remains lifecycle authority
- F01 remains strategy business logic
- existing idempotency and checkpoint concepts remain the runtime boundary

Not adopted:
- replacing ShortForge's existing Overseer/DAG with Temporal.

## Parallel planning: LLMCompiler

Paper: https://arxiv.org/abs/2312.04511
Code: https://github.com/SqueezeAILab/LLMCompiler

Useful pattern:
- dependency-aware planning
- parallel execution of independent work
- separate planning, task dispatch, and execution

F01 adoption:
- curriculum mapping and optional model preparation run concurrently
- candidate evaluation remains deterministic after preparation completes

Published benchmark numbers from the paper are not treated as ShortForge measurements.

## Evidence gating: CRAG

Paper: https://arxiv.org/abs/2401.15884

Useful pattern:
- evaluate retrieved evidence quality
- trigger corrective behavior when evidence is weak

F01 adoption:
- ResearchEvidenceGate
- weak/missing evidence becomes DEGRADED or REJECTED in strict mode
- model strategy cannot silently treat an arbitrary research payload as verified truth

## Multi-perspective research: STORM

Paper: https://arxiv.org/abs/2402.14207

Useful pattern:
- perspective discovery
- sourced question asking
- organized synthesis

F01 adoption:
- F01 consumes F00 findings and hook intelligence
- future DELIBERATE/DEEP modes may add bounded perspective generation

Not implemented here:
- autonomous research inside F01. External research remains F00's boundary.

## Strategic memory: GraphRAG

Paper: https://arxiv.org/abs/2404.16130

Useful pattern:
- connect facts, entities, and outcomes
- retrieve both local and global strategic knowledge

F01 adoption:
- strategic_memory_refs are carried in the handoff
- the current memory store remains a compatibility backend
- a future shared graph/semantic backend can evolve without changing F01's handoff contract

## LM program optimization: DSPy / GEPA

DSPy: https://github.com/stanfordnlp/dspy
GEPA: https://arxiv.org/abs/2507.19457

Useful pattern:
- define explicit evaluation metrics
- optimize model programs against trajectory feedback
- improve the program rather than relying on ad-hoc prompt edits

F01 target:
- optimize candidate generation/evaluation using verified F02-F07 outcomes
- keep optimized artifacts subordinate to deterministic validation and .okf authority

## Typed structured model outputs

Pydantic AI: https://ai.pydantic.dev/

Useful pattern:
- typed outputs
- validation at the boundary
- bounded fallback/retry

F01 adoption:
- StrategyCandidate
- StrategyEvaluation
- Floor01HandoffPayload
- fallback provenance when a live model call is unavailable

## Resulting ShortForge rule

The strongest common pattern is:

deterministic authority + verified evidence + typed candidates + bounded model reasoning + deterministic validation + durable orchestration.

ShortForge already owns the surrounding authority system, so importing another multi-agent orchestration framework would add a competing control plane rather than improve F01.
