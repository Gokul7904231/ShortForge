# ShortForge Worker and Layer Improvements

> Status: TARGET DESIGN / ROADMAP

## Overseer

Current strength: sovereign factory orchestration.

Add:

- cognitive-state summary instead of raw telemetry overload
- mission-level objective memory
- strategy selection before delegation
- global conflict resolver
- cross-floor learning feedback
- explicit ask-cognitive-layer interface
- architecture-proposal review queue

Rule: Overseer remains the authority. SCL supplies cognition; it does not supersede Overseer.

## Guardian

Add:

- capability-policy reasoning
- risk-tiered approval
- context-aware capability grants
- short-lived cognitive authorizations
- explicit denial explanations
- policy decision records

Rule: SCL may recommend an action; Guardian authorizes it.

## Slayer

Add:

- cognitive anomaly classification before eviction
- zombie-worker pattern memory
- lease-failure clustering
- predictive timeout hints
- deterministic hard kill

Rule: SCL may recommend eviction; Slayer owns revocation.

## Healer

Add:

- failure-family diagnosis
- repair-plan generation
- learned recovery ranking
- Last-Known-Good comparison
- repair-effectiveness tracking

Rule: healing is bounded and evidence checked.

## ReMaker

Add:

- semantic repair planning
- smallest-change reconstruction
- dependency-aware artifact invalidation
- compare-before-replace
- repair provenance

Rule: repair the smallest affected artifact instead of restarting the entire mission.

## Auditor / F07

Add:

- machine-readable findings
- evidence-linked explanations
- false-positive tracking
- regression memory
- feedback into SCL and Ascalon

Rule: F07 remains the verification authority for physical outcomes.

## Workers

Every worker should be:

- narrowly specialized
- contract-driven
- capability-fenced
- checkpointable
- observable
- independently testable
- replaceable
- able to report structured failure
- able to consume a compact cognitive contract

Workers do not decide their own authority boundary.

## Floor 00 — Research

Add:

- AgentReach-driven source discovery
- research normalization
- provenance capture
- Research IR
- evidence grading
- duplicate/copy detection
- freshness checks

## Floor 01 — Strategy

Add:

- strategy alternatives
- audience/channel memory
- evidence-linked rationale
- expected-outcome hypotheses

## Floor 02 — Scripting

Add:

- cognitive script templates
- retention structure checks
- factual claim checks
- engine-specific constraints
- reusable narrative patterns

## Floor 03 — Visual Assets

Add:

- visual-plan templates
- style consistency memory
- asset provenance
- scene-to-TimelineIR mapping
- engine capability matching

## Floor 04 — Voice / Audio

Add:

- voice-profile memory
- pronunciation dictionaries
- timing-aware synthesis
- audio-quality telemetry
- voice-engine fallback planning

## Floor 05 — Timeline

Add:

- template compilation
- constraint solving
- deterministic TimelineIR
- reusable transition patterns
- pre-render validation

## Floor 06 — Rendering

Add:

- capability-first compute selection
- worker health scoring
- lease/fencing enforcement
- artifact CAS
- provider performance learning
- cost/latency telemetry

## Floor 07 — QA / Compliance

Add:

- forensic media checks
- social compliance checks
- structured findings
- automated regression detection
- verified reward generation for Ascalon

## Cross-layer standard

All layers should share:

- TraceContext
- typed contracts
- capability-first routing
- provenance
- structured findings
- bounded retries
- Last-Known-Good preservation
- deterministic replay where possible
- explicit fidelity labels
- versioned templates
- model/version attribution

Common loop:

~~~
Observe → Decide → Execute → Verify → Record → Learn
~~~
