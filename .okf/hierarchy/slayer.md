# Hierarchy: The Slayer Engine (`SlayerEngine.ts`)

> **Tier**: Autonomous Diagnostic Investigator (Level 1)  
> **Instance Count**: Exactly ONE Factory-Wide Engine  
> **Location**: `apps/web/factoryos/core/slayer/SlayerEngine.ts`  

---

## 1. Overview & Operational Mandate

The Slayer is the factory-wide investigative authority. It continuously monitors the event bus, task latency, and world state for faults, anomalies, or SLA breaches.

### Key Capabilities:
- **Continuous Patrol Sweep**: Periodically scans active runs and workers for stalled executions, excessive retry counts, or memory bloat.
- **Incident Investigation**: Dispatches investigative probes when an error event (`TASK_FAILED`, `FLOOR_ERROR`) is detected.
- **Case Generation**: Creates formal forensic `Case` entities via `CaseManager` documenting root-cause hypotheses, priority level, and target entities.
- **Auto-Escalation**: Forwards confirmed cases to the `HealerEngine` for automated resolution or flags them for human review if safety thresholds are crossed.
