# Decision — Treasurer Economic Intelligence Wave 4

Date: 2026-10-03
Classification: extends existing rule + compatibility retirement

## Decision

Keep one economic authority: Treasurer.

Add Economic Intelligence as a read-only advisory layer over Treasury's existing durable ledger. Do not create a second scheduler, wallet, budget manager, or metering authority.

## Boundaries

```
Treasury Kernel
  | authoritative
  v
Economic Intelligence
  | advisory projection only
  v
Overseer / Ascalon / GLiDE
  | recommendation
  v
Treasury Kernel
  | actual authorization
  v
Execution
```

Economic Intelligence has no write capability to Treasury.

## Retirements

- Firestore quota becomes bootstrap/projection rather than admission authority.
- MissionManager no longer delegates economic admission to MissionBudgetManager.
- CapabilityFirstRouter no longer delegates economic admission to CostGovernor.
- ProviderFactory direct execution is forbidden in production without Treasury context.
- Legacy /api/generations is a compatibility alias of canonical generation.
- Scheduler no longer owns quota admission.

## Intelligence signals

Economic Intelligence reports:
- measured spend;
- reservation utilization/waste;
- cost per 1k tokens;
- cost per successful/verified execution;
- provider/model economics;
- capacity pressure;
- denials, expiry, breaches;
- bounded spend forecasts.

## Non-goals

- No automatic budget mutation from a recommendation.
- No autonomous Treasury price mutation.
- No physical provider selection.
- No F07 verification.
- No Ascalon Treasury authority.
- No new persistent state database.

## Promotion path

```
MEASURE
  -> DETECT
  -> RECOMMEND
  -> SHADOW
  -> COMPARE AGAINST VERIFIED OUTCOMES
  -> HUMAN/OVERSEER PROMOTION
  -> TREASURY KERNEL ADMISSION
```

Economic Intelligence cannot skip directly from recommendation to authorization.
