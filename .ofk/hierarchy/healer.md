# Hierarchy: The Healer Engine (`HealerEngine.ts`)

> **Tier**: Autonomous Remediation Engine (Level 1)  
> **Instance Count**: Exactly ONE Factory-Wide Engine  
> **Location**: `apps/web/factoryos/core/healer/HealerEngine.ts`  

---

## 1. Responsibilities

The Healer acts upon Cases opened by the Slayer, applying deterministic remediation strategies to restore factory health:

1. **Lease Eviction & Recovery**: Releases orphaned task leases held by crashed worker processes.
2. **Worker Restart & Rebalancing**: Gracefully terminates unresponsive worker instances and spins up healthy replacements.
3. **Queue Replay**: Requeues failed tasks that suffered transient infrastructure failures (e.g. temporary TTS rate limits or network drops).
4. **Case Resolution Certification**: Documents corrective actions taken and marks the Case as `RESOLVED` in the `CaseManager`.
