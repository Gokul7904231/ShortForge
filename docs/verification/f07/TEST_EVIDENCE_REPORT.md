# ShortForge / FactoryOS — Test Evidence Report

## 1. Canonical Testing Commands

As mandated by Invariant #27, all verification tests run via the repository's canonical package manager and test runner within `apps/web`:

```bash
# Run all YouTube policy, gate, receipt, variation, and remediation test suites
npm test -- factoryos/tests/youtube-

# Run all 28 Architectural Invariant tests
npm test -- factoryos/tests/f07-architectural-invariants.test.ts
```

---

## 2. Test Execution Results (56 / 56 Passing — 100%)

### Suite A: F07 Core Verification Test Suites (28 / 28 Passing)
Executed via `npm test -- factoryos/tests/youtube-`:

| Test Suite File | Tests | Pass | Fail | Execution Time |
| :--- | :--- | :--- | :--- | :--- |
| `factoryos/tests/youtube-policy-refresh.test.ts` | 4 | 4 | 0 | 16ms |
| `factoryos/tests/youtube-channel-audit.test.ts` | 5 | 5 | 0 | 17ms |
| `factoryos/tests/youtube-policy-engine.test.ts` | 5 | 5 | 0 | 18ms |
| `factoryos/tests/youtube-content-variation.test.ts` | 6 | 6 | 0 | 28ms |
| `factoryos/tests/youtube-remediation.test.ts` | 4 | 4 | 0 | 29ms |
| `factoryos/tests/youtube-evidence-receipt.test.ts` | 4 | 4 | 0 | 30ms |
| **Subtotal** | **28** | **28** | **0** | **~785ms** |

### Suite B: F07 28 Architectural Invariants Suite (28 / 28 Passing)
Executed via `npm test -- factoryos/tests/f07-architectural-invariants.test.ts`:

| Invariant # | Description | Status | Evidence |
| :--- | :--- | :--- | :--- |
| **Inv #1** | `CLAIM <= EVIDENCE` (Zero over-claiming) | `UNIT-VERIFIED` | Pass (14ms) |
| **Inv #2** | `NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION` | `INTEGRATION-VERIFIED` | Pass (2ms) |
| **Inv #3** | Deterministic facts verified via deterministic probes | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #4** | Unknown / Stale / Missing evidence fails closed | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #5** | Separation of upload safety, monetization readiness, advertiser suitability | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #6** | Non-YPP channel never blocks ordinary safe upload | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #7** | Never claim YouTube will monetize (internal readiness only) | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #8** | Policy as data (versioned JSON IR) | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #9** | Reproducible tamper-evident policy snapshot hash | `UNIT-VERIFIED` | Pass (0ms) |
| **Inv #10** | Canonical official document digests (SHA-256) | `UNIT-VERIFIED` | Pass (2ms) |
| **Inv #11** | Multi-clock temporal policy awareness | `UNIT-VERIFIED` | Pass (0ms) |
| **Inv #12** | G12 Shorts eligibility (0 < d <= 180s, Sept 24 Content ID) | `UNIT-VERIFIED` | Pass (2ms) |
| **Inv #13** | Structured EvidenceRef with typed metadata | `UNIT-VERIFIED` | Pass (0ms) |
| **Inv #14** | Tamper-evident Ed25519 signed VerificationReceipt | `UNIT-VERIFIED` | Pass (2ms) |
| **Inv #15** | CAS integrity & TOCTOU proof | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #16** | Unforgeable Ed25519 signed ReleaseAuthorization capability | `INTEGRATION-VERIFIED` | Pass (3ms) |
| **Inv #17** | Complete canonical payload hash binding | `INTEGRATION-VERIFIED` | Pass (2ms) |
| **Inv #18** | Durable atomic state transitions & replay defense | `INTEGRATION-VERIFIED` | Pass (2ms) |
| **Inv #19** | Just-In-Time (JIT) authorization revalidation | `INTEGRATION-VERIFIED` | Pass (2ms) |
| **Inv #20** | Zero fake / simulated production success (`AUTH_NOT_CONFIGURED`) | `E2E-VERIFIED` | Pass (3ms) |
| **Inv #21** | Resumable upload session reconciliation | `INTEGRATION-VERIFIED` | Pass (2ms) |
| **Inv #22** | Scoped 11 content engines & `NO_VALID_VARIATION` exhaustion | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #23** | Exact script hash vs semantic repetition separation | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #24** | Packaging integrity (anti-keyword stuffing & spam tags) | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #25** | Structured remediation case contract | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #26** | DAG artifact lineage & cascade evidence invalidation | `UNIT-VERIFIED` | Pass (1ms) |
| **Inv #27** | Canonical test runner execution | `UNIT-VERIFIED` | Pass (0ms) |
| **Inv #28** | Truthful verification status tiers | `UNIT-VERIFIED` | Pass (0ms) |
| **Subtotal** | **28** | **28** | **0** | **~1.81s** |
| **Grand Total** | **56** | **56** | **0** | **100% Pass** |

---

## 3. Strict Verification Tier Classifications

In compliance with the mandate:
- `PRODUCTION-VERIFIED`: Reserved solely for live network executions with genuine Google OAuth production credentials. Because no live credentials were provided in the environment, the YouTube publication path is honestly marked `E2E-VERIFIED` with proof of fail-closed behavior (`AUTH_NOT_CONFIGURED`), and is **never** falsely claimed as `PRODUCTION-VERIFIED`.
- `SIMULATED`: Strictly isolated to `DryRunYouTubeProvider`.
- `DEAD-CODE`: Zero dead code in the F07 verification boundary.
- `LEGACY`: Former mock returns and bypassed publication routes have been replaced with strict cryptographic authorization checks.
