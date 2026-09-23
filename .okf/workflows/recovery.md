# Workflows: Anomaly Recovery & Self-Healing Workflow

> **Status**: OPERATIONAL  

---

## 1. Failure Detection & Remediation Flow

1. **Failure Event**: A task fails during Floor execution (e.g. worker process crash or network timeout).
2. **Event Dispatch**: `TASK_FAILED` event is published to `DurableEventBus`.
3. **Slayer Triage**: The Slayer picks up the failure event, inspects the stack trace and worker telemetry, and logs a forensic `Case`.
4. **Healer Intervention**: If the error is transient, Healer releases the task lease, rebalances the worker pool, and increments the retry count.
5. **ReMaker Repair**: If output artifact fails Floor 07 verification, ReMaker re-renders only the defective stage using preserved timeline blueprints.
6. **Resolution Certification**: Case status is updated to `RESOLVED` in `CaseManager`.
