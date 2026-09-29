# Ascalon Epistemic Runtime (AER)

> **Document Class:** Intelligence / Epistemic Architecture Specification
> **Status:** TARGET ARCHITECTURE / DOCUMENTED DESIGN — NOT YET CLAIMED AS IMPLEMENTED
> **Authority:** .okf source-of-truth hierarchy; executable implementation and tests outrank this document.
> **Scope:** ShortForge Cognitive Layer (SCL), Ascalon cognition, epistemic state management, uncertainty, probe planning, evidence selection, hypothesis management, counterfactual reasoning, and cognitive routing.
> **Canonical Pipeline:** F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07

---

## 1. Purpose

The **Ascalon Epistemic Runtime (AER)** is a proposed cognitive infrastructure layer for ShortForge / FactoryOS.

AER does not exist to make the LLM answer more questions, replace the existing Decision Engine, or grant Ascalon more authority. Its purpose is to make the system explicitly aware of **what is known, what is inferred, what is unknown, what conflicts, what should be measured next, and how much cognition is worth spending**.

The central principle is:

> **AER manages the epistemic state around a production problem; Ascalon performs deep cognition over that state.**

AER therefore changes the unit of LLM work from:

`raw state -> free-form answer`

toward:

`raw state -> epistemic state -> targeted reasoning -> bounded proposal`

AER must remain subordinate to Human Authority, Overseer, Guardian, Slayer, Healer, deterministic contracts, worker capabilities, CAS, and F07.

AER is allowed to be wrong. It is **not** allowed to convert an unverified model belief into authoritative production truth.

---

## 2. Architectural Motivation

Current ShortForge already contains:

- a provenance-aware ContextCompiler;
- typed NOUL / CHOICE / SCORE decisions;
- explicit distinction between model probability and epistemic confidence;
- deterministic-first decision evaluation;
- Jev/CLM shadow adapters;
- DecisionLedger provenance and training eligibility;
- deterministic verification and F07 physical gates;
- Ascalon trajectory validation, replay, contamination controls, and staged evaluation.

These mechanisms solve different problems.

The missing architectural question is:

> **Before asking Ascalon to reason, what is the actual epistemic situation and what is the cheapest reliable operation that can reduce uncertainty?**

AER fills that gap.

### 2.1 AER is not another LLM

AER is a runtime/orchestration concept composed of:

- epistemic state construction;
- evidence classification;
- uncertainty decomposition;
- contradiction detection;
- hypothesis management;
- probe generation;
- probe scheduling;
- optional counterfactual planning;
- cognitive routing;
- epistemic ledgering;
- feedback from observed outcomes.

An implementation may use models, deterministic analyzers, existing DecisionEngine components, or specialized tools. The architecture is independent of a specific checkpoint.

### 2.2 AER is not a second authority

AER cannot:

- authorize capabilities;
- grant leases;
- mint fencing tokens;
- publish artifacts;
- declare F07 success;
- override Guardian;
- override Overseer;
- rewrite production contracts;
- silently train or replace Ascalon.

---

## 3. Absolute Placement

AER belongs inside the ShortForge Cognitive Layer, underneath Overseer authority and above task-specific reasoning.

```
Human Authority
      |
      v
   OVERSEER
      |
      v
SHORTFORGE COGNITIVE LAYER
      |
      +-----------------------------+
      |                             |
      v                             v
AER Epistemic Runtime       Decision / Reasoning Runtimes
      |                             |
      +-------------+---------------+
                    |
                    v
             Ascalon Deep Cognition
                    |
                    v
             bounded proposals
                    |
                    v
             Guardian controls
                    |
            +-------+-------+
            |       |       |
         Slayer  Healer  Workers
                            |
                            v
                 F00 -> ... -> F07
                            |
                            v
                    physical evidence
                            |
                            +----> AER feedback
```

### 3.1 Relationship to existing DecisionEngine

The DecisionEngine remains responsible for typed decision evaluation.

AER provides decision context.

```
AER:
  "The state has two unresolved hypotheses, one contradiction,
   and missing timing evidence."

DecisionEngine:
  "Given that state, evaluate bounded options."

Ascalon:
  "Given the epistemic brief, perform deeper reasoning where required."
```

