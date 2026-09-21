# SHORTFORGE / FACTORYOS — TARGET ARCHITECTURE SPECIFICATION

## 1. Target Unified Flow

```text
POST /api/generate-video
    │
    ▼
Auth & Quota Gate (Server-Authoritative Reservation)
    │
    ▼
Mission Creation (MissionManager)
    │
    ▼
Overseer Control Plane
    │
    ▼
MissionStateMachine (Status: RUNNING)
    │
    ▼
Kernel Guardian Policy Gate (Pre-Execution Safety Verification)
    │
    ▼
Authoritative 6-Floor DAG Execution:
    ├── Floor 01: Strategy & Topic Planning
    ├── Floor 02: Script & Narrative Synthesis
    ├── Floor 03: Asset Realization & Blueprint
    ├── Floor 04: Media Synthesis (Voice & Audio Timing)
    ├── Floor 05: Timeline Composition (Render Manifest)
    └── Floor 06: Render Orchestration (Guardian Render Gate)
              │
              ▼
    Azure Rendering Plane (BASIC_RENDER_API_URL)
              │
              ▼
    Cloudinary Storage & Asset Callback
              │
              ▼
    MissionStateMachine (Status: COMPLETED)
              │
              ▼
    DurableEventBus (Event: MissionCompleted)
              │
              ▼
    FactoryProjectionService -> API / SSE Stream -> UI
```

---

## 2. Invariant Rules for Production Safety

1. **Exactly One Orchestrator per Job**: A job is orchestrated either by the unified FactoryOS Mission DAG or legacy path during transition—never both simultaneously.
2. **Fail-Closed Azure Worker Requirement**: Production renders MUST execute on Azure. If Azure worker is unavailable, job status is immediately set to `FAILED`. In-process/local FFmpeg rendering is strictly prohibited on production tiers.
3. **Signed Protocol Bridge**: All floor interactions require a verified tuple: `(userId, jobId, missionId, floorId, executionId, attempt, executionToken)` and HMAC-signed timestamp/nonce payloads.
