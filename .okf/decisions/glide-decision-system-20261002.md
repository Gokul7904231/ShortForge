# GLiDE Decision System — ShortForge

> Date: 2026-10-02
> Status: IMPLEMENTED / SHADOW-ONLY / PROMOTION PENDING
> Scope: Fast decisioning for compute-worker selection and future narrow high-frequency decisions

## 1. Decision

ShortForge adds Fastino GLiDE as an external Fast Decision Core candidate.

GLiDE is not the authority plane. It receives a closed set of already-eligible compute candidates and provides an advisory ranking/decision.

Current mode:

DETERMINISTIC HARD GATES -> GLiDE ADVICE -> DETERMINISTIC COMPUTE ROUTER -> WORKER -> F07

GLiDE cannot:

- grant capabilities;
- override ComputePolicy;
- create or extend leases;
- change fencing;
- execute a provider;
- publish;
- certify F07;
- replace Guardian;
- replace ComputeRouter failover.

## 2. Why GLiDE

Fastino documents GLiDE as a structured decision model that accepts application state plus typed questions and returns structured choices, probabilities, and confidence. GLiDE uses an initial fast assessment and allocates additional reasoning when the decision is uncertain.

ShortForge uses this idea for worker selection:

- easy worker choice should stay fast;
- ambiguous worker choice may receive more model reasoning;
- every answer remains bounded by a routing deadline;
- the model never sees credentials or authority-bearing secrets.

Reference:
https://docs.fastino.ai/inference/systemone
https://fastino.ai/blog/introducing-glide-the-first-thinking-decision-model

## 3. Worker selection boundary

The deterministic ComputeRouter remains responsible for hard eligibility:

1. provider policy;
2. provider health;
3. current availability;
4. workload support;
5. GPU requirement;
6. other hard compute requirements.

Only candidates that pass those checks are sent to GLiDE.

Therefore GLiDE is not allowed to select a blocked, draining, unavailable, or capability-incompatible provider.

The model chooses within the closed candidate set.

## 4. GLiDE worker decision packet

The state sent to GLiDE contains only the information needed for routing:

### Job
- workload type
- GPU requirement
- preferred GPU type
- CPU/memory minimums
- expected execution duration
- routing deadline

### Candidate
- provider id/type
- eligibility flag
- active job count
- current health
- recent success rate
- observed average latency
- CPU/RAM/GPU capability
- GPU type
- hardware encoder capability
- startup estimate
- transfer estimate
- concurrency
- estimated total time
- estimated execution time
- deterministic utility score

No API keys, access tokens, provider secrets, leases, fencing tokens, or private credentials are included.

## 5. Questions sent in one GLiDE call

The adapter asks four related questions against the same state:

1. Which eligible worker should execute the render?
2. Which worker is most likely to finish within the deadline?
3. Which worker appears most reliable?
4. Which worker is currently most available/free?

GLiDE supports multiple named questions against one shared state in one request, avoiding four separate network round trips.

## 6. Confidence

GLiDE's documented confidence for Choice is the probability margin: top1 - top2.

ShortForge recomputes that value from the returned distribution and rejects materially inconsistent provider confidence.

A GLiDE confidence value is not treated as production truth and is not directly reused as a business threshold.

The worker-routing threshold must be calibrated against observed ShortForge outcomes.

## 7. Fail-closed behavior

The adapter returns UNRESOLVED when:

- GLiDE is disabled;
- FASTINO_API_KEY is absent;
- state is empty;
- response shape is invalid;
- candidate is not declared;
- probabilities are malformed;
- probability distribution does not normalize;
- confidence is inconsistent with the documented margin;
- provider request times out;
- the provider is unavailable.

The existing deterministic ComputeRouter remains usable when GLiDE is unavailable.

## 8. Retry behavior

ShortForge retries only transient GLiDE statuses documented by Fastino:

- 425
- 429
- 503

Retries are bounded and honor Retry-After when supplied, subject to ShortForge's much tighter worker-selection latency budget.

Authentication/validation failures are not retried.

## 9. Score handling

GLiDE Score returns:

- score: winning level index;
- expected_level: probability-weighted level;
- probabilities: distribution over level indexes.

ShortForge maps the returned index to its local rubric and uses expected_level when a weighted score is needed.

## 10. Adaptive cognition

The intended ShortForge decision stack is:

DETERMINISTIC -> FAST DECISION (GLiDE / future local core) -> DEEP ASCALON -> SPECIALIST/HUMAN

GLiDE is the fast-decision specialist for narrow decisions.

Ascalon remains the deeper cognitive system for:

- unfamiliar failures;
- multi-step diagnosis;
- novel repairs;
- architecture/procedure proposals;
- materially uncertain cases where deeper reasoning is justified.

This preserves the existing AER principle that expensive cognition is an escalation, not a default dependency.

## 11. Promotion path

Current status is shadow-only.

Before GLiDE can influence authoritative worker selection, ShortForge must collect outcome evidence for representative jobs:

- selected provider;
- alternative providers;
- actual startup time;
- actual queue time;
- actual execution time;
- actual end-to-end completion time;
- artifact success/failure;
- failover frequency;
- provider preemption/interruption;
- GLiDE confidence;
- deterministic router choice;
- observed winner.

Required evaluation:

1. shadow agreement/disagreement analysis;
2. calibration of confidence thresholds;
3. latency p50/p95;
4. false-reassurance rate;
5. deadline miss rate;
6. unnecessary escalation rate;
7. failover recovery time;
8. provider-cost impact;
9. representative workload replay;
10. canary with rollback.

No benchmark number is a production promise until ShortForge measures it on real workloads.

## 12. Future local Fast Decision Core

A later optimization can use an open-weight small decision model such as Fastino's GLiNER2.5-Decide for very high-frequency, low-complexity decisions.

Potential future path:

deterministic -> local micro model -> GLiDE -> Ascalon

That future path requires its own accuracy/calibration/latency evidence and should not be assumed from vendor benchmarks.

## 13. Canonical rule

> Deterministic systems decide what is allowed. GLiDE advises which eligible candidate looks most suitable. ComputeRouter performs the controlled handoff. Workers perform the work. F07 verifies the physical result.