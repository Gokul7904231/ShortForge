# Treasurer Operating Contract

**Status:** CANONICAL ECONOMIC CONTROL-PLANE CONTRACT / WAVE 1  
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

The integration target is:

```
ComputeOffer
  -> Treasury economic admissibility
  -> ComputeRouter physical placement
  -> Provider
```

The same boundary applies to model routing.

## Existing-system reconciliation

Current repository mechanisms remain:
- user quota service;
- MissionBudgetManager;
- CostGovernor;
- AgentEconomicsEngine;
- ComputeRouter/provider telemetry.

Wave 1 establishes Treasurer as the future owner without deleting these mechanisms prematurely.

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
