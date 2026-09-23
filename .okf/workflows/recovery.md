# Workflows: Anomaly Recovery, Self-Healing & Bounded Repair

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/healers/BoundedRepairEngine.ts` & `apps/web/factoryos/core/slayer/`

---

## 1. Architectural Philosophy: Bounded Self-Healing & Baseline Preservation

In complex multi-agent pipelines, self-healing mechanisms that lack strict constraints often degenerate into infinite oscillation: Agent A edits a script to satisfy Rule 1, breaking Rule 2; Agent B then edits the script to satisfy Rule 2, breaking Rule 1. This drains tokens, destabilizes runtime state, and yields corrupted outputs.

FactoryOS implements a formal **Bounded Self-Healing Architecture**:
1. **Last-Known-Good (LKG) Baseline Preservation**: Prior to attempting any repair, the system takes an immutable snapshot of the baseline state. If repairs fail or degrade the artifact further, the system can cleanly revert to the LKG baseline.
2. **Strict Repair Budgeting**: The `BoundedRepairEngine` enforces a hard limit on repair iterations (default: 3 attempts). If the artifact is not brought into compliance within this budget, the mission transitions to `FAILED` and escalates to human operators.
3. **Structured Finding Targeted Repair**: Repairs are not blind prompt retries. Each repair step targets specific `supportedRepairs` identified in structured Floor 07 `Finding` records.
4. **Slayer Isolation**: If a failure is determined to be non-recoverable (e.g., security violation, credential leak, or systemic crash), the Slayer trips the circuit and kills the affected worker immediately.

```
┌────────────────────────────────────────────────────────┐
│                   Floor 07 Verification                │
│             Emits Structured Finding Records           │
└───────────────────────────┬────────────────────────────┘
                            │ Non-Zero Defect Findings
                            ▼
┌────────────────────────────────────────────────────────┐
│                  BoundedRepairEngine                   │
│  ├── Snapshot Last-Known-Good (LKG) Baseline           │
│  ├── Check Budget (Remaining Attempts > 0)             │
│  ├── Select Repair Strategy from Finding               │
│  └── Dispatch Targeted Mutation to Originating Floor   │
└───────────────────────────┬────────────────────────────┘
                            │ Re-Execute Floor & Verify
                            ▼
┌────────────────────────────────────────────────────────┐
│               Evaluation of Repaired State             │
│  ├── Pass (0 Findings) ──────> Promote & Complete      │
│  ├── Progress (Findings Reduced) ─> Loop (Budget - 1)  │
│  └── Budget Exhausted ────────> Revert to LKG / Fail   │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Repair Engine** | Strongly typed `BoundedRepairEngine.ts` with budget and baseline preservation | Reinforcement-learned repair planner selecting optimal edits based on historical telemetry |
| **Budget Enforcement** | Hard counter on repair attempts per mission (default: 3) | Dynamic multi-variable budget tracking tokens, latency, and financial cost |
| **Forensic Triage** | Structured case records created in `CaseManager` | Automated root-cause clustering and auto-generating regression test cases |
| **Killswitch Isolation** | Slayer process kill and circuit breaker tripping | Automated live hot-patch deployment for identified heuristic flaws |
| **ReMaker Partial Re-Render**| Targeted re-rendering of affected video tracks or audio segments | Frame-level diff re-encoding reusing unchanged intermediate video blocks |

---

## 3. Repair Execution Lifecycle

1. **Finding Ingestion**: Floor 07 produces a `VerificationReport` containing one or more `Finding` objects.
2. **Budget Verification**: `BoundedRepairEngine.canAttemptRepair()` checks if `attemptCount < maxRepairAttempts`.
3. **Targeted Remediation**:
   - If audio/visual misalignment: Floor 05 Timeline recalculates clip offsets.
   - If script contradiction: Floor 02 Scripting revises the specific conflicting beat sheet item.
   - If render corruption: Floor 06 re-dispatches to an alternate healthy compute worker.
4. **Post-Repair Re-Verification**: The modified artifact is resubmitted to Floor 07.
5. **Termination Conditions**:
   - **Success**: All findings resolved -> Artifact certified.
   - **Exhaustion**: Budget reached without resolution -> Mission failed, alerts dispatched.