AER should not duplicate NOUL / CHOICE / SCORE semantics already owned by DecisionContracts.

---

## 4. Core Mission

AER has six primary responsibilities:

1. **State epistemics** — identify what is known, inferred, unknown, stale, or contradictory.
2. **Uncertainty decomposition** — explain why uncertainty exists instead of reducing everything to one confidence scalar.
3. **Investigation design** — generate candidate probes that could reduce uncertainty.
4. **Evidence orchestration** — prioritize evidence and measurements by expected information value, safety, latency, and cost.
5. **Cognitive routing** — decide whether the state can be resolved deterministically, with fast cognition, by Ascalon, by a specialist, or through human escalation.
6. **Epistemic learning** — compare predictions with observed outcomes and improve future priors, probe selection, and evaluation datasets.

---

## 5. Epistemic State Model

AER must represent multiple dimensions rather than a single confidence field.

### 5.1 Canonical state dimensions

Recommended dimensions:

- **knownFacts**
- **supportedClaims**
- **unknowns**
- **contradictions**
- **hypotheses**
- **measurements**
- **evidenceRefs**
- **probeCandidates**
- **impact**
- **freshness**
- **modelAssessment**
- **cognitiveRecommendation**

### 5.2 Epistemic status vocabulary

AER should use explicit state labels:

- `CONFIRMED` — supported by authoritative/verified evidence.
- `SUPPORTED` — supported by evidence but not independently conclusive.
- `INFERRED` — derived from other information without direct observation.
- `UNCERTAIN` — material uncertainty remains.
- `CONTRADICTED` — materially conflicting evidence exists.
- `UNRESOLVED` — available evidence is insufficient for a safe conclusion.
- `STALE` — relevant information is older than the configured freshness policy.
- `NOT_APPLICABLE` — the question or dimension is irrelevant to the state.

AER must not silently map `INFERRED` or `UNCERTAIN` to `CONFIRMED`.

---

## 6. Measurement Provenance

Every epistemic measurement must preserve source and fidelity.

Use the project's existing epistemic/provenance vocabulary wherever possible:

- `REAL_MEASURED`
- `OBSERVED_MEASUREMENT`
- `VERIFIED_FACT`
- `MODEL_INFERENCE`
- `HEURISTIC_ESTIMATE`
- `UNVERIFIED_ASSERTION`

A model estimate such as:

`temporalRisk = 0.78`

must never be rendered equivalent to:

`ffprobe duration = 11.32s`

### 6.1 Measurement record

Conceptual structure:

```json
{
  "measurementId": "meas_...",
  "dimension": "temporalRisk",
  "value": 0.78,
  "measurementType": "MODEL_INFERENCE",
  "source": "ASCALON",
  "calibrationStatus": "UNCALIBRATED",
  "evidenceRefs": [],
  "observedAt": "..."
}
```

A deterministic measurement:

```json
{
  "measurementId": "meas_...",
  "dimension": "durationSeconds",
  "value": 11.32,
  "measurementType": "OBSERVED_MEASUREMENT",
  "source": "FFPROBE",
  "evidenceRefs": ["artifact_..."],
  "observedAt": "..."
}
```

---

## 7. Question Taxonomy — What AER Can Answer

AER is designed to answer questions about the **epistemic situation**, not every operational question in the factory.

### Family A — State of knowledge

AER can answer:

- What facts are confirmed?
- What facts are only inferred?
- What information is missing?
- What information is stale?
- What changed since the previous state?
- Which claims have direct evidence?
- Which claims depend on model interpretation?
- Which statements are merely assertions?

### Family B — Uncertainty diagnosis

AER can answer:

- What is uncertain?
- Why is it uncertain?
- Is uncertainty caused by missing evidence, contradictory evidence, model ambiguity, measurement limitations, or stale state?
- Can the uncertainty be reduced?
- How expensive is uncertainty reduction?

### Family C — Contradiction detection

AER can answer:

- Which observations disagree?
- Which claim conflicts with which measurement?
- Which source is newer?
- Which evidence is more authoritative?
- Is the contradiction material or harmless?

AER should report the conflict and its provenance rather than silently choosing one side.

### Family D — Hypothesis management

AER can answer:

