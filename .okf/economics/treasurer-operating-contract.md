# Treasurer Operating Contract

**Status:** CANONICAL ECONOMIC CONTROL-PLANE CONTRACT / WAVES 1–3  
**Date:** 2026-10-03

## Purpose

Unify ShortForge's fragmented resource controls behind a single economic admission boundary without creating a second scheduler.

## Core API

```
QUOTE
RESERVE
SETTLE
RELEASE
EXPIRE
FREEZE
UNFREEZE
REPORT
```

The public API stays small. Complex accounting, projections, anomaly analysis and price observations remain internal to Treasurer.

## Typed command provenance

Every discretionary Treasury command carries:
- `commandId`;
- `overseerCommandId`;
- typed issuer authority = `OVERSEER`;
- mission/run/floor/task/attempt scope;
- budget envelope;
- expiration;
- idempotency key;
- scope digest.

This binds an expenditure to the command that caused it.

## Durable state

Production persistence is MongoDB-backed with transactional atomicity:
- `treasury_accounts`;
- `treasury_reservations`;
- `treasury_ledger_events`.

The Mongo implementation fails closed if an atomic Mongo client session is unavailable.

## Reservation semantics

Reservation subtracts from available capacity and moves it to reserved state.

Settlement:
- consumes the measured amount;
- releases unused reservation;
- records execution evidence;
- requires verification receipt when the reservation is marked `verificationRequired`.

Release/expiry:
- returns the full reservation;
- never increments settled spend.

## Resource model

Treasurer supports:
- USD;
- capacity units;
- token/duration limits;
- provider/model metadata;
- verification-required production resources.

This provides a common economic envelope for LLM, API, compute, notebook, sandbox and rendering work.

## Physical placement boundary

Treasurer does not select or mutate the actual provider worker.

The canonical boundaries are:

```
ComputeOffer
  -> economic selection/advice
  -> Treasury economic admissibility
  -> ComputeRouter physical placement
  -> Provider
  -> measured usage
  -> Treasury settlement
```

For model/API inference:

```
Overseer command
  -> Decision Fabric
  -> Model/Capability Router selection
  -> Treasury economic admissibility
  -> Provider execution
  -> measured token usage
  -> Treasury settlement
```

For user generation entitlement:

```
Overseer command
  -> TreasuryQuotaAdmission
  -> quota entitlement reservation
  -> FactoryOS mission
  -> F07 verification
  -> Treasury quota settlement/release
  -> Firestore compatibility projection
```

Wave 3 makes these three flows share one economic authority without making Treasurer a scheduler or physical placement engine.

## Existing-system reconciliation

The following legacy mechanisms are retained only as compatibility/advisory layers:

- user quota Firestore documents: projection/UI/history;
- MissionBudgetManager: post-consumption mission policy/projection;
- CostGovernor: non-authorizing production compatibility facade;
- AgentEconomicsEngine: advisory tier/cost heuristics; authoritative cost comes from measured Treasury settlement;
- ComputeRouter/provider telemetry: physical placement and measurements, not economic authorization.

They may inform execution, but they must not become a second production spend authority.

## Operating modes

- OPEN: normal bounded spend.
- DEFENSIVE: restrict large/high-priority discretionary spend.
- FROZEN: deny new discretionary reservations while still allowing settlement, release, expiry and reconciliation.

## Ascalon boundary

Ascalon may eventually act as Economic Intelligence:
- forecast;
- anomaly classification;
- cost/quality recommendation;
- route advice.

Ascalon never receives Treasury vault authority and never bypasses the Constitutional Kernel.
