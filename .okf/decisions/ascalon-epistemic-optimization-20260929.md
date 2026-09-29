# Decision Record — AER Cost-Efficient Ascalon Admission

Date: 2026-09-29
Status: IMPLEMENTED FOUNDATION / SHADOW-ONLY / VALIDATION PENDING
Classification: Extends existing AER rule and tightens the Ascalon pre-call boundary

## Decision

Optimize AER around **cost per resolved uncertainty** instead of raw token/request minimization.

AER must make Ascalon escalation explicit and policy-derived through:

- shouldInvokeAscalon
- reasonCode
- expectedValue
- estimatedCostUnits
- remaining Ascalon budget

A deterministic AscalonInvocationGate must be evaluated immediately before an Ascalon call.

## Routing policy

Prefer:

DETERMINISTIC -> MICRO -> DEEP(Ascalon) -> SPECIALIST/HUMAN

Deep Ascalon is allowed only when material uncertainty exists, policy-estimated expected value meets the configured threshold, the model is available, and remaining time/call/cost budget can afford the invocation.

## Measurement

AERMetricsRecorder measures:

- AER invocation rate;
- Ascalon escalation recommendation rate;
- actual Ascalon invocation rate;
- average probes per uncertainty;
- cache hit rate;
- AER and Ascalon p50/p95 latency;
- cost per resolved uncertainty;
- false-reassurance rate;
- probe usefulness rate;
- unnecessary-escalation rate.

The expectedValue field and hypothesis support remain routing/ranking signals and are never treated as truth.

## Authority boundary

This optimization does not grant Ascalon any new authority. AER remains advisory. Guardian, AEF, leases/fencing, publishing, and F07 physical verification remain outside AER.

## Validation gate

The change must remain shadow/advisory until repository CI, targeted AER tests, security checks, and shadow/outcome replay establish measured behavior. Illustrative 85/10/4/1 routing mixes are not production measurements.

## Remediation additions

The implementation phase additionally introduced:

- a decision-theoretic value model using baseline-vs-Ascalon incremental utility;
- provider/model cost-token estimation and actual usage telemetry;
- a bounded AER probe execution bridge to AEF;
- a reassessment loop with batch budget accounting and verified-evidence resolution;
- durable SQLite budget reservations and a commit/release coordinator;
- a canonical pre-call gate integrated before Ascalon proposal generation;
- a second governance guard against direct ADMITTED Ascalon execution bypass;
- policy-driven material evidence freshness;
- multi-pass episode accounting for calibration;
- conservative observed-outcome routing policy generation retained in shadow mode.

The production gate remains blocked until fresh CI/security/shadow replay evidence is observed.
## Remediation Wave 2 — Adaptive Epistemic Runtime Hardening

### Repository-implemented upgrades

This wave strengthens the foundation without granting AER execution authority.

1. **Counterfactual VOI**
   - AER evaluates baseline and Ascalon expected utility separately.
   - Escalation is based on the incremental utility delta after priced compute and latency.
   - Latency uses p95 when supplied and adds a configurable safety margin.
   - Uncalibrated priors remain blocked from production Ascalon influence by default.

2. **Decision artifact**
   - Cognitive recommendations now carry a policy version, deterministic decision identity, and baseline/Ascalon counterfactuals.
   - These fields are evidence for replay and calibration, not authorization.

3. **AEF execution boundary**
   - `ScopedToolAERExecutionFabricBridge` translates AER probe requests into the existing `ScopedToolExecutor`.
   - AER cannot directly access the tool registry or mutate execution state.
   - Successful tool results retain measured `costUsd`, `evidenceId`, and side-effect metadata for downstream accounting.

4. **Probe quality**
   - Optional decision-change probability and hypothesis-discrimination signals refine probe prioritization.
   - AER still treats these as planning estimates, not truth.

5. **Episode deadline**
   - Investigation uses one episode deadline rather than resetting the time budget on every re-plan.

6. **Durable telemetry contract**
   - AER exposes a metadata-only episode telemetry sink and JSONL implementation.
   - The sink is observational and failure-isolated; it never becomes an execution dependency.

7. **Shadow policy promotion**
   - `AERPolicyPromotionGate` checks sample size, resolution non-inferiority, false-reassurance bounds, latency regression, cost savings, and authority violations.
   - Passing the gate only means `eligible for governed promotion`; it never mutates the live policy automatically.

### Research alignment

The design is informed by recent work showing that adaptive test-time compute is a constrained allocation problem, budget-aware routing benefits from contextual feedback, and sequential information gathering can be framed using Bayesian experimental design. Current OpenTelemetry GenAI conventions also provide a useful vocabulary for model identity, usage, duration, and agent/tool traces.

### Evidence rule

No claim of production readiness is made by this record. The release gate remains:
`repository CI -> targeted tests -> security validation -> shadow replay -> measured outcome evidence -> controlled promotion`.