- What explanations are currently plausible?
- Which hypotheses are supported?
- Which hypotheses are contradicted?
- Which hypotheses remain viable?
- What evidence would distinguish them?

### Family E — Next investigation

AER can answer:

- What should we measure next?
- What is the cheapest reliable probe?
- Which probe is fastest?
- Which probe is safest?
- Which evidence source should be inspected first?
- Can multiple probes run in parallel?

### Family F — Impact and blast radius

AER can answer:

- If this problem is real, what does it affect?
- Which floor boundaries are downstream?
- Which artifacts are at risk?
- Is the issue reversible?
- Is the issue local or systemic?

### Family G — Counterfactual analysis

AER can answer:

- What could happen if option X is chosen?
- What changes if a parameter is increased or decreased?
- Which hypotheses predict different outcomes?
- Which experiment would distinguish competing plans?

Counterfactuals are predictions, not measured outcomes.

### Family H — Cognitive routing

AER can answer:

- Can deterministic logic resolve this?
- Is fast cognition sufficient?
- Does Ascalon need to be invoked?
- Is a specialist tool/model needed?
- Is human escalation appropriate?

### Family I — Historical learning

AER can answer:

- What did we predict previously?
- What actually happened?
- Where were predictions wrong?
- Is the error recurring?
- Should the event become a new training example?
- Should a new evaluation case be created?

---

## 8. Questions AER Must Not Authoritatively Answer

The following remain outside AER authority:

- "Is this artifact released?" — F07 / release authority.
- "May this worker execute this capability?" — Guardian.
- "May this lease continue?" — Guardian/Slayer contract.
- "Is the physical MP4 valid?" — physical verification.
- "Does a SHA-256 match?" — deterministic computation.
- "Should a security control be bypassed?" — never.
- "Should production policy be changed?" — Overseer/Human governance.
- "Should Ascalon rewrite its own weights?" — Devourer governance and promotion gate.
- "Should a user publish content?" — bounded workflow authority, not AER.

AER may **flag** or **analyze** these questions, but it does not become their authority.

---

## 9. Probe System

A **CognitiveProbe** is a typed request for information or measurement.

Examples:

- `CHECK_SCHEMA`
- `CHECK_ARTIFACT_EXISTS`
- `MEASURE_DURATION`
- `MEASURE_AUDIO_DURATION`
- `COMPARE_TIMELINE_TO_AUDIO`
- `CHECK_SOURCE_FRESHNESS`
- `VERIFY_EVIDENCE_REFERENCE`
- `INSPECT_RENDER_TIMINGS`
- `RUN_SHADOW_REPLAY`
- `QUERY_RESEARCH_SOURCE`

### 9.1 Probe properties

Every probe should declare:

- probeId
- type
- target
- requiredCapabilities
- expectedInputs
- expectedOutputs
- estimatedLatencyMs
- estimatedCostUnits
- riskClass
- mutability
- evidenceProduced
- timeout
- failureMode
- cacheability
- parallelizable
- authorization requirement

### 9.2 Probe classes

**Deterministic probes**
- filesystem
- schema validation
- cryptographic hashing
- ffprobe
- ffmpeg decode smoke
- database state
- lease state

**Read-only semantic probes**
- model classification
- evidence interpretation
- contradiction extraction

**External evidence probes**
- Reach / search
- source inspection
- repository or document inspection

**Simulation probes**
- shadow replay
- counterfactual execution
- dry-run planning

**Mutating probes**
These must never be implicitly invoked by AER. They require the ordinary Guardian/Capability authorization chain.

---

## 10. Value-of-Information Scheduling

The central optimization idea for AER is:

> **Choose the cheapest safe operation that is expected to reduce meaningful uncertainty.**

A conceptual score can be:

`ProbeUtility = ExpectedInformationGain / (latencyCost + computeCost + riskCost + transferCost)`

This is a scheduling heuristic, not an oracle.

### 10.1 Example

```
Unknown:
Why did F06 rendering slow down?

Probe A:
Inspect FFmpeg timing statistics
  cost = 1
  latency = low
  expected information = high

Probe B:
Re-render entire video
  cost = 8
  latency = high
  expected information = medium

Probe C:
Ask Ascalon from raw logs
  cost = 2
  latency = medium
  expected information = medium
```

AER should normally test A first.

### 10.2 Safety override

