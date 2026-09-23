# Hierarchy: The Slayer Engine (`SlayerEngine.ts`)

> **Tier**: Sovereign Diagnostic Investigator & Circuit Breaker (Level 1)  
> **Instance Count**: Exactly ONE Factory-Wide Engine  
> **Source Location**: `apps/web/factoryos/core/slayer/SlayerEngine.ts` & `apps/web/factoryos/core/slayer/`

---

## 1. Architectural Philosophy: The Autonomous Circuit Breaker

In distributed manufacturing pipelines, uncontained errors cascade: an out-of-memory error on Floor 06 can cause Floor 05 to retry indefinitely, overloading the database and starving subsequent scheduled jobs.

The **Slayer** is the autonomous diagnostic investigator and supreme circuit breaker of FactoryOS. It maintains a continuous watchdog sweep across all active runs, worker nodes, and event streams. When an unhandled fault, timeout, capability breach, or fatal anomaly occurs, the Slayer acts decisively to halt damage propagation.

```
┌────────────────────────────────────────────────────────┐
│                   Continuous Event Bus                 │
│      (TASK_FAILED, LEASE_EXPIRED, CAPABILITY_BREACH)   │
└───────────────────────────┬────────────────────────────┘
                            │ Dispatches Alarm
                            ▼
┌────────────────────────────────────────────────────────┐
│                     Slayer Engine                      │
│  ├── Circuit Breaker Trip (Isolate Failing Subsystem)  │
│  ├── Process Termination (Kill Rogue / Hung Worker)    │
│  ├── Forensic Capture (Snapshot State & Traces)        │
│  └── Case Ingestion (Open Structured Investigation)    │
└───────────────────────────┬────────────────────────────┘
                            │ Forensic Case Handoff
                            ▼
┌───────────────────┬───────────────────┬────────────────┐
│   Healer Engine   │  Overseer Control │ Human Operator │
│  (Bounded Repair) │  (DAG Reschedule) │ (Fatal Alarm)  │
└───────────────────┴───────────────────┴────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Anomaly Detection** | Watchdog timer and event bus subscriber in `SlayerEngine.ts` | Anomaly detection over streaming metrics (EWMA / Prometheus alerting rules) |
| **Circuit Tripping** | Immediate status flag update halting downstream task dispatches | Distributed eBPF-level network connection severance for compromised nodes |
| **Forensic Case Capture**| Structured `Case` entity persisted in `CaseManager` | Full core dump & memory snapshot upload to secure forensic bucket |
| **Escalation Path** | Automated handoff to `HealerEngine` or operator alert | Automated PagerDuty / Slack escalation with LLM-synthesized incident brief |

---

## 3. Core Operational Responsibilities

1. **Watchdog Sweeps**: Periodically checks worker leases and heartbeat timestamps; kills or evicts workers whose leases have expired without renewal.
2. **Circuit Breaking**: Transitions model provider or worker pool circuits to `OPEN` when consecutive error thresholds are exceeded.
3. **Forensic Case Creation**: Ingests crash events and compiles forensic reports detailing stack traces, affected floor IDs, input parameters, and trace IDs.
4. **Emergency Killswitch**: Provides an instant programmatic killswitch callable by operators to halt all factory operations safely.
