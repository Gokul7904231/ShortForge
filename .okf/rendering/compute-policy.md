# Rendering: Compute Policy, Quota Governance & Resource Limits

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/lib/quota/quota-service.ts` & `apps/web/factoryos/core/schedule/`

---

## 1. Architectural Philosophy: Strict Resource Containment

Media rendering and AI model inference are resource-intensive operations capable of consuming massive compute budgets if unmetered. A runaway loop or malicious burst request can exhaust GPU instances, trigger severe cloud billing spikes, and starve other concurrent missions.

FactoryOS implements a **Deterministic Quota & Compute Governance Policy**:
1. **Atomic Pre-Flight Slot Reservation**: Before a mission initiates or dispatches compute tasks, the user or channel's generation quota slot is reserved atomically via `reserveGenerationSlot()`.
2. **Fail-Closed Release Guarantee**: If validation fails, an exception occurs, or Slayer halts the run, `releaseGenerationSlot()` is guaranteed to execute in `catch` and `finally` blocks, preventing leaked quota.
3. **Finalization on Floor 07 Certification**: The reserved slot is only permanently marked as consumed (`finalizeGenerationSlot()`) once Floor 07 issues a passing verification receipt.
4. **Worker Pool Concurrency Limits**: Hard limits on concurrent active renders per tier prevent hardware saturation.

```
┌────────────────────────────────────────────────────────┐
│                   Incoming Generation                  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               Atomic Slot Reservation                  │
│       `reserveGenerationSlot(userId, tier, jobId)`     │
└─────────────┬───────────────────────────┬──────────────┘
              │ Success                   │ Quota Exceeded
              ▼                           ▼
┌───────────────────────────┐   ┌────────────────────────┐
│   Execute Pipeline DAG    │   │  Reject Request (429)  │
└─────────────┬─────────────┘   └────────────────────────┘
              │
              ├── Failure / Abort ──► `releaseGenerationSlot()` (Refund)
              │
              └── Floor 07 Pass   ──► `finalizeGenerationSlot()` (Settle)
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Quota Settlement** | Atomic slot reservation and release in `quota-service.ts` | Distributed token bucket rate limiter with Redis/Upstash backend |
| **Budget Enforcement** | Floor-level and job-level duration limits | Real-time dollar-cost tracking halting runs if spend exceeds threshold |
| **Concurrency Throttling**| Tier-based maximum concurrent renders per user | Dynamic backpressure throttling based on live GPU thermal/utilization stats |

---

## 3. Governance Invariants

- **Zero Quota Leakage**: Under no circumstance may a failed render job consume user credit without delivering a verified, downloadable artifact.
- **Fail-Closed Reservation**: If the quota service is temporarily unavailable or unreachable, new generation missions are rejected with an explicit service unavailable error.