A high-value probe must still be rejected if:

- it requires an unavailable capability;
- it crosses a security boundary;
- it is unauthorized;
- it mutates production state without authorization;
- it exceeds the mission budget.

---

## 11. Latency Architecture

AER must be **fast by default and deep only when justified**.

### Tier 0 — Deterministic epistemics

Target: sub-millisecond to low-millisecond class where practical.

Examples:

- file existence
- schema validity
- known receipt fields
- lease state
- CAS digest
- static metadata

No LLM call.

### Tier 1 — Micro-AER

Use a fast decision model or small local reasoning component.

Target: tens to hundreds of milliseconds depending on the deployed stack.

Examples:

- classify uncertainty type;
- rank hypotheses;
- decide whether investigation is necessary;
- select the first probe;
- classify low-risk semantic ambiguity.

Batch related questions into one call.

### Tier 2 — Deep AER

Use Ascalon only when:

- uncertainty is material;
- multiple hypotheses remain;
- the task is semantically novel;
- counterfactual reasoning has material value;
- specialist routing is required.

Target: hundreds of milliseconds to seconds depending on model, hardware, context, and serving stack. This is an engineering budget to benchmark, not an assumed guarantee.

### 11.1 Hard deadline

Every AER invocation should include:

- deadlineMs
- maxModelCalls
- maxProbeCount
- maxCostUnits
- fallback policy

On timeout:

`TIMEOUT -> UNRESOLVED`

Never:

`TIMEOUT -> fabricated answer`

---

## 12. Caching

AER should cache deterministic or safely reusable epistemic evaluations.

Cache keys should include the relevant semantic fingerprint, model version, policy version, and evidence freshness.

Example:

`templateSemanticHash + modelRef + contextClass + policyVersion`

Cacheable examples:

- template feasibility;
- repeated source classification;
- static schema interpretation;
- stable failure signatures.

Never reuse stale epistemic state merely because the text is similar.

---

## 13. Parallel Probing

Independent read-only probes should be parallelized.

Instead of:

`A -> B -> C`

prefer:

`A || B || C`

when:

- probes are independent;
- they have no write conflicts;
- their capabilities permit parallel execution;
- concurrency policy allows it.

This keeps epistemic latency close to the maximum probe latency rather than the sum.

---

## 14. EpistemicContext — AER to Ascalon Contract

AER should provide Ascalon a compact, provenance-backed **EpistemicContext** rather than raw logs.

Conceptual payload:

```json
{
  "schemaVersion": "1.0",
  "state": "PARTIALLY_CONFIRMED",
  "known": [],
  "unknown": [],
  "contradictions": [],
  "measurements": [],
  "hypotheses": [],
  "recommendedProbes": [],
  "impact": {},
  "evidenceRefs": [],
  "cognitiveRecommendation": {},
  "budgets": {},
  "freshness": {}
}
```

### 14.1 What Ascalon receives

AER gives Ascalon:

1. **State** — current relevant facts.
2. **Uncertainty** — unresolved dimensions and reasons.
3. **Evidence** — source-backed support and contradictions.
4. **Alternatives** — plausible hypotheses or plans.
5. **Investigation history** — what has already been tested.
6. **Next probes** — candidate information-gathering actions.
7. **Impact** — affected floors/artifacts and reversibility.
8. **Cognitive routing recommendation** — why deep reasoning is or is not justified.
9. **Budgets** — latency, call, and cost limits.
10. **Freshness** — age and validity window of important observations.

### 14.2 What Ascalon must return

When operating over an EpistemicContext, Ascalon should return:

- reasoning result;
- updated hypotheses where appropriate;
- bounded proposal(s);
- evidence requests;
- unresolved items;
- uncertainty;
- assumptions;
- no authority grant.

Ascalon must not rewrite authoritative measurements.

---

## 15. Example EpistemicContext

