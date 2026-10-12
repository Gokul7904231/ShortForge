# Treasury Wave 7 — Verified Outcome Attribution and Promotion Evidence

Status: implementation proposal under validation
Date: 2026-10-12
Issues: #145, #146

## Why Wave 7 exists

Wave 6 already provides read-only verified-settlement calibration and shadow route comparison. Wave 7 adds the missing post-outcome step: compare the baseline route and shadow candidate using subsequent, independently F07-receipted outcomes and emit a review-only promotion-eligibility artifact.

## Data path

Shadow recommendation -> recommendation timestamp + baseline/candidate cohort IDs -> later verified outcomes with the same workload and capability -> strict identity / receipt / timestamp deduplication -> baseline vs candidate metrics -> independent sample/confidence, verification, P90 latency and realized-cost gates -> deterministic promotion evidence -> Human / Overseer review -> existing routing governance + Treasury Kernel admission.

## Default thresholds

- At least 30 unique, verified outcomes per cohort.
- High confidence at 100 or more outcomes; below the minimum is LOW confidence and blocks eligibility.
- Candidate verification success at least 95%.
- Candidate verification success no more than one percentage point below baseline.
- Candidate P90 latency regression at most 10%.
- Realized mean cost savings at least 5%.

Thresholds are explicit and can be supplied per evaluation. Changing thresholds is not an automatic policy promotion. The evidence artifact records thresholds used so results are reproducible.

## Inclusion and exclusion

Count an outcome only when its timestamp is after the recommendation was issued and not after evaluation time, its route/cohort/workload/capability match exactly, its status is VERIFIED, its F07 receipt is present and unique, its outcome ID is unique, and realized cost/latency are finite and non-negative.

Missing F07 receipts, unverified or malformed outcomes, duplicates, wrong workload/capability, incorrect cohort/route, stale observations, and future-dated observations are excluded.

## Result semantics

- ELIGIBLE_FOR_HUMAN_REVIEW: all measured gates passed; no policy change occurs.
- NOT_ELIGIBLE: one or more gates failed. Explicit reason codes explain the failure.

Every artifact carries a deterministic SHA-256 digest, comparison metrics, source evidence refs, cohort identities, sample counts, and immutable statements that it cannot authorize spend, change routing, execute providers, or mutate Treasury.

## Treasury stays the authority

The gate does not receive a Treasury service handle and never performs reserve, settle, release, freeze, provider execution, or price mutation. A recommendation is a proposed evidence package only. Promotion remains a human/Overseer-governed policy change followed by ordinary Treasury admission.

## Compatibility cleanup

The reliability benchmark should assert an unfunded-spend denial from Treasury Kernel, not the deprecated CostGovernor. The main FactoryOS barrel should stop exporting legacy admission facades; the compatibility-retirement test must scan the barrel so it cannot be silently exempted.