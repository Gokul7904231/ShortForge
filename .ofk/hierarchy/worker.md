# Hierarchy: Floor Workers & Swarms

> **Tier**: Stage Execution Units (Level 3)  
> **Location**: `apps/web/factoryos/core/workers/`  

---

## 1. Responsibilities & Operational Bounding

Workers are strictly bounded execution units dedicated to specific transformation tasks:
1. **Isolated Execution Context**: Workers never mutate global world state directly; they return structured task outputs to their floor Guardian.
2. **Leased Operation**: Workers must acquire an active lease (`LeaseManager`) before processing task payloads.
3. **Heartbeat Requirement**: Workers publish periodic heartbeats (`worker.heartbeat`) to the world state. If a worker goes silent for > 30 seconds, its lease is revoked.
