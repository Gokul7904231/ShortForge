# FACTORYOS AGENT & CAPABILITY MODEL

## 1. Core Rule: Agents are Capabilities, Not Floors

Agents (Slayers, Healers, Instructor) are NOT execution stages. They are on-demand capabilities registered in `CapabilityRegistry` and invoked exclusively by the Overseer when an anomaly or validation event requires intervention.

```text
Floor Execution Anomaly / Event
          │
          ▼
Overseer Control Plane
          │
          ▼
CapabilityRegistry.findCandidates(anomalyType)
          │
          ▼
Kernel Guardian Policy Gate (Risk Assessment & Authorization)
          │
          ▼
Specialized Capability Execution (Slayer / Healer / Instructor)
          │
          ▼
Structured Findings / Repair Output
          │
          ▼
Overseer Resumes or Escalates DAG
```

---

## 2. Trigger Matrix

| Capability Category | Target Anomaly | Risk Level | Idempotency & Locks |
| :--- | :--- | :--- | :--- |
| **Instructor** | Schema violation, malformed LLM JSON, prompt contract mismatch | `LOW` | In-memory schema validator; deterministic repair |
| **Quality Slayer** | Low confidence score, generic topic, weak hook | `MEDIUM` | Read-only analysis; returns structured recommendation |
| **Asset Slayer** | Image prompt mismatch, aspect ratio discrepancy | `MEDIUM` | Structured asset rewrite candidate |
| **Artifact Healer** | Missing scene image, partial upload, unreadable asset | `MEDIUM` | Requires `RepairLockManager` lease; idempotent re-fetch |
| **Render Healer** | Azure network timeout, 5xx render gateway, transient drop | `HIGH` | Bounded retries (max 3); checks executionToken before re-dispatch |
| **Callback Healer** | Cloudinary webhook delayed, missing status callback | `HIGH` | Queries status directly; validates signature |
