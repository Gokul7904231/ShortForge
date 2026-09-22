# ShortForge / FactoryOS — F07 Final Architecture Map

## 1. System Overview & Executive Boundary Summary
The **F07 YouTube Monetization & Content Integrity Guardian** serves as the authoritative, fail-closed release boundary of ShortForge / FactoryOS.

```
[Production Pipeline / Floors 1-6]
                 │
                 ▼
[F07 Release Guardian] ── Evaluates G00 - G14 Gates (15 Total)
                 │     ── Multi-Clock Temporal Context
                 │     ── Content-Addressed Storage (CAS) Hash
                 │     ── Computes Monetization Readiness State
                 ▼
     [Verification Receipt] (Ed25519 Cryptographically Signed)
                 │
                 ▼
[Publication Authorization Service]
                 │     ── Binds to Canonical Sanitized Payload Hash
                 │     ── Issues Unforgeable ReleaseAuthorization Capability (Ed25519 Signed)
                 ▼
[Publisher Queue / Publishing Router]
                 │     ── Strict Ingress Guard: Rejects Any Missing/Tampered Authorization
                 │     ── JIT Revalidation immediately prior to remote side effect
                 ▼
[YouTube Provider / DryRun YouTube Provider]
                       ── Zero Simulated Success (Missing Credentials Fail Closed via AUTH_NOT_CONFIGURED)
                       ── Resumable Session Reconciliation
```

---

## 2. Core Subsystems & Component Locations

