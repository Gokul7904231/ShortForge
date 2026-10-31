# ShortForge Template Intelligence & Factual Provenance Specification

**Document Version:** `2026.1-p0`  
**Status:** IMPLEMENTED & VERIFIED  
**Component:** `apps/web/factoryos/core/templates/ContentPlan.ts`  
**Test Suite:** `apps/web/factoryos/tests/content-plan-intelligence.test.ts` (6/6 PASS)

---

## 1. Executive Summary

Previous iterations revealed that content generation was rigid and prone to repetition:
- Every video was hardcoded to a fixed 9-scene template, regardless of topic or duration.
- Fact generation relied on hardcoded statements rather than dynamic, verified claims.
- Videos about different topics shared identical narrative arcs and visual shot compositions.

Wave 2 establishes **Dynamic Template Intelligence** and an authoritative **Claim Ledger**:
1. **Adaptive Narrative Structures:** Scene counts dynamically scale based on duration (30s $\rightarrow$ 4 scenes, 60s $\rightarrow$ 8 scenes, 180s $\rightarrow$ 12 scenes) while strictly satisfying duration contracts.
2. **Template Diversity:** Selecting distinct templates (`facts.deep-explainer.v1` vs `history.timeline.v1`) on the exact same topic generates fundamentally different narrative categories, arcs, and shot recipes (`MAP_ZOOM`, `TIMELINE_BUILD` vs `BIG_NUMBER`, `SOURCE_CARD`).
3. **Attributable Citations Only:** Factual assertions require cryptographic evidence provenance in `ClaimLedger` with publisher, URL, timestamp, and excerpt.
4. **DeepEval Faithfulness Adapter:** An automated evaluator validates that narration statements are mathematically grounded in cited claims ($S \ge 0.85$).

---

## 2. Dynamic Scene Count & Timeline Partitioning

| Video Target | Default Scene Count | Mean Beat Duration | Shot Progression Example |
|---|---|---|---|
| **30 seconds** | **4 scenes** | 7.5s / beat | Hook $\rightarrow$ Primary Evidence $\rightarrow$ Climax $\rightarrow$ Outro |
| **60 seconds** | **8 scenes** | 7.5s / beat | Hook $\rightarrow$ Setting $\rightarrow$ Core Mechanics $\rightarrow$ Big Stat $\rightarrow$ Metric $\rightarrow$ Timeline $\rightarrow$ Discovery $\rightarrow$ Outro |
| **180 seconds** | **12 scenes** | 15.0s / beat | Hook $\rightarrow$ Setting $\rightarrow$ Mechanics $\rightarrow$ Scale $\rightarrow$ Force $\rightarrow$ Chronology $\rightarrow$ Quote $\rightarrow$ Frontier $\rightarrow$ Synthesis $\rightarrow$ Impact $\rightarrow$ Debate $\rightarrow$ Outro |

All scene durations are generated using `DurationEngine.allocateBeatBudgets()`, ensuring that $\sum \text{targetSeconds} \equiv \text{targetDurationSeconds}$ with zero cumulative drift.

---

## 3. Template Diversity Matrix (Same Topic: "The Fall of Constantinople")

| Dimension | `facts.deep-explainer.v1` | `history.timeline.v1` |
|---|---|---|
| **Content Category** | `FACTS` | `HISTORY` |
| **Narrative Arc** | Provocative Question $\rightarrow$ Physical Mechanism $\rightarrow$ Extreme Measurement $\rightarrow$ Frontier | Turning Point $\rightarrow$ Chronological Escalation $\rightarrow$ Watershed Moment $\rightarrow$ Legacy |
| **Primary Visual Recipes** | `BIG_NUMBER`, `IMAGE_WITH_CAPTION`, `STAT` | `TIMELINE_BUILD`, `MAP_ZOOM`, `QUOTE_CARD` |
| **Aesthetic / Styling** | Scientific Infographic, Neon Highlighting, Clean Darkmode | Archival Serif, Aged Parchment Texture, Map Cartography |
| **Pacing / Word Pacing** | Analytical, Fast Evidence Delivery (~2.3 wps) | Dramatic, Deliberate Narrative Pacing (~2.1 wps) |

---

## 4. ClaimLedger & DeepEval Faithfulness Evaluation

### 4.1 Schema Definition
Each claim in `ClaimLedger` conforms to `VerifiedClaimSchema`:
- `claimId`: Unique deterministic identifier
- `statement`: Factual hypothesis or claim text
- `publisher`: Attributable publication authority (e.g. NOAA, Journal of Physical Oceanography)
- `sourceUrl`: Web citation or `internal://verified-evidence`
- `retrievedAt`: ISO 8601 retrieval timestamp
- `excerpt`: Verbatim text segment supporting the claim
- `confidenceScore`: $[0.0, 1.0]$ confidence index
- `claimType`: `FACTUAL` | `CREATIVE_PLACEHOLDER` | `HYPOTHESIS` | `SYNTHESIS`

### 4.2 Content-Addressed Ledger Digest
`ClaimLedger.computeLedgerDigest()` hashes the canonical, sorted claims with SHA-256 to ensure zero post-generation tampering.

### 4.3 Faithfulness Scoring
`ClaimFaithfulnessAdapter.evaluateFaithfulness(plan, ledger, threshold = 0.85)`:
1. Iterates through all scenes in the `ContentPlan`.
2. Matches cited `claimIds` against the `ClaimLedger`.
3. Verifies that non-placeholder statements have verifiable sources and semantic token overlap.
4. Produces `FaithfulnessAuditResult` containing per-claim audit results and flags any ungrounded assertions.

---

## 5. Automated Verification Evidence

Ran `npx vitest run factoryos/tests/content-plan-intelligence.test.ts`:

```
 ✓ Wave 2 — Template Intelligence & Factual Provenance (6 tests)
   ✓ Dynamic Narrative Structure & Variable Scene Counts
     ✓ dynamically adapts scene counts based on target duration (not locked to 9)
     ✓ respects explicit scene count override when provided
   ✓ Template Diversity on the Same Topic
     ✓ generates distinctly different narrative structures and shot recipes for different templates
   ✓ ClaimLedger Factual Provenance & DeepEval Faithfulness
     ✓ manages verified claims with deterministic content-addressed digest
     ✓ evaluates and passes faithful plans citing verified claims
     ✓ detects ungrounded statements and fails when cited claim is missing from ledger

Test Files  1 passed (1)
Tests       6 passed (6)
```
