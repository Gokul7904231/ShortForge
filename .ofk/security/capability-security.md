# Security: Capability Security & Tool Permissions

> **Status**: OPERATIONAL  
> **Source Module**: `apps/web/factoryos/core/cognitive/CapabilityRegistry.ts`  

---

## 1. Principle of Least Privilege
- Every agent and worker in FactoryOS receives a discrete capability token defining which tools and system calls it may invoke.
- Floor workers cannot call administrative APIs or mutate the decision ledger.
- Slayers have broad read permissions across the event bus and state engine, but mutation is restricted to opening forensic Cases.
- Healers possess remediation capabilities strictly bound to the target entities listed in an active Case.
