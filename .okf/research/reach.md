# Research: The Reach Engine & Social Intelligence Subsystem

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/research/ReachSubsystem.ts` & `apps/web/factoryos/core/integrations/AgentReachAdapter.ts`

---

## 1. Architectural Philosophy: Grounded Social Intelligence

In automated video creation, feeding an agent fabricated trends or hallucinated engagement metrics produces disconnected, irrelevant content. The Reach Engine operates as the sensory radar of FactoryOS, extracting real-world market signals, competitive content formats, and audience engagement curves from digital video platforms (YouTube Shorts, TikTok, Instagram Reels).

Under Project Ascalon and the architecture modernization, the Reach subsystem was refactored to eliminate mock-data leakage:
1. **Real Provider Boundary**: The `AgentReachAdapter` enforces strict real-world provider contracts. When external scrapers or headless browsers (e.g. Lightpanda) fail or are unavailable, the adapter reports an honest `503 UNAVAILABLE` status rather than returning synthetic placeholder URLs or fake trending lists.
2. **Deterministic Source Attribution**: Every extracted trend candidate must be backed by a verified URL, retrieval timestamp, author identity, and content digest stored in a `ResearchPassport`.
3. **Explicit Measurement Fidelity**: Metrics extracted by Reach are rigorously tagged (`OBSERVED_MEASUREMENT`, `MODEL_INFERENCE`, or `HEURISTIC_ESTIMATE`).

```
┌────────────────────────────────────────────────────────┐
│                   Digital Video Platforms              │
│            (YouTube Shorts, TikTok, Web Sources)       │
└───────────────────────────┬────────────────────────────┘
                            │ Scraped / Ingested via Browser
                            ▼
┌────────────────────────────────────────────────────────┐
│              Lightpanda / AgentReach Boundary          │
│  ├── Live Ingestion: Validates HTTP Status & Content   │
│  └── Failure Semantics: Returns UNAVAILABLE on Error   │
└───────────────────────────┬────────────────────────────┘
                            │ Raw Verified Web Signals
                            ▼
┌────────────────────────────────────────────────────────┐
│                     ReachSubsystem                     │
│  ├── Parse Candidates: Title, Creator, Engagement      │
│  ├── Tag Fidelity: OBSERVED_MEASUREMENT vs INFERENCE   │
│  └── Construct Immutable ResearchPassport Entity       │
└───────────────────────────┬────────────────────────────┘
                            │ Verified Topic Slate
                            ▼
┌────────────────────────────────────────────────────────┐
│            Floor 00 Market Analyst & Research          │
│      (Submits Curated Slate to Daily Content Engine)   │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Provider Boundary** | Real `AgentReachAdapter` with honest failure semantics and URL validation | Distributed headless browser cluster with automated anti-bot evasion & proxy rotation |
| **Data Integrity** | Cryptographic tagging of research candidates via `ResearchPassport` | Multi-node consensus verification over scraped view counts and engagement ratios |
| **Browser Execution** | `LightpandaBrowserAdapter` with graceful 503 fallback | Native Chromium / WebKit headless runner with GPU-accelerated video decoding |
| **Trend Scoring** | Mathematical engagement velocity scoring in `ReachSubsystem.ts` | Deep graph neural network modeling cross-platform meme propagation dynamics |
| **Capacity Management** | Dynamic quota sizing derived strictly from `ScheduleTargetRequirements` | Real-time backpressure shedding when provider rate limits are approached |

---

## 3. Operational Guarantees & Error Handling

- **No Synthetic Placeholders**: If external network access is blocked, Reach returns zero topics and marks the run status as `DEGRADED`.
- **Honest Health Reporting**: `ReachSubsystem.isHealthy()` evaluates live connectivity. It never reports `ONLINE` if the underlying headless browser or network adapter is failing.
- **Lineage Linkage**: Every trend finding emitted by Reach includes a parent `traceId` linking it to the scheduled mission.
