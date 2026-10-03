# Treasurer Wave 2 — Compute Admission

Date: 2026-10-03
Status: IMPLEMENTED ON MAIN-BASED WAVE

## Objective

Move Treasurer from a standalone economic kernel into the canonical Floor 06 compute path while preserving the existing separation of powers.

## Runtime flow

Overseer command
  -> RenderIntent bound to overseerCommandId
  -> Treasury RESERVE
  -> ComputeGateway / ComputeRouter
  -> Provider / Worker
  -> Physical artifact
  -> F07ReleaseGuardian signed receipt
  -> verified evidence: Treasury SETTLE
  -> rejection or failed dispatch: Treasury RELEASE

## Safety properties

- A Treasury-gated render cannot start without an explicit Overseer command identity.
- Treasury reservation occurs before physical ComputeRouter dispatch.
- ComputeRouter remains the physical placement authority.
- Guardian remains the capability/policy authority.
- F07 remains the independent verification boundary.
- F06 does not settle production spend by itself.
- Failed or incomplete compute releases the reservation.
- F07 verification rejection releases the reservation.
- Settlement uses the signed receipt identifier produced by F07ReleaseGuardian.
- Actual measured duration becomes scarce-capacity consumption.
- Unknown monetary cost is not invented; non-paid routes may settle at measured zero unless a provider receipt supplies actualCostUsd.
- Paid routes remain blocked by default by Treasury policy.

## Configuration

FACTORYOS_TREASURY_ACCOUNT_ID defaults to factoryos.
FACTORYOS_TREASURY_BUDGET_USD defaults to 25.
FACTORYOS_TREASURY_CAPACITY_UNITS defaults to 3600.
FACTORYOS_MAX_RENDER_RESERVATION_USD defaults to 0.10 per render reservation.

The budget values are economic envelopes, not physical placement instructions.

## Deliberate limitation

Wave 2 does not replace the legacy user quota service, MissionBudgetManager, CostGovernor, or AgentEconomicsEngine. Those remain compatibility paths until their admissions are routed through Treasurer in later waves.

## Rollback

Revert the Wave 2 commit set or disable the Treasurer wiring at the controller boundary. Canonical RenderFabric and ComputeRouter execution remain intact.