```json
{
  "state": "UNCERTAIN",
  "known": [
    {
      "fact": "voice duration is 11.32 seconds",
      "source": "OBSERVED_MEASUREMENT"
    },
    {
      "fact": "timeline duration is 10.80 seconds",
      "source": "VERIFIED_FACT"
    }
  ],
  "unknown": [
    "whether F05 should expand the scene or request voice resynthesis"
  ],
  "contradictions": [
    {
      "claim": "timeline fits narration",
      "measurement": "duration mismatch +520ms"
    }
  ],
  "hypotheses": [
    {
      "id": "H1",
      "description": "timeline is too short",
      "support": 0.84,
      "status": "MODEL_INFERENCE"
    },
    {
      "id": "H2",
      "description": "voice should be resynthesized",
      "support": 0.31,
      "status": "MODEL_INFERENCE"
    }
  ],
  "recommendedProbes": [
    {
      "type": "COMPARE_WORD_ALIGNMENT",
      "estimatedCostUnits": 1
    }
  ],
  "impact": {
    "affectedFloors": ["F05", "F06", "F07"],
    "reversible": true
  },
  "cognitiveRecommendation": {
    "mode": "DEEP",
    "reason": "multiple viable hypotheses with downstream impact"
  }
}
```

The numeric values in this example are illustrative schema examples, not production calibration claims.

---

## 16. Epistemic Lifecycle

```
EVENT / STATE CHANGE
        |
        v
CAPTURE AUTHORITATIVE STATE
        |
        v
DETERMINISTIC FACT EXTRACTION
        |
        v
EPISTEMIC CLASSIFICATION
        |
        +---- no material uncertainty ----> CONTINUE
        |
        v
GENERATE / SELECT PROBES
        |
        v
COST + VALUE + SAFETY SCHEDULER
        |
        v
EXECUTE READ-ONLY PROBES
        |
        v
UPDATE EPISTEMIC STATE
        |
        +---- resolved --------------------> DECISION / CONTINUE
        |
        +---- still uncertain ------------> MICRO-AER / ASCALON
        |
        +---- high risk ------------------> HUMAN / GOVERNED ESCALATION
        |
        v
BOUNDED PROPOSAL
        |
        v
GUARDIAN + RUNTIME
        |
        v
REAL EXECUTION
        |
        v
MEASURED OUTCOME
        |
        v
EPISTEMIC LEDGER
```

---

## 17. Event-Driven Invocation

AER should not run on every floor transition.

Triggers should include:

- material state change;
- new contradiction;
- confidence/uncertainty threshold crossing;
- repeated failure signature;
- new evidence arriving;
- stale critical evidence;
- unexpected latency;
- provider behavior drift;
- novel task class;
- repair loop exhaustion;
- counterfactual decision with significant impact.

No-trigger transitions should remain cheap.

---

## 18. Integration with F00–F07

### F00 — Research

AER can identify:

- evidence gaps;
- conflicting sources;
- stale sources;
- unsupported claims;
- research questions with high information value.

Output to Ascalon:

`research epistemic brief`.

### F01 — Strategy

AER can analyze:

- strategy ambiguity;
- audience uncertainty;
- hypothesis strength;
- evidence coverage;
- alternative strategy assumptions.

### F02 — Script

AER can analyze:

- semantic ambiguity;
- claim density;
- unsupported assertions;
- narrative discontinuities;
- visualizability;
- temporal complexity;
- caption burden.

### F03 — Visual Asset Realization

AER can analyze:

- visual feasibility;
- continuity uncertainty;
- reference consistency risk;
- semantic mismatch hypotheses;
- unresolved asset dependencies.

AER must not replace F03's provider-neutral planning authority.

### F04 — Media Synthesis & Provider Execution

AER can analyze:

- synthesis uncertainty;
- pronunciation concerns;
- duration mismatch;
- media-provider failure hypotheses;
- rights/provenance evidence gaps.

### F05 — Timeline Composition

AER can analyze:

- timing mismatch;
- caption overlap;
- temporal density;
- sync-risk hypotheses;
- alternative timeline strategies.

### F06 — Rendering

AER can analyze:

- provider failure signatures;
- queue vs execution bottlenecks;
- transfer anomalies;
- render-time outliers;
- artifact receipt inconsistencies.

AER must not replace the physical F06 artifact verifier.

### F07 — Verification

AER can:

- explain failed gates;
- cluster failure causes;
- suggest investigative probes;
- identify repeated failure patterns.

F07 remains authoritative for physical verification and release readiness.

---

## 19. Relationship to Confidence

AER must preserve the project's existing distinction between:

- probability;
- epistemic confidence;
- calibration status;
- provenance.

