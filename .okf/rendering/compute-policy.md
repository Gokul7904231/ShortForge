# Rendering: Compute Policy & Quota Governance

> **Status**: OPERATIONAL  
> **Location**: `apps/web/lib/quota/quota-service.ts`  

---

## 1. Principles & Rules
- **Slot Reservation**: Before any video generation or Azure dispatch begins, the user's tier quota slot is atomically reserved via `reserveGenerationSlot(userId, userRole, jobId)`.
- **Fail-Closed Release**: If validation fails or dispatch aborts, `releaseGenerationSlot` is guaranteed to run in `catch` and `finally` blocks.
- **Finalization**: When Floor 07 verification passes and the video artifact is persisted, `finalizeGenerationSlot` permanently marks the slot as consumed.
- **Worker Concurrency Limit**: Limits simultaneous GPU renders per tier to prevent VM throttling and latency spikes.
