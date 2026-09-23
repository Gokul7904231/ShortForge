# Hierarchy: Floor Auditors & Verification Authorities

> **Tier**: Sovereign Verification & Attestation Authority (Level 2)  
> **Instance Count**: Distributed per Verification Domain  
> **Source Location**: `apps/web/factoryos/core/contracts/` & `apps/web/factoryos/core/verification/`

---

## 1. Architectural Philosophy: Independent, Non-Destructive Attestation

To maintain total system trustworthiness, auditing authorities in FactoryOS are strictly decoupled from creative and synthesis workers. A worker that creates an asset cannot audit its own work.

The **Auditor** hierarchy performs independent, read-only, non-destructive verification passes on all intermediate and final outputs:
1. **Container & Media Auditor**: Validates physical MP4 container flags, 9:16 aspect ratio ($1080 \times 1920$), constant framerate (30fps), audio loudness (-14 LUFS), and audio-visual track alignment.
2. **Factual & Provenance Auditor**: Audits generated scripts against `KnowledgeOS` verified claims and `ResearchPassport` evidence receipts, catching hallucinations before synthesis.
3. **Economic & Quota Auditor**: Audits token consumption, cloud API spend, and worker compute durations against budget allowances.

```
┌────────────────────────────────────────────────────────┐
│                   Artifact Under Review                │
│             (Script, Beat Sheet, Timeline, MP4)        │
└───────────────────────────┬────────────────────────────┘
                            │ Non-Destructive Audit Pass
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Auditor Authority                   │
│  ├── Media Auditor: Aspect Ratio, Codec, LUFS, Sync    │
│  ├── Factual Auditor: ResearchPassport Citation Check  │
│  └── Economic Auditor: Quota & Token Spend Verification│
└───────────────────────────┬────────────────────────────┘
                            │ Issues Cryptographic Receipt
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Verification Attestation               │
│         (VerificationReceipt + Signed Finding Log)     │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Media Auditing** | Deterministic FFprobe / metadata rule checks | Neural multi-modal sensory auditor grading visual aesthetic appeal & motion blur |
| **Factual Auditing** | Citation linkage checks against `ResearchPassport` records | Cross-lingual fact checking with automated citation triangulation |
| **Economic Auditing** | Token counter and API cost checks per mission | Real-time predictive cost modeling warning of budget overrun before execution |
| **Attestation Format** | Structured `VerificationReceipt` in `StructuredFindings.ts` | Tamper-proof W3C Verifiable Credentials signed with asymmetric keys |

---

## 3. Auditor Invariants

- **Read-Only Operation**: Auditors never mutate artifacts, scripts, or timelines. They only emit findings and receipts.
- **Strict Separation of Duties**: An agent session that executed a task on Floor $N$ cannot serve as the auditor for Floor $N$.