Recommended interpretation:

> **Confidence tells us how strongly a model or process supports a proposition under a defined calibration regime. Epistemic state tells us the broader condition of knowledge.**

Therefore:

`confidence != truth`

and:

`high model confidence + missing evidence != CONFIRMED`

AER should prefer states such as:

- `MODEL_SUPPORTED`
- `OBSERVED`
- `PARTIALLY_CONFIRMED`
- `UNRESOLVED`

over pretending a single number is sufficient.

---

## 20. Failure and Safety Behavior

AER failure must be fail-closed.

### Failure classes

- `MODEL_TIMEOUT`
- `MODEL_UNAVAILABLE`
- `PROBE_TIMEOUT`
- `PROBE_UNAVAILABLE`
- `INSUFFICIENT_EVIDENCE`
- `CONTRADICTORY_EVIDENCE`
- `STALE_EVIDENCE`
- `BUDGET_EXCEEDED`
- `CAPABILITY_DENIED`
- `SCHEMA_INVALID`

### Required responses

If AER cannot establish a safe epistemic conclusion:

`UNRESOLVED`

If the next operation is unsafe:

`ESCALATE`

If a deterministic check can establish the fact:

`BYPASS_MODEL / USE_DETERMINISTIC_PROBE`

---

## 21. Security Model

AER must inherit existing ShortForge security boundaries.

### AER must not:

- receive unrestricted secrets;
- infer secrets from protected context;
- perform arbitrary filesystem mutation;
- invoke arbitrary MCP tools;
- mint capability grants;
- extend worker permissions;
- modify leases/fencing;
- directly publish;
- bypass audit logs.

### Probe authorization

Every probe should map to an explicit capability.

```
AER Probe
   |
   v
Capability registry
   |
   v
Guardian
   |
   v
authorized execution
```

Read-only does not automatically mean unrestricted.

---

## 22. Memory and Epistemic Ledger

AER should record:

- state fingerprint;
- measurements;
- hypotheses;
- probe choices;
- probe results;
- model predictions;
- observed outcomes;
- prediction errors;
- evidence freshness;
- calibration metadata;
- model/version identifiers.

This becomes a dedicated **Epistemic Ledger**.

The ledger should be:

- append-oriented;
- provenance-aware;
- replayable where deterministic;
- secret-scanned;
- training-eligibility aware.

Historical epistemic records are evidence/context, not authority.

---

## 23. Devourer Integration

AER creates a particularly useful substrate for Devourer.

Devourer can analyze:

```
prediction
   |
   v
probe
   |
   v
actual outcome
   |
   v
prediction error
   |
   v
recurring pattern
   |
   +--> new training sample
   +--> new evaluation case
   +--> new probe
   +--> calibration analysis
   +--> architecture improvement
```

Examples:

- AER repeatedly selects low-value probes.
- AER repeatedly misses one failure family.
- AER systematically overestimates visual feasibility.
- AER underestimates timing conflicts.
- AER calls deep cognition too often.
- AER fails to abstain under distribution shift.

Devourer may propose changes, but the existing training/promotion governance remains mandatory.

---

## 24. AER Training Data

AER-specific training material should come from real, verified trajectories.

Suitable examples:

- prediction vs. measured outcome;
- hypothesis vs. confirmed failure;
- successful probe selection;
- failed probe selection with observed cost;
- contradiction resolution;
- uncertainty classification;
- correct abstention;
- correct escalation;
- useful EpistemicContext construction.

Do not train AER on:

- fabricated metrics;
- synthetic success receipts presented as real;
- secret-bearing records;
- unverified model claims;
- simulation traces lacking explicit simulation labels;
- fake confidence values.

---

## 25. AER Evaluation

AER must be evaluated independently from Ascalon's generation quality.

Required metric families:

### Epistemic correctness

- confirmed-fact precision;
- unknown detection recall;
- contradiction detection accuracy;
- stale-state detection.

### Probe quality

- useful-probe rate;
- information gain per cost unit;
- probe waste rate;
- redundant-probe rate;
- parallelization efficiency.

### Cognitive routing

- unnecessary deep-call rate;
- missed-deep-call rate;
- deterministic-bypass rate;
- escalation quality.

### Reliability

