# ShortForge / FactoryOS — F07 Verification Matrix

## Authoritative 15-Gate Verification Matrix

| Gate ID | Gate Name | Verification Method | Input Signals | Failure Effect | Remediation Path | Status | Executable Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **G00** | Policy Freshness Gate | `DETERMINISTIC_PROBE` | Policy snapshot timestamp, retrievedAt, TTL | `BLOCK_PUBLICATION` | Fetch updated snapshot via PolicyActivationPipeline | `UNIT-VERIFIED` | `factoryos/tests/youtube-policy-refresh.test.ts` (Test #1), `f07-architectural-invariants.test.ts` (Inv #4) |
| **G01** | Channel Readiness Gate | `PLATFORM_API` / `HYBRID` | YPP status, 2FA, advanced features, strikes | `MONETIZATION_ELIGIBILITY`, `EXTERNAL_REVIEW` | Complete channel setup; does NOT block ordinary upload | `UNIT-VERIFIED` | `factoryos/tests/youtube-channel-audit.test.ts` (Tests #1-#5), `f07-architectural-invariants.test.ts` (Inv #6) |
| **G02** | Community Guidelines Gate | `DETERMINISTIC_PROBE` & `AI_INFERENCE` | Channel strikes, script toxicity, violence | `BLOCK_UPLOAD`, `BLOCK_PUBLICATION` | Script rewrite at Stage 02 | `UNIT-VERIFIED` | `factoryos/tests/youtube-channel-audit.test.ts` (Test #4), `f07-architectural-invariants.test.ts` (Inv #5) |
| **G03** | Inauthentic Content Gate | `HYBRID` | Channel history semantic similarity, variation matrix | `REPAIR_REQUIRED` | Apply VariationPlanner (Hook/Story rewrite) | `UNIT-VERIFIED` | `factoryos/tests/youtube-content-variation.test.ts` (Test #5), `f07-architectural-invariants.test.ts` (Inv #23) |
| **G04** | Repetitive / Reused Gate | `DETERMINISTIC_PROBE` | Exact SHA-256 script hash, audio bed fingerprint | `REPAIR_REQUIRED` / `BLOCKED` | Re-generate script variation; prohibit identical script reuse | `UNIT-VERIFIED` | `factoryos/tests/youtube-content-variation.test.ts` (Test #4), `f07-architectural-invariants.test.ts` (Inv #23) |
| **G05** | Commercial Rights Gate | `DETERMINISTIC_PROBE` | Commercial license token, track registry | `BLOCK_PUBLICATION`, `REPAIR_REQUIRED` | Replace claimed track with licensed/original bed | `UNIT-VERIFIED` | `factoryos/tests/youtube-policy-refresh.test.ts` (Test #4), `f07-architectural-invariants.test.ts` (Inv #5) |
| **G06** | Advertiser Suitability Gate | `DETERMINISTIC_PROBE` & `AI_INFERENCE` | Profanity timestamps, sensitive topics, ad rating | `LIMITED_ADS`, `REPAIR_REQUIRED` | Mute profanity or edit sensitive segments | `UNIT-VERIFIED` | `factoryos/tests/youtube-policy-engine.test.ts` (Test #5), `f07-architectural-invariants.test.ts` (Inv #5) |
| **G07** | Synthetic Media Disclosure Gate | `DETERMINISTIC_PROBE` | Realistically synthetic voice/face signals | `ADD_DISCLOSURE`, `REPAIR_REQUIRED` | Set `containsSyntheticMedia = true` in metadata | `UNIT-VERIFIED` | `factoryos/tests/youtube-policy-engine.test.ts` (Test #5), `f07-architectural-invariants.test.ts` (Inv #17) |
| **G08** | Spam & Deception Gate | `DETERMINISTIC_PROBE` & `AI_INFERENCE` | Title-thumbnail consistency, bait hooks | `BLOCK_PUBLICATION`, `REPAIR_REQUIRED` | Re-generate packaging and align hook narrative | `UNIT-VERIFIED` | `factoryos/tests/youtube-policy-engine.test.ts` (Test #5), `f07-architectural-invariants.test.ts` (Inv #24) |
| **G09** | Engagement Automation Gate | `PLATFORM_API` | Artificial engagement indicators | `BLOCK_PUBLICATION` | Cease automated engagement schemes | `UNIT-VERIFIED` | `factoryos/tests/youtube-policy-engine.test.ts` (Test #5), `f07-architectural-invariants.test.ts` (Inv #5) |
| **G10** | Metadata Packaging Gate | `DETERMINISTIC_PROBE` | Tag count, description keyword repetition | `REPAIR_REQUIRED` | Trim tags <= 15, remove keyword stuffing | `UNIT-VERIFIED` | `factoryos/tests/youtube-remediation.test.ts` (Test #1), `f07-architectural-invariants.test.ts` (Inv #24) |
| **G11** | Factual Integrity Gate | `HYBRID` | Factual claims count, verified claims count | `REPAIR_REQUIRED` | Ground claims against verified sources | `UNIT-VERIFIED` | `factoryos/tests/youtube-remediation.test.ts` (Test #1), `f07-architectural-invariants.test.ts` (Inv #25) |
| **G12** | Shorts Eligibility Gate | `DETERMINISTIC_PROBE` | Duration (0 < d <= 180s), aspect ratio (9:16/1:1), Content ID | `BLOCK_PUBLICATION`, `REPAIR_REQUIRED` | Re-render vertical geometry or trim audio bed | `UNIT-VERIFIED` | `factoryos/tests/youtube-policy-refresh.test.ts` (Tests #2, #3), `f07-architectural-invariants.test.ts` (Inv #12) |
| **G13** | Content Engine Scope Gate | `DETERMINISTIC_PROBE` | Engine ID against 11 approved engines | `BLOCK_PUBLICATION` | Route to approved engine; rejects clipping | `UNIT-VERIFIED` | `factoryos/tests/youtube-content-variation.test.ts` (Tests #1, #2), `f07-architectural-invariants.test.ts` (Inv #22) |
| **G14** | Evidence Reconciliation Gate | `DETERMINISTIC_PROBE` | Gate finding consistency, CAS hash matching | `BLOCK_PUBLICATION` | Re-run full deterministic probe pipeline | `UNIT-VERIFIED` | `factoryos/tests/youtube-evidence-receipt.test.ts` (Tests #1-#3), `f07-architectural-invariants.test.ts` (Inv #14, #15) |

---

## Monetization Readiness States & Allowed Transitions

```
                    ┌─────────────────────────┐
                    │      EVALUATION         │
                    └────────────┬────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           ▼                     ▼                     ▼
     [FULLY_ELIGIBLE]    [ELIGIBLE_WITH_RISK]    [NOT_YET_ELIGIBLE]
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 │
                                 ▼
                     [Can Request ReleaseAuth]
```

*Note: In non-YPP channels, status is `NOT_YET_ELIGIBLE` for ad-revenue sharing, but publication as `unlisted` or `public` remains authorized if content safety gates pass.*
