## Current Implementation

The initial AER executable foundation is implemented in:
`apps/web/factoryos/core/intelligence/epistemic/`

The foundation currently covers contracts, deterministic-first state construction, bounded probe planning, cognitive routing, fingerprinted EpistemicContext construction, shadow Ascalon handoff, trigger suppression, hypothesis updates, cache identity, and append-only in-memory ledgering.

It is shadow-only. It does not execute probes or production Ascalon inference and has not yet received fresh repository CI/security/shadow-replay admission evidence.

# Ascalon Epistemic Runtime — Engineering Design

## 1. Design Intent

This document translates `.okf/intelligence/aer.md` into an implementation-oriented design for ShortForge.

It is intentionally a **design target**, not an implementation claim. The first implementation should be introduced in shadow mode and proven against real FactoryOS trajectories before it is allowed to influence production routing.

## 2. Existing Components AER Builds Around

AER should reuse, not fork, existing ShortForge infrastructure:

- `WorldStateEngine` for authoritative world-state separation and measurement fidelity.
- `ContextCompiler` for bounded, ranked, provenance-backed model context.
- `DecisionContracts.ts` for typed probability/confidence semantics.
- `DecisionEngine.ts` for deterministic-first decision evaluation and existing shadow paths.
- `DecisionLedger.ts` for provenance and training eligibility.
- `CapabilityRegistry` for capability checks.
- Guardian / Slayer / Healer for authority, lease, and recovery.
- `RenderArtifactVerifier` / F07 for physical artifact truth.
- Ascalon trajectory validator/exporter/replay tooling for data governance.
- Devourer governance for controlled improvement.

AER must not introduce a competing scheduler, memory authority, capability registry, or release gate.

## 3. Proposed Module Layout

A clean first layout is:

```
apps/web/factoryos/core/intelligence/epistemic/
├── EpistemicContracts.ts
├── EpistemicStateEngine.ts
├── EpistemicTrigger.ts
├── MeasurementRegistry.ts
├── ProbeRegistry.ts
├── ProbePlanner.ts
├── ProbeExecutor.ts
├── HypothesisManager.ts
├── EvidenceUpdater.ts
├── EpistemicContextBuilder.ts
├── CognitiveRouter.ts
├── EpistemicBudget.ts
├── EpistemicCache.ts
├── EpistemicLedger.ts
└── index.ts
```

Test target:

```
apps/web/factoryos/tests/epistemic/
├── epistemic-contracts.test.ts
├── epistemic-state-engine.test.ts
├── probe-planner.test.ts
├── probe-budget.test.ts
├── hypothesis-manager.test.ts
├── evidence-update.test.ts
├── epistemic-context.test.ts
├── cognitive-router.test.ts
├── fail-closed.test.ts
├── cache-fingerprint.test.ts
└── aer-shadow-replay.test.ts
```

The exact paths may change after repository layout reconciliation.

## 4. Proposed Core Contracts

### 4.1 EpistemicMeasurement

```ts
interface EpistemicMeasurement {
  measurementId: string;
  dimension: string;
  value: unknown;
  measurementType:
    | "REAL_MEASURED"
    | "OBSERVED_MEASUREMENT"
    | "VERIFIED_FACT"
    | "MODEL_INFERENCE"
    | "HEURISTIC_ESTIMATE"
    | "UNVERIFIED_ASSERTION";
  sourceRef: string;
  observedAt: string;
  freshnessSeconds?: number;
  calibrationStatus?:
    | "CALIBRATED"
    | "UNCALIBRATED"
    | "ESTIMATED"
    | "UNKNOWN";
  evidenceRefs: string[];
}
```

### 4.2 Hypothesis

```ts
interface Hypothesis {
  hypothesisId: string;
  statement: string;
  support: number;
  status:
    | "VIABLE"
    | "SUPPORTED"
    | "CONTRADICTED"
    | "ELIMINATED"
    | "UNKNOWN";
  evidenceRefs: string[];
  requiredProbes: string[];
  createdAt: string;
  updatedAt: string;
}
```

The support field is model/inference metadata and must not be treated as calibrated probability unless the evaluation system proves that interpretation.

### 4.3 CognitiveProbe

