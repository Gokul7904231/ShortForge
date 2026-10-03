# Treasurer Wave 1 — Implementation Record

**Date:** 2026-10-03  
**Branch:** `feat/treasurer-control-plane-wave1-20261003`

## Implemented

### 1. First-class Treasurer contracts

Added typed contracts for commands, quotes, reservations, consumption, accounts, permits, policy and immutable ledger events.

### 2. Constitutional Kernel

Added deterministic economic admission:
- Overseer-only discretionary commands;
- budget/capacity ceilings;
- reservation before execution;
- idempotent command reuse;
- fail-closed mode handling;
- actual-cost settlement;
- unused reservation release;
- production-artifact verification requirement;
- envelope-overrun freeze.

### 3. Durable ledger seam

Added:
- MongoDB transactional Treasury store;
- deterministic in-memory store for tests;
- Treasury account/reservation/event collections and indexes.

### 4. Price registry

Added a versioned, time-bounded price registry that reports missing/low-confidence prices instead of silently inventing economics.

### 5. Documentation

Added the Treasurer hierarchy contract and operating contract, plus this implementation record. The master hierarchy and terminology are updated to recognize Treasurer as a cross-cutting economic authority.

## Deliberate non-goals for Wave 1

We did not delete or rewrite:
- quota-service;
- MissionBudgetManager;
- CostGovernor;
- AgentEconomicsEngine;
- ComputeRouter;
- generation routes.

That avoids a high-risk all-at-once migration. They remain compatibility mechanisms until the next migration wave wires their resource admissions through Treasury permits.

## Acceptance gates

Wave 1 is complete when:
- unit tests pass;
- Mongo transactions are available in production deployment;
- no worker receives Treasury ownership, only a bounded permit;
- F07 remains the verification authority;
- ComputeRouter remains the physical placement authority;
- no LLM controls Treasury invariants.

## Next migration waves

1. Treasury adapter for MissionBudgetManager + user quota.
2. Model-routing economic admission through Treasury.
3. ComputeOffer economic admission before ComputeRouter placement.
4. Actual provider/notebook/sandbox cost reconciliation.
5. Anomaly detection, forecasting and unit economics.
6. Ascalon economic intelligence in shadow mode, then bounded canary.
