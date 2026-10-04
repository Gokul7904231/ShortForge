# Treasurer Wave 6 — Verified Economic Calibration & Shadow Route Evaluation

Date: 2026-10-04
Status: IMPLEMENTED ON WAVE BRANCH; REMOTE VALIDATION PENDING
Issue: #143

## Objective

Turn verified Treasury evidence into a calibrated, counterfactual route-intelligence surface without creating a second economic authority.

## Architecture

```
Treasury durable ledger
        |
        v
TreasuryEconomicCalibration
        |
        v
TreasuryShadowRouteEvaluator
        |
        v
shadow recommendation / evidence
        |
        v
Overseer / Ascalon / GLiDE
        |
        v
Treasury Kernel (actual admission only)
```

The calibration/evaluator layer is read-only. It does not receive a TreasuryService handle.

## Calibration source

Only `RESOURCE_CONSUMED` events with a verification receipt are eligible for route calibration.

Each observation carries:
- provider;
- model;
- workload type;
- capability where present;
- sample count;
- total measured spend;
- average/P50/P90 measured latency;
- measured tokens;
- cost per 1k measured tokens where available;
- verification success rate;
- confidence.

Unverified events remain telemetry but cannot influence shadow route advice.

## Shadow route evaluation

Evaluation applies independent gates:

1. capability/workload match;
2. minimum sample count;
3. evidence confidence;
4. minimum verified success rate;
5. maximum P90 latency.

Only after those quality/latency gates pass does economic comparison occur.

A recommendation includes:
- baseline route;
- alternative route;
- expected cost savings;
- expected latency delta;
- confidence;
- evidence-based rationale.

No provider is executed. No Treasury reservation is opened.

## Safety invariants

- Economic Intelligence cannot reserve, settle, release, freeze, or mutate Treasury.
- Shadow evaluation cannot place workers.
- Cost savings alone cannot override quality, latency, capability, or evidence confidence.
- Each future live attempt still requires normal Treasury admission.
- Learned/shadow recommendations never become live routing policy automatically.
- No new wallet, budget authority, scheduler, or pricing authority is introduced.

## Promotion path

```
VERIFIED MEASUREMENT
  -> CALIBRATION
  -> SHADOW COMPARISON
  -> VERIFIED OUTCOME COMPARISON
  -> HUMAN / OVERSEER REVIEW
  -> EXPLICIT ROUTING-POLICY PROMOTION
  -> TREASURY ADMISSION
```

Wave 6 stops at shadow comparison. Policy promotion is a later governed decision.

## Rollback

Remove the calibration/evaluator and shadow endpoint. Do not alter Treasury Kernel contracts or admission semantics.