```ts
interface CognitiveProbe {
  probeId: string;
  type: string;
  target: Record<string, unknown>;
  requiredCapabilities: string[];
  estimatedLatencyMs: number;
  estimatedCostUnits: number;
  riskClass: "READ_ONLY" | "SENSITIVE_READ" | "MUTATING";
  timeoutMs: number;
  cacheable: boolean;
  parallelizable: boolean;
  evidenceProduced: string[];
}
```

Mutating probes must remain behind the normal capability/Guardian path.

### 4.4 EpistemicContext

```ts
interface EpistemicContext {
  schemaVersion: string;
  contextId: string;
  state:
    | "CONFIRMED"
    | "SUPPORTED"
    | "INFERRED"
    | "UNCERTAIN"
    | "CONTRADICTED"
    | "UNRESOLVED"
    | "STALE"
    | "NOT_APPLICABLE";
  known: Array<Record<string, unknown>>;
  unknown: string[];
  contradictions: Array<Record<string, unknown>>;
  measurements: EpistemicMeasurement[];
  hypotheses: Hypothesis[];
  recommendedProbes: CognitiveProbe[];
  evidenceRefs: string[];
  investigationHistory: Array<Record<string, unknown>>;
  impact: Record<string, unknown>;
  cognitiveRecommendation: {
    mode: "DETERMINISTIC" | "MICRO" | "DEEP" | "SPECIALIST" | "HUMAN";
    reason: string;
    deadlineMs: number;
  };
  budgets: Record<string, number>;
  freshness: Record<string, unknown>;
}
```

## 5. AER Operating Algorithm

AER should execute approximately:

```
1. receive trigger
2. obtain authoritative state slice
3. run cheap deterministic measurements
4. classify epistemic state
5. detect contradictions
6. build/update hypotheses
7. determine whether uncertainty is material
8. generate candidate probes
9. remove unauthorized/unsafe probes
10. estimate latency/cost/information value
11. schedule bounded probes
12. collect evidence
13. update epistemic state
14. determine whether deep cognition is justified
15. build EpistemicContext
16. optionally call Ascalon
17. record proposal + epistemic outcome
18. later reconcile prediction with real outcome
```

## 6. Trigger Policy

AER should be event-driven.

Recommended trigger classes:

- `STATE_CHANGE`
- `CONTRADICTION`
- `UNEXPECTED_LATENCY`
- `PROVIDER_ANOMALY`
- `NEW_EVIDENCE`
- `STALE_EVIDENCE`
- `REPEATED_FAILURE`
- `NOVEL_TASK`
- `REPAIR_EXHAUSTION`
- `HIGH_IMPACT_DECISION`

The trigger system should support suppression/deduplication so repeated identical events do not cause repeated expensive cognition.

## 7. Deterministic-First Rule

Before any model call, AER should ask:

> Can an existing authoritative computation answer this?

Examples:

```
artifact exists?
    -> filesystem

SHA correct?
    -> SHA-256

duration?
    -> ffprobe

lease valid?
    -> lease state

provider healthy?
    -> provider health

schema valid?
    -> schema validator
```

If yes, don't call a model.

This is essential for production latency and token economy.

## 8. Probe Planner

The first planner implementation does not need a mathematically sophisticated information-theoretic model.

A practical first score can be:

```
utility =
  normalizedExpectedInformationGain
  / (
      normalizedLatencyCost
      + normalizedComputeCost
      + normalizedRiskCost
      + normalizedTransferCost
    )
```

This score is for ranking probes only. It must not be described as calibrated probability or guaranteed information gain.

Later versions can learn empirical probe effectiveness from the Epistemic Ledger.

## 9. Ascalon Handoff Strategy

AER should **compress context** before passing it to Ascalon.

Do not pass:

- all logs;
- entire mission history;
- raw provider payloads;
- unrelated floor records;
- duplicated evidence.

Pass:

- current state;
- important evidence;
- contradictions;
- active hypotheses;
- already-tested probes;
- recommended next probes;
- relevant constraints;
- budget/deadline;
- explicit output contract.

This builds on existing ContextCompiler principles.

## 10. Ascalon Invocation Rules

Call Ascalon only if at least one is true:

- the problem is semantically complex;
- multiple viable hypotheses remain;
- the next probe requires deep planning;
- a novel task class is encountered;
- impact is high and deterministic checks are insufficient;
- existing fast cognition abstains.

Do not call Ascalon for trivial deterministic questions.

## 11. Ascalon Output Boundary

Ascalon can produce:

