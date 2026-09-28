# Floor Governance Cell Wave 4 — Audit — 2026-09-28

**Status:** implementation audit complete; runtime validation pending

## PASS by design/code inspection

### Authority separation
The Council cannot authorize, mint grants, mutate workers, revoke leases, or close incidents.

### Deterministic first
Instructor and Auditor checks are deterministic and run independently of cognitive advice.

### Cognitive boundedness
The existing CognitiveRuntime is used only as an Advisor. Its result is converted into a typed CounselPacket and must satisfy an explicit confidence/support threshold.

### Evidence boundary
Advisor output is combined with proposal/evaluation evidence only as references. The Council does not treat raw reasoning text as authority.

### Fail-closed behavior
Missing Advisor runtime, stale proposal state, unknown actions, unauthorized proposers, untrusted proposal input, or Advisor disagreement prevent approval.

### Reproducible deliberation
The review emits an explicit phase trace and a structured telemetry event.

## PARTIAL

### Model diversity
Current Wave 4 has one cognitive Advisor plus deterministic Instructor/Auditor roles. It does not run multiple independent LLMs.

### Persistent council session
Council review evidence is persisted through the floor Blackboard and telemetry event, but there is not yet a separately durable CouncilSession object.

### Ascalon runtime
The Ascalon adapter remains proposal-only. The current Advisor is backed by the existing CognitiveRuntime, not the future fine-tuned Ascalon inference gateway.

## Release condition

Wave 4 is considered validated only when dedicated Wave-4 tests/typecheck, combined governance tests, and Team Change Gate are green on the same executable head.