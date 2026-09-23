# Hierarchy: The Healer Engine (`HealerEngine.ts`)

> **Tier**: Sovereign Remediation Authority & Bounded Repair Engine (Level 1)  
> **Instance Count**: Exactly ONE Factory-Wide Engine  
> **Source Location**: `apps/web/factoryos/core/healers/BoundedRepairEngine.ts` & `apps/web/factoryos/core/healer/`

---

## 1. Architectural Philosophy: Targeted Bounded Remediation

While the Slayer is the diagnostic investigator and circuit breaker that halts systemic damage, the **Healer** is the active repair authority that restores the factory to a healthy, operational state.

The Healer operates under two distinct modalities:
1. **Infrastructure Remediation**: Reclaims expired worker leases, terminates stalled subprocesses, resets tripped model circuits after cooldown, and re-queues transiently dropped tasks.
2. **Artifact & Quality Bounded Repair (`BoundedRepairEngine`)**: When Floor 07 verification issues non-zero defect findings, the Healer executes a targeted repair loop bounded by a strict iteration budget (default: 3 attempts) while preserving the Last-Known-Good (LKG) baseline.

```
┌────────────────────────────────────────────────────────┐
│                   Healer Engine Intake                 │
├───────────────────────────┬────────────────────────────┤
│  Forensic Cases (Slayer)  │ Verification Findings(F07) │
│  (Infrastructure Faults)  │ (Quality / Schema Defect)  │
└─────────────┬─────────────┴─────────────┬──────────────┘
              │                           │
              ▼ Infrastructure Repair     ▼ Bounded Artifact Repair
┌───────────────────────────┐   ┌────────────────────────┐
│ - Reclaim Expired Leases  │   │ - Snapshot LKG State   │
│ - Recycle Dead Workers    │   │ - Decrement Budget     │
│ - Reset Cool-off Circuits │   │ - Apply Finding Fix    │
│ - Re-queue Dropped Tasks  │   │ - Re-Submit to F07 QA  │
└───────────────────────────┘   └────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Bounded Repair** | `BoundedRepairEngine.ts` with iteration budget & LKG rollback | Reinforcement-learned repair policy selecting multi-stage mutation graphs |
| **Lease Reclaim** | Deterministic sweep releasing stale worker IDs | Distributed lock lease renewal with Raft-backed fencing tokens |
| **LKG Rollback** | In-memory checkpoint restoration of prior floor outputs | Distributed copy-on-write filesystem rollback restoring exact disk states |
| **Resolution Audit** | Case resolution certified in `CaseManager` with audit log | Automated regression unit test generation for every repaired bug |

---

## 3. The Bounded Repair Invariant

To guarantee that self-healing cannot destabilize the system or exhaust compute budgets:
- **Budget Expiration**: If `attemptCount >= maxRepairAttempts`, the Healer halts repairs immediately, reverts the artifact to the LKG baseline, sets the mission status to `FAILED`, and notifies operators.
- **Progress Monotonicity**: A repair iteration must reduce the count or severity of active findings. If a repair increases total defect severity, it is rejected and an alternative repair strategy is attempted.