- analysis;
- hypothesis updates;
- probe recommendations;
- bounded action proposals;
- structured explanations;
- escalation recommendations.

The runtime remains responsible for:

- schema validation;
- capability verification;
- Guardian authorization;
- lease/fencing;
- physical execution;
- artifact verification;
- release authority.

## 12. Reliability Engineering

### Timeout

```
AER timeout
 -> UNRESOLVED
 -> fallback
 -> continue deterministic path or escalate
```

### Model unavailable

```
AER deep model unavailable
 -> use micro path if admissible
 -> otherwise remain UNRESOLVED
```

### Probe unavailable

```
mark probe failure
 -> preserve hypothesis
 -> select alternate probe
 -> respect budget
```

### Contradiction

```
conflict detected
 -> do not collapse automatically
 -> rank source authority/freshness
 -> create resolution probe
 -> escalate if material
```

## 13. Budgeting

AER should use hierarchical budgets:

```
Mission budget
  ├── Floor budget
  │    ├── Micro cognition
  │    ├── Deep cognition
  │    └── Probes
  └── Escalation budget
```

Budgets must be monotonic consumption counters.

AER must never increase its own budget.

## 14. Cache Requirements

Cache keys should include:

- input semantic fingerprint;
- context fingerprint;
- modelRef;
- model version;
- policy version;
- evidence freshness class.

Invalidation triggers:

- source evidence changed;
- model version changed;
- policy changed;
- relevant world-state changed;
- TTL expired;
- contradiction discovered.

## 15. Ledger Requirements

Record:

- trigger;
- state fingerprint;
- measurements;
- selected probes;
- rejected probes and reasons;
- results;
- hypothesis deltas;
- Ascalon invocation metadata;
- prediction;
- actual outcome;
- latency;
- cost;
- training eligibility.

The ledger is append-oriented and should be suitable for replay and analysis.

## 16. Testing Strategy

### Unit tests

Cover contract validation, state transitions, probe scoring, budgets, and caching.

### Property tests

Useful properties:

- deterministic inputs yield deterministic state fingerprints;
- unauthorized probes never execute;
- budget cannot increase during execution;
- timeouts never produce successful epistemic states;
- stale evidence cannot silently become fresh.

### Shadow replay

Replay historical missions and compare:

- epistemic state;
- chosen probes;
- Ascalon invocation;
- final production outcome.

### Adversarial tests

Include:

- contradictory evidence;
- stale evidence;
- malformed probe outputs;
- forged confidence;
- missing evidence;
- fake success receipts;
- poisoned logs;
- prompt injection inside evidence;
- malicious URLs;
- oversized contexts.

### Calibration

Evaluate model-derived confidence separately for each task family.

## 17. Security Integration

AER must use the existing Capability Registry and Guardian.

Proposed mapping:

```
AER -> CapabilityRequest
     -> Guardian
     -> AuthorizationGrant
     -> ProbeExecutor
```

AER should not directly call arbitrary tools.

MCP access remains explicitly scoped.

## 18. Observability

AER should emit trace events compatible with existing TraceContext.

Suggested fields:

- missionId;
- floorId;
- traceId;
- contextId;
- triggerType;
- epistemicState;
- modelRef;
- probeId;
- latencyMs;
- costUnits;
- evidenceRefs;
- outcome.

## 19. Rollout

### Stage 0 — Offline

Build the contracts and replay engine without production side effects.

### Stage 1 — Shadow

AER observes real missions and does not alter decisions.

### Stage 2 — Advisory

AER recommendations are logged alongside current runtime decisions.

### Stage 3 — Bounded influence

AER may influence only low-risk, reversible routing or investigation choices.

### Stage 4 — Production cognition

Only after evaluation evidence meets the defined gates.

### Stage 5 — Continuous evaluation

Devourer uses recurring epistemic errors to propose dataset/evaluation improvements.

## 20. Exit Criteria

AER should not move from shadow to production until evidence demonstrates:

- no authority bypass;
- fail-closed timeouts;
- deterministic-first behavior;
- useful probe selection;
- bounded latency;
- reproducible contracts;
- acceptable cost;
- no material provenance loss;
- safe handling of contradictory evidence;
- acceptable calibration on tested tasks;
- successful shadow replay;
- canary stability.

## 21. Relationship to Current Ascalon Architecture

