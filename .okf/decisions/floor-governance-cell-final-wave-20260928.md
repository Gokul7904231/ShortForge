# Floor Governance Cell Final Wave — Durable Council, Memory Context & Ascalon Admission — 2026-09-28

Classification: extends existing governance rule + final bounded-cognition integration
Status: FINAL / VALIDATED on executable head eb3456fa8e7ad78603d85d7daa6bc1d3d0d1ed49
Scope: Floor Governance Cell / one-floor cognitive governance boundary

## Decision

Close the Floor Governance Cell roadmap with a final implementation wave that makes the Wave-4 Council durable, gives its Advisor bounded access to verified derived memory, and creates an explicit admission boundary for future fine-tuned Ascalon inference.

The final wave does not change authority ownership.

The invariant remains:

> Intelligence may propose. Authority may authorize. Runtime may execute. Evidence must prove.

## OKF sweep

The implementation review covered the root OKF index, decision protocol, hierarchy, security, cognition, intelligence, memory, workflows, artifacts, research mappings, prior FGC Wave 1–4 decisions/audits, active governance implementation, CognitiveRuntime, MemoryFabric, existing decision contracts, focused tests, and validation workflows.

No authority rule was replaced.

## Final-wave capabilities

### 1. Durable Council sessions

FloorCouncilSessionStore adds a typed persisted session model containing proposal identity and SHA-256 proposal fingerprint, floor/state version, Council phase trace, CounselPackets, conflicts, terminal decision/reason, optional memory snapshot references, and optional Ascalon inference context fingerprint.

DiskFloorCouncilSessionStore uses per-floor append-only JSONL with hash chaining.

Restart rule: an in-flight probabilistic Council session is not resumed. It is explicitly marked ESCALATED, and a new review starts from current floor state.

This follows the same safety principle already used for stale physical healing: uncertain cognitive state must not silently resume after restart.

### 2. Verified derived memory as Advisor context

The final wave reuses the existing MemoryFabricBridge and MemoryFabricProjectionService.

The Council receives only bounded derived context: verified/active memory items, provenance, quality score, bounded content, and explicit memory snapshot/reference identity.

The Council persists only memory references in its durable session record rather than copying the whole memory payload.

Memory remains cognition input, non-authoritative, and subject to the existing MemoryFabric verification/promotion rules. Operational FactoryOS state and explicit authorization grants remain the runtime authority source.

### 3. Ascalon inference admission seam

AscalonInferenceAdmissionGate creates a typed boundary for a future fine-tuned Ascalon inference gateway.

Admission checks include proposer identity, floor identity, current state version, currently available action, proposal trust, confidence threshold, model reference, adapter version, context fingerprint, and optional model allowlisting.

SHADOW mode is evaluated and recorded but never admitted or returned for execution.

ADMITTED mode may enter the Council only. It still cannot mint authority or execute actions.

The final wave does not claim that a fine-tuned Ascalon model is already live in this runtime. The existing proposal-only adapter remains compatible with the new seam.

### 4. Governance telemetry becomes learning input

Council review and Ascalon admission events are included in the high-signal MemoryFabric event set.

This does not make telemetry executable knowledge. The existing MemoryFabric pipeline still requires explicit verification and promotion before memory becomes active durable knowledge or training-eligible content.

## Authority boundaries preserved

- Overseer remains global authority.
- Floor Guardian remains floor authority.
- Council is advisory/governance evidence, not authority.
- Ascalon is cognition, not sovereignty.
- BDA remains a boundary/data-integrity mechanism.
- ResolutionGate remains required for case closure.
- F07 remains final production verification/release authority.
- MemoryFabric remains derived cognitive storage.
- Workers cannot self-expand capabilities.

## External research used as design input

The final wave was informed by current work on provenance-aware agent memory and evidence-linked retrieval, continual memory write/manage/read loops and contradiction handling, temporal memory decay, resumable agent state, human approvals, tracing and guardrails, and durable execution for long-running agent workflows.

These references support persistence, provenance, bounded context and explicit interruption/recovery rather than unconstrained agent autonomy.

## Non-claims

This wave does not claim that the fine-tuned Ascalon model is deployed, that model inference has been promoted to authority, that multiple heavyweight LLM advisors are active, that memory is an authority source, that adversarial robustness is solved, or that signed workload identity and complete provenance/OTel integration are solved.

Those remain separate hardening/program boundaries.

## Acceptance invariants

1. stale Council proposals are rejected;
2. cross-floor proposals are rejected;
3. untrusted evidence cannot become authority;
4. missing or low-confidence Advisor counsel cannot silently approve;
5. in-flight Council sessions do not auto-resume after restart;
6. shadow Ascalon inference cannot cross into execution;
7. admitted Ascalon inference cannot bypass Council;
8. MemoryFabric failures cannot change authority;
9. stale execution grants remain rejected;
10. direct incident closure still requires ResolutionGate proof.

## Validation

Implementation commits are on PR #44 branch feat/floor-governance-cell-wave1-20260928.

Dedicated final-wave workflow 36394051521 passed on eb3456fa8e7ad78603d85d7daa6bc1d3d0d1ed49. Governance cross-wave checks 36394051496, 36394051567, 36394051595, 36394051504 and 36394051501 also passed. Team Change Gate 36394051500 passed. The repository-wide CI run remained a separate broader lane at closure time.