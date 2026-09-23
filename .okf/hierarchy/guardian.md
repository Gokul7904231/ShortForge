# Hierarchy: Floor Guardians (`GuardianManager.ts`)

> **Tier**: Sovereign Policy & Boundary Authority (Level 2)  
> **Instance Count**: Dedicated Guardian per Floor Domain  
> **Source Location**: `apps/web/factoryos/core/guardian/` & `apps/web/factoryos/core/guardian/GuardianManager.ts`

---

## 1. Architectural Philosophy: The Sovereign Boundary Regulator

A critical architectural distinction in FactoryOS is: **The Guardian is NOT Floor 07.**

- **Floor 07** is a production worker floor: it inspects finished media artifacts, checks audio-visual alignment, evaluates transcript reading levels, and issues structured defect findings.
- **The Guardian** is a Level 2 sovereign authority: it regulates access, verifies capability grants, validates inbound and outbound schemas, and blocks untrusted or malicious operations across all floors ($00$ through $07$).

Stationed at the entrance and exit of every manufacturing floor, Guardians prevent invalid state from penetrating deeper into the manufacturing pipeline.

```
                  ┌───────────────────────────────┐
                  │    Incoming Task from DAG     │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PRE-EXECUTION GUARDIAN                     │
│  ├── Schema Conformance Check                                   │
│  ├── Capability Validation (`session.grantedCapabilities`)      │
│  ├── Quota & Token Budget Check                                 │
│  └── Risk Assessment (LOW | MEDIUM | HIGH | CRITICAL)           │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ Passed Gate
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Floor Specialist Worker                     │
│             (Executes Task within Authorized Bounds)            │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ Completed Output
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     POST-EXECUTION GUARDIAN                     │
│  ├── Output Schema Validation                                   │
│  ├── Content Safety & Policy Gate                               │
│  ├── Artifact Digest & Provenance Integrity                     │
│  └── Emit Structured GUARDIAN_REPORT                            │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ Next Floor or Convergence DAG │
                  └───────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Gate Enforcement** | In-memory synchronous schema & capability validation in `GuardianManager.ts` | Hardware-enforced secure enclaves (SGX/Nitro) running isolated policy engines |
| **Capability Grants** | Dynamic lookup against registered agent session grants | Cryptographically signed, short-lived macaroon tokens with caveat attenuation |
| **Content Safety** | Rule-based regex & classification filters for sensitive themes | Multi-modal adversarial safety neural classifier analyzing audio and frames |
| **Incident Escalation** | Direct event emission to `DurableEventBus` for Slayer triage | Automated quarantine of compromised worker nodes and security credential rotation |

---

## 3. Operational Guarantees

1. **Fail-Closed Semantics**: If a Guardian encounters an unrecognized schema, missing capability grant, or unhandled exception, it rejects the execution. It never fails open.
2. **Capability Containment**: A worker on Floor 02 (Scripting) requesting network write capabilities will be blocked by the Floor 02 Guardian with a `SECURITY_VIOLATION` event.
3. **Audit Log Integration**: Every passed and rejected gate decision is recorded with cryptographic timestamps for post-incident analysis.
