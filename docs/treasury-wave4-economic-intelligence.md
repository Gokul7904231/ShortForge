# Treasurer Wave 5 — Economic Intelligence Maturity & Compatibility Retirement

Date: 2026-10-04
Status: IMPLEMENTED ON WAVE BRANCH; REMOTE VALIDATION PENDING
Issue: #141

## Objective

Complete the next safe step after Wave 4:
- remove live production consumers of legacy economic authorities;
- mature Treasury Economic Intelligence from basic reporting into evidence-backed economic learning;
- keep Treasury Constitutional Kernel as the only economic authority.

## Wave 5 architecture

```
Treasury Ledger
    |
    v
Economic Intelligence
    |
    +--> historical baseline / anomaly signals
    +--> observed provider-model economics
    +--> verified render / verified short unit economics
    +--> reservation right-sizing insights
    +--> bounded spend forecast
    |
    v
TreasuryEconomicAdvice (projection only)
    |
    v
Overseer / Ascalon / GLiDE
    |
    v
recommendation only
    |
    v
Treasury Kernel
    |
    v
actual admission / reservation / settlement
```

Economic Intelligence has no mutation path.

## Compatibility retirement

### CostGovernor

No longer used by the capability router and no longer present in the production controller graph.

The class remains temporarily for historical compatibility tests until the repository's older test/evaluation consumers are retired.

### MissionBudgetManager

No longer used by MissionManager for economic admission.

MissionManager retains only lifecycle constraints such as duration and parallelism.

### AgentEconomicsEngine

No longer instantiated by AutonomousFactoryController.

CognitiveOutcomeLearner now accepts a generic telemetry sink rather than depending on AgentEconomicsEngine. Historical AgentEconomicsEngine tests can remain until their final cleanup wave.

### User quota

TreasuryQuotaAdmission owns the hot path and read model.

Legacy Firestore quota can only:
- bootstrap a missing Treasury entitlement account;
- receive a compatibility projection.

It cannot override Treasury state.

### Generation / scheduler

Legacy generation URL is a compatibility alias to canonical generation.

Scheduler is trigger-only and interprets Treasury's quota denial response.

## Economic Intelligence maturity

### Historical baseline

Measured daily spend is compared with a recent rolling baseline. The baseline exposes:
- sample count;
- mean daily spend;
- standard deviation;
- latest normalized daily spend;
- z-score;
- severity;
- confidence.

No forecast is treated as a guarantee.

### Observed provider economics

Treasury settlement evidence produces provider/model observed cost per 1k measured tokens. Confidence rises with the number of measured invocations.

Unknown or unmeasured economics are not treated as a valid optimization signal.

### Verified unit economics

Treasury now distinguishes:
- cost per verified execution;
- cost per verified render;
- cost per verified short when a verification receipt exists.

A verified metric requires actual Treasury settlement evidence.

### Reservation right-sizing

Economic Intelligence groups completed monetary reservations by workload type and estimates:
- sample count;
- median utilization;
- P90 utilization;
- recommended reservation multiplier;
- confidence.

The recommendation is advisory and cannot modify a reservation automatically.

## Shadow learning boundary

Ascalon / GLiDE may consume TreasuryEconomicAdvice.

The projection explicitly carries:
- authorityClass = SHADOW_ONLY;
- canAuthorizeSpend = false.

It contains no Treasury service object.

## Acceptance gates

1. Treasury Wave 5 focused tests pass.
2. Authority-retirement tests pass.
3. Treasury admission and provider-retry regressions pass.
4. Static production authority scan finds no legacy consumer.
5. Current-main ComputePool/ReMaker/Overseer/F06/F07 gates remain green.
6. Any unavailable security tooling remains explicitly unproven rather than being replaced with synthetic evidence.

## Next wave after Wave 5

Only after sufficient verified data exists:
- learned route-quality/cost calibration;
- stronger anomaly baselines;
- reservation envelope feedback experiments in shadow mode;
- verified-short economic attribution across complete missions;
- controlled Ascalon economic reasoning experiments.

These remain advisory until explicitly promoted through existing authority boundaries.