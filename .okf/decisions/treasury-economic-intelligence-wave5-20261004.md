# Decision — Treasurer Economic Intelligence Wave 5

Date: 2026-10-04
Classification: compatibility retirement + advisory intelligence maturity

## Locked decision

Treasurer remains the only production economic authority.

Wave 5 removes production consumers of legacy economic models and strengthens Treasury Economic Intelligence as a read-only learning surface.

## Retired production dependencies

- CostGovernor is no longer used by CapabilityFirstRouter.
- MissionManager no longer delegates economic admission to MissionBudgetManager.
- AutonomousFactoryController no longer instantiates AgentEconomicsEngine.
- Direct Firestore quota admission is no longer the production path; TreasuryQuotaAdmission owns admission and reads.
- Legacy generation routing is collapsed into the canonical Treasury-gated generation path.

## Economic Intelligence

Economic Intelligence reads Treasury's durable ledger and calculates:

- historical spend baselines and anomaly signals;
- measured provider/model observed economics with confidence;
- verified render and verified short unit economics;
- reservation utilization and right-sizing suggestions;
- bounded spend forecasts.

It cannot:

- reserve;
- settle;
- release;
- freeze or unfreeze;
- mutate pricing;
- place workers;
- certify F07.

## Promotion path

```
MEASURE
  -> BASELINE
  -> DETECT
  -> RECOMMEND
  -> SHADOW
  -> VERIFIED OUTCOME COMPARISON
  -> HUMAN / OVERSEER REVIEW
  -> TREASURY KERNEL AUTHORIZATION
```

No Wave-5 component may skip a step.

## Model-learning boundary

AgentEconomicsEngine is no longer a production dependency. Historical tests may retain it temporarily, but any future learned route policy must use verified Treasury settlement data and remain shadow-only until promoted through existing authority gates.

## Rollback

Revert the Wave-5 compatibility retirement commits without modifying the Treasury Kernel contract.