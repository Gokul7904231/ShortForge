# Treasurer Wave 3 — Model/API + ComputeOffer Admission

Date: 2026-10-03
Status: IMPLEMENTED ON WAVE BRANCH; VALIDATION PENDING

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

## Next migration after Wave 3

1. Replace legacy user quota spend with Treasury entitlement/allocation accounts.
2. Move MissionBudgetManager checks into Treasury mission envelopes.
3. Replace CostGovernor gate logic with Treasury-backed compatibility facade, then remove it.
4. Convert AgentEconomicsEngine into Treasury Economic Intelligence/advisory scoring.
5. Feed authoritative provider-reported prices and usage into the durable Treasury price/usage history.
6. Add anomaly detection, forecasting and unit economics.
7. Introduce Ascalon economic advice in shadow mode without Treasury authority.
