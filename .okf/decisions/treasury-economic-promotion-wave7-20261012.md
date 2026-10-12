# Decision — Treasury Wave 7 Outcome Attribution and Promotion Evidence

Date: 2026-10-12
Classification: read-only economic evidence; no authority promotion

## Locked decision

Treasury Constitutional Kernel remains the only economic-admission authority. Treasury Wave 7 may classify a shadow recommendation as eligible for human/Overseer review only after later, F07-receipted outcomes are compared against an explicit baseline cohort.

## Required evidence rules

- Baseline and candidate use distinct route and cohort identities.
- Only outcomes later than the recommendation timestamp and no later than the evaluation timestamp are considered.
- Each counted outcome must match the same workload and capability class, carry a unique outcome ID and F07 receipt ID, and include non-negative finite realized cost and measured latency.
- Minimum sample size/confidence, candidate verification success, non-inferiority to baseline, P90 latency regression, and realized savings are independent gates.
- Missing, duplicate, stale, mismatched, unverified, or malformed outcome records cannot improve promotion eligibility.
- The output is a deterministic, SHA-256-digested evidence artifact with evidence references and explicit reason codes.

## Authority boundary

The gate is read-only. It cannot authorize spend, mutate Treasury, change live routing policy, execute providers, create reservations, freeze/unfreeze Treasury, or grant AER/Ascalon authority. ELIGIBLE_FOR_HUMAN_REVIEW is not a production promotion; human/Overseer decision and ordinary Treasury admission remain mandatory.

## Compatibility retirement

The reliability benchmark must exercise the Treasury Kernel's actual insufficient-funds denial instead of testing CostGovernor. The broad FactoryOS barrel must not export CostGovernor or MissionBudgetManager, and the compatibility-retirement test must inspect that barrel rather than exempting it.

## Acceptance evidence

- Deterministic unit tests for success, quality regression, latency regression, small samples, invalid/missing verification evidence, and savings threshold.
- Strict TypeScript and FactoryOS typechecks.
- Treasury Wave 4/5/6, Compute Pool, ReMaker, physical F06/F07, OKF, Team and repository CI remain green.