- timeout handling;
- schema validity;
- fail-closed behavior;
- reproducibility where applicable.

### Calibration

- confidence calibration;
- task-specific calibration;
- population-specific calibration;
- confidence vs. observed outcome.

### Operations

- p50 latency;
- p95 latency;
- p99 latency where relevant;
- token/compute cost;
- cache hit rate;
- probe fanout;
- memory footprint.

---

## 26. Production Reliability Criteria

AER can be considered production-ready only after evidence shows:

1. It does not turn model guesses into authoritative facts.
2. It preserves provenance.
3. It abstains when evidence is insufficient.
4. It respects deadlines and budgets.
5. It fails closed.
6. It does not bypass Guardian or F07.
7. It improves investigation efficiency over fixed heuristics.
8. It has stable operational latency.
9. Its outputs remain schema-valid under adversarial inputs.
10. Its calibration is measured rather than assumed.
11. Its behavior is observable and replayable where applicable.
12. Its rollout can be canaried and rolled back independently of Ascalon.

---

## 27. Production Mode Matrix

| Mode | Model use | Main purpose | Authority |
|---|---|---|---|
| DETERMINISTIC | None | factual measurement | deterministic system |
| MICRO | fast model | low-cost epistemic classification | advisory |
| DEEP | Ascalon | complex uncertainty/hypothesis reasoning | advisory |
| SPECIALIST | external model/tool | specialized evidence/reasoning | advisory |
| HUMAN | human operator | unresolved/high-impact ambiguity | human authority |

AER should prefer the cheapest admissible mode.

---

## 28. Cost and Cognitive Budgets

Every mission or floor session may carry:

- maximum AER wall time;
- maximum deep calls;
- maximum micro calls;
- maximum probe count;
- maximum cost units;
- maximum parallel fanout.

Example:

```json
{
  "maxEpistemicTimeMs": 5000,
  "maxDeepCalls": 3,
  "maxMicroCalls": 20,
  "maxProbeCount": 25,
  "maxCostUnits": 50
}
```

Budget exhaustion is not permission to guess.

---

## 29. Observability

Every AER decision should emit traceable events:

- `AER_TRIGGERED`
- `AER_STATE_BUILT`
- `AER_PROBES_PROPOSED`
- `AER_PROBE_STARTED`
- `AER_PROBE_COMPLETED`
- `AER_HYPOTHESIS_UPDATED`
- `AER_ESCALATED`
- `AER_ASCALON_REQUESTED`
- `AER_ASCALON_COMPLETED`
- `AER_TIMEOUT`
- `AER_OUTCOME_RECORDED`

Trace links should connect:

`Mission -> Floor -> AER Event -> Probe -> Evidence -> Ascalon Call -> Proposal -> Outcome`

---

## 30. Example End-to-End Episode

### Problem

F06 render takes 42 seconds instead of an expected 15 seconds.

### AER

```
State:
  observed render = 42s
  historical median = 15s
  provider = CPU worker
```

AER creates hypotheses:

```
H1: FFmpeg encoding slowdown
H2: asset transfer bottleneck
H3: Whisper bottleneck
H4: worker startup overhead
```

Candidate probes:

```
P1: inspect stage timings
P2: inspect network transfer
P3: inspect CPU usage
P4: rerun full render
```

Scheduler selects:

``P1``

Result:

```
FFmpeg = 34s
asset transfer = 2s
Whisper = 3s
startup = 3s
```

AER updates:

``H1 strongly supported``

It sends Ascalon:

```
EpistemicContext:
  known: measured stage timings
  unknown: why FFmpeg expanded
  hypothesis: encoder configuration regression
  evidence: recent worker config change
  recommended probe: compare encoder arguments with prior good run
```

Ascalon proposes a bounded diagnostic.

Runtime performs the check.

Outcome is recorded back into AER.

Devourer later sees:

``render slowdown -> encoder config drift``

repeated 23 times and can create a focused training/evaluation case.

---

## 31. What AER Gives Ascalon — Summary Contract

AER's handoff should answer the following for Ascalon before deep reasoning begins:

### Current reality
What do we actually know?

### Knowledge boundary
What do we not know?

### Evidence
Why do we believe each important fact?

### Conflict
What disagrees?

### Alternatives
What explanations or plans remain plausible?

