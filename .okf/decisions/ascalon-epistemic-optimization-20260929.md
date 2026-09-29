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
