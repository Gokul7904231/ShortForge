# Treasurer Wave 7 — Verified Shadow Outcome Attribution & Promotion Evidence

Date: 2026-10-04
Status: IMPLEMENTED ON WAVE BRANCH; REMOTE VALIDATION PENDING
Issue: #145

## Objective

Advance Treasury Economic Intelligence from historical shadow recommendation to measured outcome attribution and governed promotion evidence.

Wave 7 does not promote routing automatically. It proves whether an observed alternative route has enough verified evidence to enter a human/Overseer review workflow.

## Architecture

```
Treasury settlement evidence
        |
        v
TreasuryEconomicCalibration
        |
        v
TreasuryShadowRouteEvaluator
        |
        v
shadow recommendation
        |
        v
TreasuryShadowOutcomeAttribution
        |
        v
TreasuryEconomicPromotionGate
        |
        +---- INSUFFICIENT_EVIDENCE
        +---- REJECTED
        +---- READY_FOR_REVIEW
                     |
                     v
             Human / Overseer review
                     |
                     v
              explicit policy change
                     |
                     v
              Treasury admission
```

## Verified outcome attribution

Attribution compares explicit baseline and candidate cohorts in the same workload/capability class using verification-backed Treasury settlement evidence.

The evidence record contains:
- deterministic evidence ID;
- baseline and candidate identities;
- cohort sample counts;
- confidence;
- measured cost per 1k tokens;
- measured P90 latency;
- verification-success rate;
- realized cost savings;
- realized latency delta;
- verification delta;
- source time window.

## Promotion gate

Default production review criteria are intentionally conservative:

- minimum 30 samples per route;
- minimum 10% realized cost savings;
- candidate verification success >= 90%;
- candidate verification regression <= 2 percentage points versus baseline;
- candidate P90 latency regression <= 10%;
- evidence quality must be USABLE or STRONG.

READY_FOR_REVIEW means only that the evidence satisfies the promotion gate. It is not an economic permit.

## Safety invariants

- No Treasury mutation capability is exposed.
- No provider execution occurs.
- No route override occurs.
- No price mutation occurs.
- No reservation resize occurs.
- No Ascalon authority is granted.
- Quality/capability/latency gates are evaluated independently of economic savings.
- Low-confidence evidence cannot reach READY_FOR_REVIEW.
- A future live attempt still goes through normal Treasury admission.

## Rollback

Remove the attribution/evidence endpoint and related operator surfaces. Leave the Treasury Kernel, price registry, reservation lifecycle, and Wave-6 calibration intact.

## Next wave

Only after sufficient evidence exists should ShortForge consider a controlled shadow-canary process. Any canary must remain separately governed and continue using Treasury for economic admission.
