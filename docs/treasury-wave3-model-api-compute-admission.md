# Treasurer Wave 3 — Model/API + ComputeOffer Admission

Date: 2026-10-03
Status: IMPLEMENTED ON WAVE BRANCH; REMOTE VALIDATION PENDING

## Objective

Make Treasurer the single economic admission boundary for model/API inference and API-backed ComputeOffer provisioning.

## Canonical model path

Overseer command
  -> Decision Fabric
  -> AIRuntime
  -> IntelligentRouter selection
  -> Treasury price + RESERVE
  -> provider executes exactly one managed attempt
  -> measured usage
  -> Treasury SETTLE or conservative failure settlement
  -> result

Router responsibilities remain:
- capability matching;
- quality/suitability;
- latency;
- provider health;
- ordering among candidates.

Treasurer responsibilities are:
- economic price;
- hard budget envelope;
- paid/free monetary admission;
- token/capacity reservation;
- retry expenditure boundary;
- settlement/reconciliation.

## Canonical ComputeOffer path

Compute placement intent
  -> ProviderApiRegistry discovers normalized ComputeOffer
  -> Router/selection logic identifies the desired offer
  -> Treasury admits the exact offer
  -> Treasury RESERVE
  -> ProviderApiRegistry provisions
  -> resource lifecycle/reconciliation
  -> Treasury SETTLE or RELEASE

Treasurer does not select the physical worker. Provider/API control remains responsible for provider mutation and reconciliation.

## Important economics

- Free monetary price does not mean unlimited capacity.
- Paid model/API calls require an active Treasury price.
- Unknown paid pricing is denied rather than guessed.
- ComputeOffer cost is derived from the current offer's USD hourly price and minimum billed duration.
- Expired offers are denied.
- Treasury-managed provider internals cannot silently retry.
- Each additional model/provider attempt requires a fresh economic reservation.
- Ambiguous non-idempotent provider provisioning does not auto-release the Treasury hold; reconciliation owns that uncertainty.

## Migration status

Authoritative:
- Treasury Constitutional Kernel
- Treasury reservation/settlement ledger
- Treasury price registry
- TreasuryEconomicAdmission
- Treasury-gated IntelligentRouter
- Treasury-backed ProviderApiRegistry.provisionWithTreasury

Compatibility-only during staged migration:
- CostGovernor
- AgentEconomicsEngine hard-coded economic heuristics
- MissionBudgetManager
- legacy user quota reservation/finalization
- legacy ProviderRouter / generateBasicVideoContent path

These compatibility mechanisms must not be reintroduced as new production economic authorities.

## Retry boundary

Treasury-managed model execution uses:
1. CallGate/deterministic bypass where applicable;
2. one provider attempt under the reserved envelope;
3. a new Treasury reservation for another attempt.

This eliminates hidden provider-level retries from the economic accounting boundary.

## Production behavior

Production AI runtime and F06 rendering fail closed when required Treasury context is absent.

The Treasury service is persistent through transaction-capable MongoDB in production. In-memory Treasury remains test infrastructure.

## Remaining migration after Wave 3

1. Retire direct legacy quota writes/read-authority after UI projections are fully Treasury-derived.
2. Retire direct MissionBudgetManager consumers after all mission policy checks read Treasury mission envelopes.
3. Remove CostGovernor imports from compatibility callers.
4. Move AgentEconomicsEngine from heuristic cost hints toward Treasury Economic Intelligence inputs.
5. Add durable provider/API price observations and measured usage reconciliation where providers expose them.
6. Add anomaly detection, forecasting, reservation utilization and unit-economics reporting.
7. Introduce Ascalon economic advice in shadow mode; never grant it Treasury authority.
8. Add migration proof tests that reject any new production caller which invokes a legacy economic authority directly.


## Multidimensional resource accounting

Treasury keeps monetary USD, compute/scarcity capacity, and inference-token capacity as separate ledgers. Inference token reservations do not consume the compute capacity bucket. This prevents model activity from starving GPU/worker reservations and makes each economic permit reflect the actual resource class being authorized.

Production configuration:
- `FACTORYOS_TREASURY_CAPACITY_UNITS`: compute/scarcity capacity.
- `FACTORYOS_TREASURY_TOKEN_CAPACITY_UNITS`: inference-token capacity.

## Authority rule

The migration is intentionally asymmetric:

- selection systems may advise which capable model or compute offer to use;
- Treasury decides whether that selected economic candidate may consume resources;
- the candidate/router cannot register or overwrite paid model prices during an execution attempt;
- legacy CostGovernor, MissionBudgetManager, AgentEconomicsEngine and user quota code may continue to provide compatibility or entitlement information only until their explicit migration waves are completed.

This avoids a false “centralization” where several independent components can still authorize spend.
