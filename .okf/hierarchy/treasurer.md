# Treasurer — Economic Control-Plane Contract

**Status:** AUTHORITATIVE + IMPLEMENTATION WAVES 1–3  
**Date:** 2026-10-03  
**Canonical implementation:** `apps/web/factoryos/core/treasury/`

## Identity

Treasurer is ShortForge's **sole economic custodian**.

> Overseer decides what ShortForge should do. Treasurer decides what resources ShortForge may spend to do it.

Treasurer is not a billing UI, a second scheduler, a capability authority, or a worker.

## Authority

Human Authority remains supreme.

For discretionary Treasury decisions:

```
Human
  |
  v
Overseer
  |
  v
Treasurer
```

Treasurer accepts discretionary commands only when the typed issuer is `OVERSEER`.

Treasurer may autonomously perform only constitutional safety actions derived from immutable rules:
- expire stale reservations;
- release unused holds;
- reconcile measured consumption;
- deny invalid/replayed/expired commands;
- stop new discretionary reservations after a breach;
- freeze its account on an envelope overrun;
- reject a command whose issuer identity does not exactly match its originating Overseer command.

Those are not new sovereign commands. They are mandatory safety behavior.

## Separation of powers

| Authority | Owns |
|---|---|
| Overseer | mission objective, decomposition, priority, discretionary economic command |
| Treasurer | economic admission, reservation, settlement, release, freeze, economic telemetry |
| Guardian | capability/policy authorization |
| ComputeRouter | physical provider/worker placement |
| Worker | execution |
| Slayer | lease revocation / kill enforcement |
| Healer | bounded recovery |
| F07 | independent verification |
| Ascalon | bounded cognitive/advisory recommendations |

Treasurer must never become the physical placement authority.

## Economic lifecycle

```
COMMAND
  -> QUOTE
  -> RESERVE
  -> EXECUTE
  -> MEASURE
  -> F07 / EVIDENCE
  -> SETTLE or RELEASE
```

A reservation is a hold, not spend.

Actual settlement is the measured amount. The unspent difference is released.

A retry is a new economic attempt and requires a new reservation.

## Economic currencies

Treasurer tracks separate resource dimensions:

1. monetary spend (USD);
2. compute/scarcity capacity (compute seconds, concurrency, queue/provider scarcity);
3. inference-token capacity;
4. quota/entitlement capacity where applicable.

Therefore:

> **$0 is not equivalent to unlimited.**

A free notebook GPU can still exhaust finite runtime, queue slots, provider quota, or scarce capacity.

## Constitutional invariants

1. No discretionary spend without a valid Overseer command.
2. Workers request resources; workers never own Treasury resources.
3. Treasurer is the sole economic custodian.
4. Guardian authorization cannot be replaced by Treasury authorization.
5. Treasury authorization cannot replace Guardian authorization.
6. Reservation is not spend.
7. Released reservation is never charged.
8. Settled spend must map to authenticated execution evidence.
9. Production-artifact settlement additionally requires verification evidence.
10. Retry consumes additional economic budget.
11. Free monetary price does not imply unlimited resource availability.
12. Replayed or stale commands cannot spend twice.
13. Treasurer cannot authorize itself.
14. Treasurer cannot replace ComputeRouter.
15. Treasurer cannot certify F07.
16. Treasury rules are immutable to Treasurer runtime cognition.

## Failure behavior

Treasurer is fail-closed for new discretionary spend.

Unknown price, expired command, missing issuer, insufficient balance/capacity, frozen Treasury, invalid idempotency state, or envelope overrun must not become an automatic “best guess” expenditure.

## Two-layer implementation

### Constitutional Kernel

Deterministic TypeScript. Owns:
- command validation;
- hard ceilings;
- reservation;
- idempotency;
- settlement/release;
- freeze;
- durable ledger transaction boundaries.

### Economic Intelligence

Future advisory layer. May use observed cost, latency, quality and verified outcomes to recommend:
- model/provider changes;
- cache reuse;
- deterministic bypass;
- retry avoidance;
- resource right-sizing.

Economic Intelligence can recommend. The Constitutional Kernel decides.

## Wave 3 runtime integration

The economic boundary now covers:
- model/API inference through AIRuntime + IntelligentRouter;
- API-backed ComputeOffer provisioning through ProviderApiRegistry;
- user generation entitlement/quota through TreasuryQuotaAdmission;
- F06 compute admission and F07 verification-aware settlement.

Legacy quota Firestore documents remain a compatibility projection for UI/history. MissionBudgetManager remains post-consumption mission policy; CostGovernor is non-authorizing in production; AgentEconomicsEngine is advisory and records authoritative cost only when measured Treasury cost is supplied.

The architectural rule is now:

`selection -> Treasury admission -> execution -> measurement -> verification -> Treasury settlement`

No legacy economic mechanism may authorize production spend outside Treasury.
