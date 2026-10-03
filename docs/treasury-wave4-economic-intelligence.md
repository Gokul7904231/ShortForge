# Treasurer Wave 4 — Economic Intelligence & Compatibility Retirement

Date: 2026-10-03
Status: IMPLEMENTED ON WAVE BRANCH; REMOTE VALIDATION PENDING

## Objective

Complete the transition from fragmented economic mechanisms to one production economic authority:

- Treasury Constitutional Kernel = authoritative admission/accounting.
- Economic Intelligence = read-only measurement, anomaly detection, forecasting, and advisory recommendations.
- Legacy economic components = compatibility/projection only.

No new scheduler or economic authority is introduced.

## Canonical runtime

```
Overseer
  -> selection / decision
  -> Treasury admission
  -> physical/provider execution
  -> measurement
  -> verification where required
  -> Treasury settlement/release
  -> Treasury Economic Intelligence
  -> bounded advisory projection
  -> Overseer / Ascalon / GLiDE
```

## Economic Intelligence

Implementation:
- `TreasuryEconomicIntelligence`: read-only analytics over the existing Treasury ledger.
- `TreasuryEconomicAdvice`: typed projection with no Treasury service handle.
- `/api/admin/treasury/economics`: authenticated read-only operator endpoint.
- `/admin/treasury`: operator visibility surface.

Measured outputs include:
- settled spend;
- cost per 1k measured tokens;
- cost per successful execution;
- cost per verified execution;
- reservation utilization;
- release/waste ratio;
- active reserved spend/capacity;
- provider/model observed economics;
- breach/denial/measurement signals;
- bounded 7-day and 30-day spend forecasts.

The forecast is intentionally a baseline extrapolation from measured spend rate. It is not a probabilistic guarantee.

## Compatibility retirement

### Quota

TreasuryQuotaAdmission owns the hot path.

Legacy Firestore quota:
- may bootstrap missing Treasury entitlement accounts;
- receives compatibility projections;
- is no longer the production admission authority.

Quota reads in user/admin/Overseer surfaces are Treasury-backed.

### Mission budget

MissionManager retains lifecycle constraints such as duration and parallelism.

Cost/token economic admission is Treasury-owned.

### CostGovernor

CapabilityFirstRouter no longer uses CostGovernor.

CostGovernor remains only for legacy tests/compatibility until its callers are fully retired.

Production CostGovernor cannot authorize spend.

### AgentEconomicsEngine

AgentEconomicsEngine remains advisory.

Authoritative execution cost must come from measured Treasury settlement. Hard-coded price estimates cannot authorize work.

### Generation compatibility

`/api/generations` is now a compatibility alias of `/api/generate-video`.

The scheduler triggers canonical generation and no longer performs independent quota admission.

### Model execution

Production legacy providerFactory calls are routed through IntelligentRouter + Treasury and receive a unique economic attempt identity.

Direct provider fallback remains only for non-production compatibility.

### Ascalon / GLiDE

Economic Intelligence may feed a bounded shadow projection to cognition.

The projection:
- contains no Treasury service handle;
- is marked SHADOW_ONLY;
- cannot authorize spend;
- cannot mutate Treasury state.

## Safety rules

1. Intelligence never mutates Treasury.
2. Recommendation never equals authorization.
3. Unknown paid pricing remains denied.
4. Each additional model/provider attempt requires a fresh reservation.
5. Ambiguous provider outcomes remain held until reconciliation.
6. Free monetary cost does not imply unlimited scarce capacity.
7. Legacy projections cannot override Treasury.
8. Forecasting cannot open an economic reservation.
9. Ascalon/GLiDE cannot bypass Treasury or change its constitutional rules.

## Remaining migration

The next cleanup after this wave is to remove obsolete compatibility callers and add stronger learned economics:
- provider price observations from authoritative receipts;
- anomaly baselines with historical windows;
- reservation right-sizing feedback loops;
- verified-short and verified-render unit economics;
- shadow routing experiments driven by Economic Intelligence;
- Ascalon economic reasoning only after sufficient verified trajectories exist.

These are advisory/learning improvements, not new economic authorities.
