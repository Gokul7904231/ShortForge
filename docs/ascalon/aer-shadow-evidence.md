# AER Shadow Evidence and Calibration Boundary

> Status: IMPLEMENTED ON REVIEW BRANCH; CI AND SHADOW QUALIFICATION PENDING
> Runtime mode: SHADOW / ADVISORY ONLY
> Authority: Existing AER specification; this work grants no routing, execution, or promotion authority.

## 1. Outcome verification is an explicit dependency

Previously, AER metrics accepted any outcome with a non-empty `verificationRef`, non-empty `evidenceRefs`, and `authoritativeSource: VERIFIED_SYSTEM`. That validates the shape of a claim, not the referenced evidence.

The updated `AEROutcomeEvidenceVerifier` is the trusted adapter boundary to the authoritative receipt/evidence store. It must resolve:

- the outcome's `verificationRef`;
- every `evidenceRef`;
- every `necessityAssessment.evidenceRef`, when a necessity verdict is supplied.

There is no permissive default verifier. When one is absent, throws, or rejects a receipt, `AERMetricsRecorder.recordOutcome` returns `admitted: false`, records only an unverified telemetry event, and does not update calibration counts or resolution outcomes.

A verifier implementation must be backed by the real evidence store; test stubs are only test fixtures and are not production verification.

## 2. Shadow replay uses the same evidence boundary

`AERShadowReplayEvaluator` now requires an outcome verifier before a historical episode can affect replay counts or necessity metrics.

Unverified episodes are counted separately as `unverifiedEpisodeCount` and are excluded from:

- policy decision comparisons;
- controlled-necessity coverage;
- unnecessary escalation counts;
- missed-necessary-escalation counts.

The evaluator remains offline. It does not invoke tools, probes, models, or policy writes.

## 3. Promotion requires controlled-necessity evidence

The policy promotion gate now also requires:

- a non-missing controlled-necessity coverage rate meeting the configured minimum;
- missed necessary escalations at or below the configured maximum.

A candidate with no replay evidence cannot qualify, regardless of sample size, apparent cost reduction, or latency improvement. The gate only determines eligibility for a separate human/governance-controlled workflow; it never changes the live policy.

## 4. Local shadow telemetry

`JsonlAEREpisodeTelemetrySink` provides a local append-only metadata log:

- append operations are asynchronous and serialized;
- each record is flushed using `fdatasync`;
- files are created/restricted to owner-only permissions where supported;
- prompts, credentials, raw model content and chain-of-thought are not written;
- append failures are exposed through `health()` rather than silently disappearing.

This is crash-durable local logging, not distributed or replicated persistence. It is not acceptable as production evidence storage for multi-worker deployments.

## 5. Explicit shadow composition

`createAERShadowRuntime` composes:

- `AEREngine`;
- `AERMetricsRecorder`;
- the metadata-only JSONL sink;
- a caller-supplied trusted outcome evidence verifier.

The factory is deliberately not wired into production routing. Supplying a verifier and creating a log does not qualify AER, enable canary routing, or promote a policy.

## 6. Current readiness and remaining work

This implementation hardens the evidence boundary and telemetry adapter, but AER remains unqualified. Remaining work includes:

1. Implement the trusted verifier against ShortForge's authoritative outcome/F07 evidence and controlled-replay records.
2. Wire the factory into a restricted staging/shadow composition without changing the live routing decision.
3. Collect real shadow episodes with independent receipts and inspect telemetry sink health.
4. Evaluate baseline and candidate policy on verified held-out episodes, including false reassurance, controlled-necessity coverage, missed necessary escalations, cost and p95 latency.
5. Complete security review and explicit governance approval before any promotion.

No live production routing, canary, Ascalon checkpoint invocation, model-weight training, Guardian permission, lease/fencing rule, or F07 authority is changed by this branch.
