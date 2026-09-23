# Research: Source Provenance, ResearchPassports & Fidelity Governance

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/contracts/ResearchPassportContracts.ts` & `apps/web/factoryos/core/research/`

---

## 1. Architectural Philosophy: The ResearchPassport Standard

In automated knowledge synthesis, citations cannot be vague strings or arbitrary URLs hallucinated by an LLM. Misattributed facts or fabricated source links compromise legal compliance, violate platform terms of service, and destroy viewer trust.

FactoryOS mandates that every factual assertion, trivia datapoint, and news topic ingested during Floor 00 must carry a **ResearchPassport**. A ResearchPassport is a cryptographically verifiable provenance record that certifies:
1. **Source Veracity**: The exact authenticated source URL, canonical domain name, and author identity.
2. **Temporal Validity**: Timestamp of initial retrieval and snapshot content hash.
3. **Fidelity Taxonomy**: Explicit classification of how every extracted metric was derived.
4. **Anti-Fabrication Check**: Rejection of synthetic placeholder domains (e.g., `example.com`, `fake-news.internal`) or broken links.

```
┌────────────────────────────────────────────────────────┐
│                    Research Extraction                 │
└───────────────────────────┬────────────────────────────┘
                            │ Emits Candidate
                            ▼
┌────────────────────────────────────────────────────────┐
│                    ResearchPassport                    │
├────────────────────────────────────────────────────────┤
│  passportId: "pass_01j8m..."                           │
│  sourceUrl: "https://verified-publisher.com/article"   │
│  canonicalDomain: "verified-publisher.com"             │
│  retrievedAt: 1718000000000                            │
│  contentSha256: "9f86d081884c7d659a2feaa0c55ad015..." │
│  domainReputationScore: 0.94                           │
│  measurementFidelity: "VERIFIED_FACT"                  │
├────────────────────────────────────────────────────────┤
│                       Evidence                         │
│  (Exact Quotations, Extracted Stats, Raw HTML Snippet) │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Provenance Tracking** | Strongly typed `ResearchPassport` in `ResearchPassportContracts.ts` | Decentralized timestamp attestation on public blockchain / certificate transparency logs |
| **Fidelity Taxonomy** | 5-level enum enforced across all research and script interfaces | Formal probabilistic Bayesian confidence calibration per extracted claim |
| **Domain Reputation** | Domain reputation lookup and URL syntax validation | Dynamic trust graph modeling source reliability based on historical correction rates |
| **Anti-Fabrication** | Automated rejection of mock URLs and placeholder domains | Live HTTP HEAD/GET connectivity probe with DNSSEC cryptographic validation |
| **Archival Snapshot** | Raw text excerpt caching in `KnowledgeOS` CAS | Full WARC (Web ARChive) snapshot preservation with cryptographic signing |

---

## 3. The 5-Level Measurement Fidelity Taxonomy

Defined in `ResearchPassportContracts.ts`:

```typescript
export type ResearchMeasurementFidelity = 
  | 'VERIFIED_FACT'          // Grounded in authoritative documentation or peer-reviewed source
  | 'OBSERVED_MEASUREMENT'   // Directly scraped or measured data point (e.g. view count, video duration)
  | 'MODEL_INFERENCE'        // Output derived via AI/LLM probabilistic reasoning
  | 'HEURISTIC_ESTIMATE'     // Rule-based or formulaic estimation (e.g. pacing prediction)
  | 'UNVERIFIED_ASSERTION';  // Raw claim requiring downstream verification prior to release
```

### Downstream Usage Invariants
- **Educational / Trivia Channels**: Floor 02 Scripting can only use facts tagged as `VERIFIED_FACT` or `OBSERVED_MEASUREMENT`.
- **Heuristic Containment**: Any metric tagged as `HEURISTIC_ESTIMATE` or `MODEL_INFERENCE` must never be presented to viewers or downstream models as an observed fact.