AER becomes the layer immediately upstream of Ascalon's deep-cognition path.

Existing:

`WorldState -> Decision/LLM -> execution`

Target:

`WorldState -> AER -> EpistemicContext -> Decision/Fast Cognition/Ascalon -> bounded proposal -> execution`

This is an extension of the existing two-speed cognition architecture, not a replacement.

## 22. First Research Experiment

Before implementation affects production:

1. Capture a representative set of verified ShortForge trajectories.
2. Run AER in shadow.
3. Measure unknown detection, contradiction detection, probe usefulness, latency, and unnecessary deep calls.
4. Compare against a fixed deterministic-probe baseline.
5. Identify where AER adds information rather than merely adding model tokens.
6. Feed findings into Devourer evaluation.

The first success criterion is not "AER sounds intelligent."

It is:

> **AER reduces epistemic uncertainty or investigation cost on real production problems without weakening evidence or authority boundaries.**
## Cost-Efficient AER Admission

AER now exposes a deterministic pre-call contract for Ascalon:

shouldInvokeAscalon + reasonCode + expectedValue + estimatedCostUnits + remaining budget

The expected-value field is a routing/triage signal only. It is not model confidence and cannot establish truth.

The policy prefers:

DETERMINISTIC -> MICRO -> DEEP(Ascalon) -> SPECIALIST/HUMAN

Ascalon is requested only when the current uncertainty has enough policy-estimated value to justify its remaining call/cost budget.

AscalonInvocationGate is evaluated immediately before an actual model call. It rejects non-admitted contexts, expired contexts, non-clean redaction state, exhausted call budgets, insufficient remaining cost, and invalid authority class.

AERMetricsRecorder closes the measurement loop around the optimization target:

cost per resolved uncertainty = total uncertainty-episode cost / resolved uncertainty count

It also tracks escalation rate, probe usefulness, cache hit rate, AER/Ascalon p50/p95 latency, false reassurance, and unnecessary escalation. These metrics require observed telemetry and are not hard-coded success claims.

## Remediation Closure — 2026-09-29

The AER remediation pass addresses the previously identified production design gaps.

### Value model

AER no longer uses only an additive uncertainty score to justify deep cognition. It compares Ascalon against a baseline using incremental expected utility, explicitly pricing incremental compute/cost and latency. Production influence is blocked when the probabilities are not backed by observed calibration unless policy explicitly enables the experimental shadow path.

Recent constrained-compute and adaptive-routing research motivates this per-instance budgeted allocation pattern rather than uniform deep reasoning. citeturn772965academia97turn772965search1

### Execution loop

AER now has a bounded investigation loop:

event -> epistemic assessment -> safe probe plan -> AEF execution -> evidence -> state update -> re-assessment

AER owns planning and epistemic interpretation; AEF remains the execution boundary. Durable execution systems similarly separate persisted workflow state from side-effecting operations and make deterministic and model-driven steps composable. citeturn292099search0turn292099search7

### Admission and budget reservation

Ascalon invocation is now bracketed by:

admission -> atomic budget reservation -> model call -> commit/release

The canonical coordinator uses a durable SQLite reservation store by default for distributed/multi-process contention. The reservation store is explicitly replaceable with another atomic backend.

### Outcome truthfulness

Resolution is recorded through an outcome receipt carrying evidence references and an authoritative source. Model inference alone cannot mark uncertainty resolved. This is intentionally stricter than model-judged self-report because recent work finds reliability limits in LLM judges, especially for evidence verification. citeturn292099academia37

### Economics and telemetry

AER accepts provider/model/token/actual-USD usage and exposes p50/p95 latency, cache hit rate, probe usefulness, escalation rates, and cost per resolved uncertainty. A provider-neutral cost estimator can consume existing FactoryOS model-routing metadata, while actual usage can be supplied from production telemetry. OpenTelemetry's current GenAI conventions likewise define model/provider/operation and agent/tool span fields suitable for this telemetry boundary. citeturn772965search2turn772965search3

### Learning loop

AER now produces a conservative shadow routing candidate from observed outcomes using confidence bounds. It does not mutate the live routing policy. This keeps the learning loop compatible with contextual routing research while preserving ShortForge's current governance boundary. citeturn772965search1turn772965search0

Production admission still requires ShortForge-specific replay, calibration, security, and reliability evidence; research results are design references, not proof of ShortForge performance.
