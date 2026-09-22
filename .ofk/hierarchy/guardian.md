# Hierarchy: Floor Guardians (`GuardianManager.ts`)

> **Tier**: Floor Boundary Command Authority (Level 2)  
> **Instance Count**: Dedicated Guardian per Floor Domain  
> **Location**: `apps/web/factoryos/core/guardian/`  

---

## 1. Responsibilities & Policy Gates

Guardians are the authoritative gatekeepers stationed at the entrance and exit of each manufacturing floor:

1. **Pre-Execution Gate**:
   - Validates that inbound payloads satisfy required schemas and types.
   - Evaluates risk level (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
   - Ensures necessary compute and API quotas are reserved before allowing workers to proceed.
2. **Post-Execution Gate**:
   - Evaluates worker outputs against safety, content policy, and quality thresholds.
   - Emits structured `GUARDIAN_REPORT` events to the event bus.
   - Halts progression and triggers Slayer inspection if policy violations or hallucinated data are discovered.