### Investigation history
What has already been tried?

### Next information
What measurements would be most useful?

### Impact
What happens if the issue is real?

### Cognitive routing
How much reasoning is justified?

### Constraints
What capabilities, policies, deadlines, and budgets apply?

### Output boundary
What can Ascalon propose, and what remains outside its authority?

This is the **Epistemic Brief** that makes Ascalon more effective without making it sovereign.

---

## 32. Implementation Boundary

The first implementation should be deliberately small.

### Phase 1 — Contract

Introduce:

- `EpistemicState`
- `EpistemicMeasurement`
- `CognitiveProbe`
- `Hypothesis`
- `EvidenceUpdate`
- `EpistemicContext`

### Phase 2 — Deterministic substrate

Integrate existing deterministic checks:

- schema;
- artifact;
- timing;
- capability;
- provider health;
- lease;
- evidence freshness.

### Phase 3 — Probe planner

Implement:

- probe registry;
- cost/latency metadata;
- safety checks;
- deadline;
- bounded fanout;
- cache policy.

### Phase 4 — Shadow AER

Run against historical/real trajectories without changing production decisions.

Measure:

- useful probes;
- wrong hypotheses;
- unnecessary calls;
- latency;
- prediction/outcome correlation.

### Phase 5 — Ascalon handoff

Introduce `EpistemicContext` as a bounded input contract to Ascalon.

### Phase 6 — Outcome learning

Close the loop from:

`prediction -> probe -> outcome -> epistemic ledger`

### Phase 7 — Controlled production

Use:

`shadow -> canary -> bounded production`

with rollback.

---

## 33. Non-Goals

AER is not:

- a general-purpose autonomous agent;
- a replacement for Overseer;
- a replacement for DecisionEngine;
- a replacement for Guardian;
- a replacement for F07;
- a scheduler with independent authority;
- a free-form memory dump;
- a confidence oracle;
- a self-training controller;
- an autonomous code-rewriter;
- a second workflow engine.

---

## 34. Key Architectural Principles

### Principle 1 — Evidence before certainty

Do not compress uncertainty into a number when structured evidence is available.

### Principle 2 — Cheapest reliable epistemic operation first

Do not call Ascalon when ffprobe, a schema checker, a hash, or a receipt already answers the question.

### Principle 3 — Confidence controls investigation, not authority

A model's confidence may justify more measurement; it cannot authorize production truth.

### Principle 4 — Unknown is a valid result

`UNKNOWN` and `UNRESOLVED` are successful epistemic outcomes when evidence is insufficient.

### Principle 5 — Every prediction can become an experiment

AER should connect hypotheses to probes and observed outcomes.

### Principle 6 — AER must be interruptible

Deadlines and budgets are first-class.

### Principle 7 — AER must remain replaceable

The runtime contract must survive replacement of the underlying model.

### Principle 8 — Reality closes the loop

Physical measurements and verified outcomes outrank model predictions.

---

## 35. Final Cognitive Architecture

The proposed long-term Ascalon architecture becomes:

```
                         WORLD STATE
                             |
                             v
                +---------------------------+
                | AER                       |
                |                           |
                | State understanding       |
                | Uncertainty               |
                | Contradictions            |
                | Hypotheses                |
                | Probe generation          |
                | Evidence selection        |
                | Cognitive routing         |
                | Counterfactuals            |
                +-------------+-------------+
                              |
                       EpistemicContext
                              |
                +-------------+-------------+
                |                           |
                v                           v
        Fast Decision Core            Ascalon Deep Core
                |                           |
                +-------------+-------------+
                              |
                        bounded proposal
                              |
                         Guardian
                              |
                        deterministic
                          execution
                              |
                    measurements / receipts
                              |
                              v
                         F07 / CAS
                              |
                              v
                         OUTCOME
                              |
                              +------> AER
                                         |
                                         v
                                      Devourer
                                         |
                                  evaluated improvement
```

### Final rule

> **AER determines the state of knowledge and the best next epistemic operation. Ascalon reasons over that state. FactoryOS executes only through authorized deterministic boundaries. F07 and physical evidence remain the final truth mechanism.**

This architecture is a target design until executable contracts, tests, shadow evidence, and production admission prove otherwise.
