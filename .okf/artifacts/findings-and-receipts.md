# Artifacts: Structured Findings, Evidence & Verification Receipts

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/verification/StructuredFindings.ts` & `apps/web/factoryos/core/contracts/FloorProtocolContracts.ts`

---

## 1. Architectural Philosophy: Unified Finding & Evidence Model

A recurring antipattern in multi-tier verification architectures is the emergence of duplicate, incompatible defect models (e.g., one finding structure used by production QA, another used by unit test suites, and a third used by error recovery). This creates friction, prevents automated repair reuse, and causes subtle validation discrepancies.

FactoryOS implements a unified, clean-room **Finding & Receipt Model** inspired by authoritative evidence graph systems. There is exactly one canonical schema for defects, evidence, and verification receipts across both production Floor 07 and automated test suites:
1. **Finding**: A structured record of an invariant violation, including expected vs observed values, rule identifier, and actionable repair strategies.
2. **Evidence**: An immutable, content-addressed artifact reference or sensor observation backing a finding.
3. **Verification Receipt**: A cryptographically signed assertion issued by Floor 07 certifying that an artifact has been inspected and either passed or failed compliance gates.

```
┌────────────────────────────────────────────────────────┐
│                   Floor 07 Verification                │
└───────────────────────────┬────────────────────────────┘
                            │ Inspects Artifact & Invariants
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Structured Finding                   │
│  ├── id: "find_01..."                                  │
│  ├── severity: CRITICAL | HIGH | MEDIUM | LOW | INFO   │
│  ├── rule: "TIMELINE_VERTICAL_CANVAS_RESOLUTION"       │
│  ├── expected: "1080x1920"                             │
│  ├── observed: "1920x1080"                             │
│  ├── supportedRepairs: ["RESCALE_CANVAS", "ROTATE"]    │
│  └── evidenceReceiptId: "rec_ev_01..."                 │
└───────────────────────────┬────────────────────────────┘
                            │ Dispatched To
                            ▼
┌───────────────────┬───────────────────┬────────────────┐
│      Healer       │     Overseer      │    Auditor     │
│  Bounded Repair   │  State Transition │  Compliance    │
│  (Applies Fix)    │  (Gate Approval)  │  (Attestation) │
└───────────────────┴───────────────────┴────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Defect Model** | Canonical `Finding` interface in `StructuredFindings.ts` | Distributed evidence graph with directed acyclic causal links between defects |
| **Repair Strategies** | Explicit `supportedRepairs` array guiding `BoundedRepairEngine` | Autonomous code-generation of AST repair patches for complex timeline defects |
| **Verification Receipts** | Strongly typed `VerificationReceipt` with SHA-256 artifact digests | Elliptic Curve (ECDSA) cryptographically signed receipts verified by public key |
| **Unified Governance** | Shared finding contracts used across both runtime QA and test suites | Cross-organizational compliance attestation for external content regulators |
| **Finding Deduplication**| In-memory set deduplication by `(floorId, rule, targetArtifactId)` | Graph-based topological clustering of cascading findings to identify root cause |

---

## 3. Core Finding & Receipt Contracts

Defined in `StructuredFindings.ts`:

```typescript
export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type FindingCategory = 
  | 'COMPLIANCE' 
  | 'AUDIO_VISUAL' 
  | 'CONTENT_SAFETY' 
  | 'METRIC_VALIDATION' 
  | 'SYSTEM_INTEGRITY';

export interface Finding {
  readonly id: string;
  readonly severity: FindingSeverity;
  readonly category: FindingCategory;
  readonly rule: string;
  readonly description: string;
  readonly floorId: FloorId;
  readonly targetArtifactId: string;
  readonly expected: string;
  readonly observed: string;
  readonly evidenceReceiptId?: string;
  readonly supportedRepairs: readonly string[];
}

export interface VerificationReceipt {
  readonly receiptId: string;
  readonly targetArtifactId: string;
  readonly targetArtifactSha256: string;
  readonly verifiedAt: number;
  readonly verifierAgentId: string;
  readonly status: 'PASSED' | 'FAILED' | 'REPAIR_REQUIRED';
  readonly findings: readonly Finding[];
  readonly signature?: string;
}
```

---

## 4. Operational Invariants

1. **Zero Unverifiable Findings**: A finding cannot be emitted without explicit `expected` and `observed` values and an identifying `rule`. Vague "looks bad" errors are strictly prohibited.
2. **Actionable Repairs**: If a finding indicates a recoverable error, it must list at least one valid strategy in `supportedRepairs` that the `BoundedRepairEngine` can interpret.
3. **Approval Gating**: A mission cannot reach `COMPLETED` status if any active finding has a severity of `CRITICAL` or `HIGH`.