| Subsystem | Source Path | Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **F07 Release Contracts** | [`apps/web/factoryos/core/verification/youtube/contracts/F07ReleaseContracts.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/contracts/F07ReleaseContracts.ts) | `UNIT-VERIFIED` | Type assertions & contracts verified in invariant tests #1, #5, #16 |
| **F07 Cryptographic Engine** | [`apps/web/factoryos/core/verification/youtube/crypto/F07CryptoSigner.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/crypto/F07CryptoSigner.ts) | `UNIT-VERIFIED` | Ed25519 signing/verification & canonical serialization proven in invariant tests #14, #16 |
| **Evidence Ref Factory** | [`apps/web/factoryos/core/verification/youtube/evidence/EvidenceRef.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/evidence/EvidenceRef.ts) | `UNIT-VERIFIED` | Proven in `youtube-evidence-receipt.test.ts` and invariant test #13 |
| **Policy Source Registry** | [`apps/web/factoryos/core/verification/youtube/policy/PolicySourceRegistry.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/policy/PolicySourceRegistry.ts) | `UNIT-VERIFIED` | SHA-256 digests of official docs proven in invariant test #10 |
| **Temporal Policy Context** | [`apps/web/factoryos/core/verification/youtube/policy/PolicyEvaluationContext.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/policy/PolicyEvaluationContext.ts) | `UNIT-VERIFIED` | Multi-clock time routing proven in invariant test #11 and `youtube-policy-refresh.test.ts` |
| **Policy Activation Pipeline** | [`apps/web/factoryos/core/verification/youtube/policy/PolicyActivationPipeline.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/policy/PolicyActivationPipeline.ts) | `UNIT-VERIFIED` | Freshness, schema validation, and snapshot promotion proven in invariant test #4 |
| **Gates G00 - G14 (15 Gates)** | [`apps/web/factoryos/core/verification/youtube/gates/`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/gates/) | `UNIT-VERIFIED` | Proven across all 6 test suites and invariant tests #3, #6, #12, #23, #24 |
| **Effect Aggregator** | [`apps/web/factoryos/core/verification/youtube/gates/EffectAggregator.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/gates/EffectAggregator.ts) | `UNIT-VERIFIED` | Clean separation of upload safety, monetization readiness, advertiser suitability in invariant test #5 |
| **F07 Release Guardian** | [`apps/web/factoryos/core/verification/youtube/F07ReleaseGuardian.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/F07ReleaseGuardian.ts) | `INTEGRATION-VERIFIED` | Proven in `youtube-remediation.test.ts` test #4 and invariant tests #14, #15 |
| **Publication Authorization Service** | [`apps/web/publishing/authorization/PublicationAuthorizationService.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/publishing/authorization/PublicationAuthorizationService.ts) | `INTEGRATION-VERIFIED` | Ed25519 signature, canonical payload hash binding, atomic transitions, resumable session reconciliation, JIT revalidation in invariant tests #16, #17, #18, #19, #21 |
| **Publisher Queue & Ingress Gate** | [`apps/web/publishing/publisher-queue.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/publishing/publisher-queue.ts) | `INTEGRATION-VERIFIED` | Rejection of unauthorized publish jobs proven in invariant test #2 |
| **YouTube Production Provider** | [`apps/web/publishing/providers/youtube.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/publishing/providers/youtube.ts) | `E2E-VERIFIED` | Zero fake production success (`AUTH_NOT_CONFIGURED`), fail-closed authorization check, resumable session support in invariant tests #2, #20 |
| **DryRun YouTube Provider** | [`apps/web/publishing/providers/dryrun-youtube.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/publishing/providers/dryrun-youtube.ts) | `UNIT-VERIFIED` | Explicitly isolated simulation provider; passes JIT revalidation without polluting production path in invariant test #20 |
| **Artifact Lineage & Invalidation** | [`apps/web/factoryos/core/verification/youtube/remediation/ArtifactLineageGraph.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/factoryos/core/verification/youtube/remediation/ArtifactLineageGraph.ts) | `UNIT-VERIFIED` | DAG topological sort & cascade evidence invalidation proven in invariant test #26 |

---

## 3. The 15 Authoritative Verification Gates

| Gate ID | Gate Name | Evaluation Mode | Primary Risk Controlled |
| :--- | :--- | :--- | :--- |
| **G00** | Policy Freshness Gate | Deterministic | Stale/expired policy snapshot evaluation |
| **G01** | Channel Readiness Gate | Platform API / Hybrid | YPP status, 2FA, strikes, advanced features |
| **G02** | Community Guidelines Gate | Deterministic & Inferred | Safety, strikes, self-harm, hate, harassment |
| **G03** | Inauthentic Content Gate | Hybrid & AI Inferred | Channel repetition, semantic clustering, duplicate narration |
| **G04** | Repetitive / Reused Gate | Deterministic Probe | Exact script hash clones, template duplication |
| **G05** | Commercial Rights Gate | Deterministic | Missing audio/visual commercial usage licenses |
| **G06** | Advertiser Suitability Gate | Deterministic & Inferred | Yellow-dollar profanity, violence, sensitive topics |
| **G07** | Synthetic Media Disclosure Gate | Deterministic | AI transparency, realistic likeness disclosure |
| **G08** | Spam & Deception Gate | Deterministic & Inferred | Misleading hooks, thumbnail-title mismatch |
| **G09** | Engagement Automation Gate | Deterministic & Platform | Artificial views, engagement exchange schemes |
| **G10** | Metadata Packaging Gate | Deterministic & Hybrid | Keyword stuffing, tag spam, clickbait descriptions |
| **G11** | Factual Integrity Gate | Hybrid & Inferred | Hallucinated factual claims on high-risk topics |
| **G12** | Shorts Eligibility Gate | Deterministic Probe | 0 < duration <= 180s, vertical geometry (9:16/1:1), Sept 24 2026 Content ID rules |
| **G13** | Content Engine Scope Gate | Deterministic | Enforces strictly the 11 approved engines; rejects clipping |
| **G14** | Evidence Reconciliation Gate | Deterministic Cryptographic | Cross-gate evidence consistency & CAS hash verification |

---

## 4. Architectural Invariant Enforcement Summary
1. **CLAIM <= EVIDENCE**: Claims must map to cryptographic artifacts or deterministic measurements.
2. **NO VALID F07 RELEASE AUTHORIZATION = NO PUBLICATION**: The queue, the API route, and the YouTube providers fail closed without a signed active capability.
3. **POLICY AS DATA**: All YouTube policies are versioned JSON IR with official documentation content hashes.
4. **NO FAKE PRODUCTION SUCCESS**: The YouTube provider fails closed with `AUTH_NOT_CONFIGURED` if client secrets are missing.
