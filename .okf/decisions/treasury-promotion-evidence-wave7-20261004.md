# Decision — Treasurer Verified Promotion Evidence Wave 7

Date: 2026-10-04
Classification: advisory governance maturity

## Decision

Keep Treasury Constitutional Kernel as the sole economic authority.

Introduce TreasuryShadowOutcomeAttribution and TreasuryEconomicPromotionGate as read-only evidence services.

## Promotion meaning

A passing result means READY_FOR_REVIEW.
It does not mean PROMOTED.
The gate only establishes that a candidate route has sufficient verified evidence to enter a separate human/Overseer-controlled policy workflow.

## Evidence policy

Only verification-backed RESOURCE_CONSUMED settlement evidence is eligible.

A candidate must demonstrate:
- enough samples;
- measured economic savings;
- non-inferior verification success;
- bounded latency regression;
- usable/strong evidence quality.

## Authority separation

```
Economic Intelligence -> recommendation
Promotion Gate       -> eligibility evidence
Overseer / Human     -> policy decision
Treasurer Kernel     -> actual economic admission
ComputeRouter        -> physical placement
F07                  -> final verification
```

No component above the Treasury Kernel may issue a Treasury permit.

## Explicit non-goals

- no automatic route promotion;
- no automatic Treasury policy mutation;
- no provider execution from shadow logic;
- no new wallet/budget authority;
- no learned policy written into the live router;
- no Ascalon Treasury sovereignty.
