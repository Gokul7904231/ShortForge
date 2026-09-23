# Research: Trend Intelligence & Daily Content Slate Generation

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/research/DailySlateGenerator.ts` & `apps/web/factoryos/core/research/ResearchRuntime.ts`

---

## 1. Architectural Philosophy: Demand-Driven Trend Synthesis

An autonomous video factory must not flood channels with repetitive, saturated, or low-interest content. At the same time, it must not fabricate arbitrary topics when market signals are quiet.

FactoryOS combines trend discovery and schedule requirements in the **Daily Slate Generator**:
1. **Dynamic Schedule Sizing**: Floor 00 ingests `ScheduleTargetRequirements` (e.g. produce 3 videos across AI and science niches) and computes required candidate volume dynamically.
2. **Thematic Clustering & Deduplication**: High-velocity search and social topics are clustered into semantic buckets, filtering out duplicate or overlapping angles.
3. **Saturation & Novelty Scoring**: Each topic is scored against historical channel publications and broader market saturation. Topics exceeding saturation thresholds are pruned.
4. **Honest Capacity Reporting**: If vetted, high-novelty topics fall short of the schedule's target, `DailySlateGenerator` outputs a partial slate with an explicit **capacity deficit report** rather than inventing fictional trends.

```
┌────────────────────────────────────────────────────────┐
│               ScheduleTargetRequirements               │
│         (Target Video Count: N, Niches, Formats)       │
└───────────────────────────┬────────────────────────────┘
                            │ Dynamic Capacity Ingestion
                            ▼
┌────────────────────────────────────────────────────────┐
│                  DailySlateGenerator                   │
│  ├── Ingest Raw Candidates from ReachSubsystem         │
│  ├── Deduplicate & Semantic Cluster                    │
│  ├── Calculate Novelty Score (vs Channel History)      │
│  ├── Filter: Saturation Score < Max Threshold          │
│  └── Match Top N Candidates with ResearchPassports     │
└───────────────────────────┬────────────────────────────┘
                            │ Daily Slate Output
                            ▼
┌────────────────────────────────────────────────────────┐
│                   DailyContentSlate                    │
│  ├── items: Array of Vetted Topic Items                │
│  ├── targetRequirementsMet: boolean                    │
│  └── unmetCapacityReason?: string (if deficit exists)  │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Slate Generation** | `DailySlateGenerator.ts` with explicit deficit reporting | Dynamic queue balancing across multiple competitive sister channels |
| **Saturation Scoring** | Vector similarity distance from past 30 days of channel scripts | Global cross-channel multi-platform saturation indexing in real-time |
| **Capacity Sizing** | Purely dynamic based on schedule requirements (no constants) | Predictive dynamic scheduling allocating more videos to exploding trends |
| **Topic Clustering** | Embedding-based DBSCAN / hierarchical agglomerative clustering | Continuous topic streaming graph clustering with automated title ideation |
| **Novelty Calibration**| Minimum cosine distance threshold against published archive | Multi-dimensional novelty scoring (angle, visual motif, audio hook) |

---

## 3. Slate Invariants & Safety Rules

- **Zero Trend Fabrication**: Under no circumstances may the generator invent topics out of thin air to fulfill a target count. If only 2 valid topics exist for a 3-video schedule, 2 videos are produced and an alert is logged.
- **Passport Required**: Every item included in a `DailyContentSlate` must have an associated `ResearchPassport` reference.
- **Novelty Floor**: Any candidate with a novelty score below 0.60 relative to the channel's recent 30-day production history is automatically rejected.
